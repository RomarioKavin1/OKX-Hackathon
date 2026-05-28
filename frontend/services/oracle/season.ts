/**
 * season.ts — Season aggregation + root publisher (Task 7.1)
 *
 * Aggregates every wallet's per-matchday scores across ALL Cup matchdays,
 * applies the season prize policy, builds the season payout Merkle tree, and
 * submits it via ScoreOracle.submitSeasonRoot().
 *
 * ── Season prize policy ──────────────────────────────────────────────────────
 *
 *  Pool source: 2% of EVERY contest's gross pool is set aside as the season rake.
 *  Distribution: top-100 wallets by cumulative season score.
 *    Rank 1 is designated "ceremonial Unique" (largest share per §5.2 weights).
 *    Ranks 2–100 receive payouts proportional to the §5.2 contest curve weights,
 *    normalized so the full season pool is distributed exactly.
 *
 *  Tie-break (fully deterministic):
 *    1. cumulative score descending
 *    2. earliest matchday-1 committed_block ascending (proxy for "first player")
 *    3. wallet address ascending (lowercased)
 *
 * ── On-chain gate ────────────────────────────────────────────────────────────
 *  ScoreOracle.submitSeasonRoot is gated to the oracle/owner key.
 *  PRIVATE_KEY in the repo-root .env MUST be the oracle signer; otherwise the
 *  transaction will revert.  This script never runs in CI.
 *
 * ── Persistence ─────────────────────────────────────────────────────────────
 *  After building the tree, each wallet's season rank + proof + payout amount
 *  is upserted into the `scores` table with matchday=-1 (sentinel for "season")
 *  and contest_id='season'.  The /api/season route reads from this projection.
 *
 * Run manually:
 *   npx tsx services/oracle/season.ts
 */

import { config } from "dotenv";
import { resolve } from "node:path";
import type { Address } from "viem";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getScriptWalletClient } from "@/lib/clients";
import { submitSeasonRoot, waitFor } from "@/lib/actions/writes";
import { buildPayoutTree } from "@/lib/business/merkle";
import { prizeCurve } from "@/lib/business/contest";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/** Sentinel matchday stored in the `scores` table for the season aggregate. */
export const SEASON_MATCHDAY_SENTINEL = -1;
/** Sentinel contest_id stored in the `scores` table for the season aggregate. */
export const SEASON_CONTEST_ID = "season";
/** Number of paid season ranks (top-100). */
const SEASON_PAID_RANKS = 100;
/** Season rake percentage: 2% of each contest's gross pool funds the season pool. */
const SEASON_RAKE_BPS = 200;
const BPS_DENOMINATOR = 10_000n;

// ─────────────────────────────────────────────────────────────────────────────
// Supabase row types (only fields we need)
// ─────────────────────────────────────────────────────────────────────────────

interface ScoreRow {
  matchday: number;
  wallet: string;
  score: number | string;
  contest_id: string;
}

interface ContestRow {
  contest_id: string;
  pool: string;
  rake_bps: number;
}

interface LineupRow {
  matchday: number;
  wallet: string;
  committed_block: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// aggregateSeason
// ─────────────────────────────────────────────────────────────────────────────

export interface SeasonEntry {
  wallet: Address;
  cumulativeScore: number;
  rank: number;
  amount: bigint;
  proof: string[];
  /** committed_block from the wallet's matchday-1 lineup (earliest matchday proxy) */
  firstCommittedBlock: number;
}

/**
 * Aggregate every wallet's cumulative season score from the `scores` table.
 *
 * Steps:
 *  1. Load all score rows (matchday != -1 to exclude any prior season aggregates).
 *  2. Sum per wallet → cumulativeScore.
 *  3. Compute season pool = Σ over all contests: floor(pool × SEASON_RAKE_BPS / 10000).
 *  4. Rank top-100; apply prizeCurve(seasonPool, SEASON_PAID_RANKS).
 *  5. Build payout tree → payoutLeaf(wallet, amount).
 *  6. submitSeasonRoot(walletClient, root).
 *  7. Persist to scores table (matchday=-1, contest_id='season').
 */
export async function aggregateSeason(): Promise<{
  root: string;
  entries: SeasonEntry[];
  seasonPool: bigint;
}> {
  const pk = process.env.PRIVATE_KEY as `0x${string}` | undefined;
  if (!pk) throw new Error("PRIVATE_KEY (0x-prefixed) not set in env");

  const wallet = getScriptWalletClient(pk);
  const db = supabaseAdmin();

  console.log("[season] loading scores…");

  // ── 1. Load all real-matchday scores ──────────────────────────────────────
  const { data: scoreRows, error: scoreErr } = await db
    .from("scores")
    .select("matchday, wallet, score, contest_id")
    .neq("matchday", SEASON_MATCHDAY_SENTINEL);
  if (scoreErr) throw new Error(`scores query: ${scoreErr.message}`);
  if (!scoreRows || scoreRows.length === 0) {
    throw new Error("[season] No scores found — run publish for at least one matchday first.");
  }
  const rows = scoreRows as ScoreRow[];

  // ── 2. Sum scores per wallet ───────────────────────────────────────────────
  const walletScores = new Map<string, number>();
  for (const row of rows) {
    const w = row.wallet.toLowerCase();
    const s = typeof row.score === "number" ? row.score : parseFloat(String(row.score));
    walletScores.set(w, (walletScores.get(w) ?? 0) + s);
  }
  console.log(`[season] ${walletScores.size} unique wallets aggregated`);

  // ── 3. Compute season pool: 2% of every contest's gross pool ──────────────
  const { data: contestRows, error: contestErr } = await db
    .from("contests")
    .select("contest_id, pool, rake_bps");
  if (contestErr) throw new Error(`contests query: ${contestErr.message}`);

  let seasonPool = 0n;
  for (const c of (contestRows ?? []) as ContestRow[]) {
    const grossPool = BigInt(c.pool);
    const rakeAmount = (grossPool * BigInt(SEASON_RAKE_BPS)) / BPS_DENOMINATOR;
    seasonPool += rakeAmount;
  }
  console.log(`[season] season pool = ${seasonPool} (${(contestRows ?? []).length} contests)`);

  // ── 4. Rank wallets by cumulativeScore (descending) + tie-break ─────────────
  // Load committed_block for matchday-1 lineups (earliest-matchday tie-break)
  const minMatchday = Math.min(...rows.map((r) => r.matchday));
  const { data: lineupRows } = await db
    .from("lineups")
    .select("matchday, wallet, committed_block")
    .eq("matchday", minMatchday);
  const firstBlockMap = new Map<string, number>();
  for (const l of (lineupRows ?? []) as LineupRow[]) {
    firstBlockMap.set(l.wallet.toLowerCase(), l.committed_block);
  }

  const sorted = Array.from(walletScores.entries())
    .map(([wallet, cumulativeScore]) => ({
      wallet: wallet as Address,
      cumulativeScore,
      firstCommittedBlock: firstBlockMap.get(wallet) ?? Number.MAX_SAFE_INTEGER,
    }))
    .sort((a, b) => {
      if (b.cumulativeScore !== a.cumulativeScore) return b.cumulativeScore - a.cumulativeScore;
      if (a.firstCommittedBlock !== b.firstCommittedBlock)
        return a.firstCommittedBlock - b.firstCommittedBlock;
      if (a.wallet.toLowerCase() < b.wallet.toLowerCase()) return -1;
      if (a.wallet.toLowerCase() > b.wallet.toLowerCase()) return 1;
      return 0;
    });

  const paid = Math.min(SEASON_PAID_RANKS, sorted.length);
  const payoutAmounts: bigint[] = seasonPool > 0n && paid > 0
    ? prizeCurve(seasonPool, paid)
    : Array(paid).fill(0n);

  // Pad to full sorted length (wallets outside top-100 get 0n)
  const amounts: bigint[] = sorted.map((_, i) =>
    i < payoutAmounts.length ? payoutAmounts[i] : 0n,
  );

  // ── 5. Build payout tree ───────────────────────────────────────────────────
  const payableEntries = sorted
    .map((e, i) => ({ account: e.wallet, amount: amounts[i] }))
    .filter((e) => e.amount > 0n);

  if (payableEntries.length === 0) {
    // Sentinel: build a dummy tree (season pool is zero — nothing minted yet)
    payableEntries.push({
      account: "0x0000000000000000000000000000000000000001" as Address,
      amount: 0n,
    });
  }

  const { root, claims } = buildPayoutTree(payableEntries);
  const claimMap = new Map(claims.map((c) => [c.account.toLowerCase(), c]));

  console.log(`[season] merkle root = ${root}`);

  // ── 6. submitSeasonRoot(wallet, root) ─────────────────────────────────────
  // writes.ts: submitSeasonRoot(wallet: WalletClient, root: Hex, from?: Address)
  // ABI: ScoreOracle.submitSeasonRoot(bytes32 root)
  const tx = await submitSeasonRoot(wallet, root as `0x${string}`);
  const receipt = await waitFor(tx);
  console.log(`[season] submitSeasonRoot mined in block ${receipt.blockNumber} (${receipt.status})`);

  // ── 7. Persist ranks/proofs to scores (matchday=-1, contest_id='season') ───
  const entries: SeasonEntry[] = sorted.map((e, i) => {
    const claim = claimMap.get(e.wallet.toLowerCase());
    return {
      wallet: e.wallet,
      cumulativeScore: e.cumulativeScore,
      rank: i + 1,
      amount: amounts[i],
      proof: claim ? (claim.proof as string[]) : [],
      firstCommittedBlock: e.firstCommittedBlock,
    };
  });

  const upserts = entries.map((e) => ({
    matchday: SEASON_MATCHDAY_SENTINEL,
    wallet: e.wallet.toLowerCase(),
    contest_id: SEASON_CONTEST_ID,
    score: e.cumulativeScore,
    rank: e.rank,
    payout: e.amount.toString(),
    proof: e.proof,
  }));

  if (upserts.length > 0) {
    const { error: upsertErr } = await db.from("scores").upsert(upserts);
    if (upsertErr) console.error(`[season] scores upsert error: ${upsertErr.message}`);
    else console.log(`[season] persisted ${upserts.length} season entries`);
  }

  return { root, entries, seasonPool };
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI entry point: `npx tsx services/oracle/season.ts`
// ─────────────────────────────────────────────────────────────────────────────

if (
  typeof process !== "undefined" &&
  process.argv[1] !== undefined &&
  (process.argv[1].endsWith("season.ts") || process.argv[1].endsWith("season.js"))
) {
  // Load repo-root .env (PRIVATE_KEY, SUPABASE_* etc.)
  config({ path: resolve(process.cwd(), "../.env") });

  aggregateSeason()
    .then(({ root, entries, seasonPool }) => {
      console.log(`[season] done. root=${root} pool=${seasonPool} entries=${entries.length}`);
      console.log(`[season] top-3:`);
      entries.slice(0, 3).forEach((e) =>
        console.log(`  #${e.rank} ${e.wallet} score=${e.cumulativeScore.toFixed(3)} payout=${e.amount}`),
      );
    })
    .catch((e) => {
      console.error("[season] fatal:", e);
      process.exit(1);
    });
}
