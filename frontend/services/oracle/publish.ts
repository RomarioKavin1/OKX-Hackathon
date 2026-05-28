/**
 * publish.ts — Oracle root publisher (Task 4.4)
 *
 * Builds and submits score, DNP, and payout Merkle roots to the ScoreOracle
 * contract for a given matchday.
 *
 * ⚠️  SIGNER-KEY GATE: This script calls ScoreOracle.submitRoot() and
 * ScoreOracle.submitPayoutRoot(), both of which are gated to the oracle signer
 * role on the deployed contract.  The PRIVATE_KEY configured in the repo-root
 * .env is the DEPLOYER key, NOT the oracle signer.  Sending these transactions
 * with that key will revert.  Configure PRIVATE_KEY to the oracle signer before
 * running publishMatchday() on-chain.
 *
 * DO NOT execute this file during CI or testing — it submits real transactions.
 *
 * Run manually (when signer key is configured):
 *   npx tsx services/oracle/publish.ts <matchday>
 *
 * ─── Score/DNP/Payout build flow ────────────────────────────────────────────
 * 1. Load committed lineups for `matchday` from Supabase (lineups table).
 * 2. Load match_events rows for the matchday; build eventsByPlayerId Map.
 * 3. For each tokenId across all lineups: fetch cardMeta (playerId, tier) from
 *    chain and staminaOf from GameRegistry; build cardCtx Map<bigint, CardContext>.
 * 4. computeLineupScore(lineup, eventsByPlayerId, cardCtx) → LineupScoreResult.
 * 5. scoreLeaf(wallet, matchday, scaledScore)
 *      where scaledScore = BigInt(Math.round(total * 1000))
 *      e.g. 16.5 pts → 16500n,  -3.0 pts → -3000n  (int256, can be negative)
 * 6. dnpLeaf(tokenId) for every tokenId that had 0 minutes in any committed lineup.
 * 7. buildMerkleTree(scoreLeaves) + buildMerkleTree(dnpLeaves) → scoreRoot / dnpRoot.
 * 8. submitScoreRoot(wallet, matchday, scoreRoot, dnpRoot)
 *      ABI: ScoreOracle.submitRoot(uint256 matchday, bytes32 scoreRoot, bytes32 dnpRoot)
 * 9. Per contest for the matchday:
 *    a. contestInfo(contestId) → { entryFee, rakeBps, minTier, pool }
 *    b. For each entrant: gather card tiers from cardCtx; isEligibleForContest(tiers, minTier)
 *       → ineligible entrants get score 0 (still included in ranking).
 *    c. net pool = pool - rake  (contestRake(pool, rakeBps).net)
 *    d. buildContestPayout(scoredEntrants, netPool) → ranked payout array.
 *    e. buildPayoutTree(payoutEntries) → payoutRoot + per-account proofs.
 *    f. submitPayoutRoot(wallet, contestId, root)
 *         ABI: ScoreOracle.submitPayoutRoot(uint256 contestId, bytes32 root)
 *    g. Persist rank/payout/proof per wallet to scores table.
 *    h. Mirror root into payout_roots table.
 * 10. Mirror scoreRoot/dnpRoot into score_roots table.
 */

import { config } from "dotenv";
import { resolve } from "node:path";
import type { Address } from "viem";
import type { MatchEvents } from "@/lib/types";
import { Tier } from "@/lib/types";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getScriptWalletClient } from "@/lib/clients";
import { cardMeta, staminaOf } from "@/lib/actions/reads";
import { submitScoreRoot, submitPayoutRoot, waitFor } from "@/lib/actions/writes";
import { computeLineupScore, type CardContext } from "./score";
import {
  isDNP,
  buildScoreRoot,
  buildDnpRoot,
  buildContestPayoutRoot,
} from "./roots";
import type { ScoredEntrant } from "@/lib/business/contest";
import { isEligibleForContest } from "@/lib/business/lineup";

// ─────────────────────────────────────────────────────────────────────────────
// Types for Supabase row shapes (partial — only fields we use)
// ─────────────────────────────────────────────────────────────────────────────

interface LineupRow {
  matchday: number;
  wallet: string;
  token_ids: string[];   // numeric(78,0) stored as strings by the JS driver
  formation: number;
  captain_idx: number;
  vice_idx: number;
  chip_id: number;
  committed_block: number;
}

interface MatchEventRow {
  matchday: number;
  fixture_id: number;
  player_key: string;   // this is the playerId (bytes32 hex string)
  events: MatchEvents;
}

interface ContestRow {
  contest_id: string;   // numeric(78,0)
  matchday: number;
  entry_fee: string;
  rake_bps: number;
  min_tier: number;
  pool: string;
  rake_taken: boolean;
}

interface ContestEntryRow {
  contest_id: string;
  wallet: string;
  entered_block: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main publish function
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build and publish score/DNP/payout Merkle roots for `matchday`.
 *
 * Requires PRIVATE_KEY env var to be the oracle signer.  If the key is not
 * the signer role, the on-chain calls will revert.
 */
export async function publishMatchday(matchday: number): Promise<void> {
  const pk = process.env.PRIVATE_KEY as `0x${string}` | undefined;
  if (!pk) throw new Error("PRIVATE_KEY (0x-prefixed) not set in env");

  const wallet = getScriptWalletClient(pk);
  const db = supabaseAdmin();

  console.log(`[publish] matchday=${matchday}`);

  // ── 1. Load committed lineups ───────────────────────────────────────────────
  const { data: lineupRows, error: lineupErr } = await db
    .from("lineups")
    .select("*")
    .eq("matchday", matchday);
  if (lineupErr) throw new Error(`lineups query: ${lineupErr.message}`);
  if (!lineupRows || lineupRows.length === 0) {
    console.warn(`[publish] No committed lineups for matchday ${matchday} — nothing to publish.`);
    return;
  }
  const lineups = lineupRows as LineupRow[];
  console.log(`[publish] ${lineups.length} lineups loaded`);

  // ── 2. Load match_events → eventsByPlayerId Map ─────────────────────────────
  const { data: eventRows, error: evtErr } = await db
    .from("match_events")
    .select("*")
    .eq("matchday", matchday);
  if (evtErr) throw new Error(`match_events query: ${evtErr.message}`);

  const eventsByPlayerId = new Map<`0x${string}`, MatchEvents>();
  for (const row of (eventRows ?? []) as MatchEventRow[]) {
    // player_key is the playerId (bytes32 hex, e.g. "0xabc...")
    const pid = row.player_key as `0x${string}`;
    eventsByPlayerId.set(pid, row.events as MatchEvents);
  }

  // ── 3. Build cardCtx (on-chain per tokenId) ─────────────────────────────────
  // Collect every unique tokenId across all lineups
  const allTokenIds = new Set<bigint>();
  for (const row of lineups) {
    for (const t of row.token_ids) allTokenIds.add(BigInt(t));
  }

  const cardCtx = new Map<bigint, CardContext>();
  await Promise.all(
    Array.from(allTokenIds).map(async (tokenId) => {
      const [meta, stamina] = await Promise.all([
        cardMeta(tokenId),
        staminaOf(tokenId),
      ]);
      cardCtx.set(tokenId, {
        playerId: meta.playerId as `0x${string}`,
        tier: meta.tier,
        stamina,
      });
    }),
  );
  console.log(`[publish] cardCtx built for ${cardCtx.size} unique tokenIds`);

  // ── 4 + 5. Score each lineup; build score + DNP leaves ─────────────────────
  const ZERO_EVENTS: MatchEvents = {
    goals: 0, assists: 0, cleanSheet: false, tackles: 0, keyPasses: 0,
    saves: 0, penaltiesSaved: 0, manOfTheMatch: false, played60: false,
    yellowCards: 0, redCards: 0, ownGoals: 0, penaltiesMissed: 0,
    goalsConceded: 0, minutes: 0,
  };

  // wallet → total score (float)
  const walletScores = new Map<string, number>();
  // tokenIds with 0 minutes in any lineup → DNP set
  const dnpTokenIds = new Set<bigint>();

  for (const row of lineups) {
    const lineup = {
      matchday: Number(row.matchday),
      wallet: row.wallet as Address,
      tokenIds: row.token_ids.map((t) => BigInt(t)),
      formation: row.formation,
      captainIdx: row.captain_idx,
      viceIdx: row.vice_idx,
      chipId: row.chip_id as import("@/lib/types").ChipId,
    };

    const result = computeLineupScore(lineup, eventsByPlayerId, cardCtx);
    walletScores.set(row.wallet.toLowerCase(), result.total);

    // Tag each tokenId that DNP'd (isDNP: !played60 && minutes===0)
    for (const tokenId of lineup.tokenIds) {
      const ctx = cardCtx.get(tokenId);
      if (!ctx) continue;
      const events = eventsByPlayerId.get(ctx.playerId) ?? ZERO_EVENTS;
      if (isDNP(events)) {
        dnpTokenIds.add(tokenId);
      }
    }
  }

  // ── 6. Build score tree ─────────────────────────────────────────────────────
  const scoreRoot = buildScoreRoot(
    Array.from(walletScores.entries()).map(([wallet, total]) => ({ wallet, total })),
    matchday,
  );

  // ── 7. Build DNP tree (may be empty → EMPTY_DNP_SENTINEL in roots.ts) ───────
  const dnpRoot = buildDnpRoot(Array.from(dnpTokenIds));

  console.log(`[publish] scoreRoot=${scoreRoot}`);
  console.log(`[publish] dnpRoot=${dnpRoot} (${dnpTokenIds.size} DNP tokenIds)`);

  // ── 8. submitScoreRoot(wallet, matchday, scoreRoot, dnpRoot) ─────────────────
  // ABI: ScoreOracle.submitRoot(uint256 matchday, bytes32 scoreRoot, bytes32 dnpRoot)
  // writes.ts: submitScoreRoot(wallet, matchday, scoreRoot, dnpRoot)
  const scoreTx = await submitScoreRoot(wallet, matchday, scoreRoot, dnpRoot);
  const scoreReceipt = await waitFor(scoreTx);
  console.log(`[publish] submitScoreRoot mined in block ${scoreReceipt.blockNumber} (${scoreReceipt.status})`);

  // Mirror to score_roots table
  await db.from("score_roots").upsert({
    matchday,
    score_root: scoreRoot,
    dnp_root: dnpRoot,
    finalized_block: Number(scoreReceipt.blockNumber),
  });

  // ── 9. Per-contest payout roots ─────────────────────────────────────────────
  const { data: contestRows, error: contestErr } = await db
    .from("contests")
    .select("*")
    .eq("matchday", matchday);
  if (contestErr) throw new Error(`contests query: ${contestErr.message}`);

  for (const contestRow of (contestRows ?? []) as ContestRow[]) {
    const contestId = BigInt(contestRow.contest_id);
    const minTier = contestRow.min_tier as Tier;

    console.log(`[publish] processing contest ${contestId}`);

    // Load entrants for this contest
    const { data: entryRows, error: entryErr } = await db
      .from("contest_entries")
      .select("*")
      .eq("contest_id", contestRow.contest_id);
    if (entryErr) throw new Error(`contest_entries query: ${entryErr.message}`);
    const entries = (entryRows ?? []) as ContestEntryRow[];

    if (entries.length === 0) {
      console.warn(`[publish] contest ${contestId} has no entrants — skipping`);
      continue;
    }

    // ── 9a. Eligibility filter + score assignment ───────────────────────────
    // Build raw ScoredEntrant array (with scores) for each entry, then pass
    // through eligibleEntrants() (from roots.ts) which zeroes ineligible ones.
    const rawEntrants: ScoredEntrant[] = entries.map((entry) => {
      const walletLower = entry.wallet.toLowerCase();
      const lineupRow = lineups.find(
        (l) => l.wallet.toLowerCase() === walletLower,
      );
      return {
        wallet: entry.wallet as Address,
        total: walletScores.get(walletLower) ?? 0,
        enteredBlock: entry.entered_block,
        _lineupRow: lineupRow, // stash for eligibility check below
      } as ScoredEntrant & { _lineupRow: typeof lineupRow };
    });

    // Apply eligibility gate: entrants without a qualifying lineup get score 0.
    const scoredEntrants: ScoredEntrant[] = rawEntrants.map((e) => {
      const ext = e as ScoredEntrant & { _lineupRow: LineupRow | undefined };
      if (!ext._lineupRow) {
        return { wallet: e.wallet, total: 0, enteredBlock: e.enteredBlock };
      }
      const cardTiers: Tier[] = ext._lineupRow.token_ids.map((tid: string) => {
        const ctx = cardCtx.get(BigInt(tid));
        return ctx ? ctx.tier : Tier.Common;
      });
      const eligible = isEligibleForContest(cardTiers, minTier);
      return { wallet: e.wallet, total: eligible ? e.total : 0, enteredBlock: e.enteredBlock };
    });

    // ── 9b–e. Compute payout root via shared helper (same as verifier) ────────
    const pool = BigInt(contestRow.pool);
    const { payoutRoot, ranked, claims } = buildContestPayoutRoot(
      scoredEntrants,
      pool,
      contestRow.rake_bps,
    );

    const claimMap = new Map(
      claims.map((c) => [c.account.toLowerCase(), c]),
    );

    // ── 9f. submitPayoutRoot(wallet, contestId, root) ────────────────────────
    // ABI: ScoreOracle.submitPayoutRoot(uint256 contestId, bytes32 root)
    // writes.ts: submitPayoutRoot(wallet, contestId, root)
    const payoutTx = await submitPayoutRoot(wallet, contestId, payoutRoot);
    const payoutReceipt = await waitFor(payoutTx);
    console.log(
      `[publish] contest ${contestId}: submitPayoutRoot mined in block ${payoutReceipt.blockNumber}`,
    );

    // ── 9g. Persist ranks/payouts/proofs to scores ────────────────────────
    const scoreUpserts = ranked.map((r) => {
      const wLower = r.wallet.toLowerCase();
      const claim = claimMap.get(wLower);
      return {
        matchday,
        wallet: r.wallet.toLowerCase(),
        contest_id: contestRow.contest_id,
        score: walletScores.get(wLower) ?? 0,
        rank: r.rank,
        payout: r.amount.toString(),
        proof: claim ? claim.proof : [],
      };
    });
    if (scoreUpserts.length > 0) {
      const { error: scoresErr } = await db
        .from("scores")
        .upsert(scoreUpserts);
      if (scoresErr)
        console.error(`[publish] scores upsert error: ${scoresErr.message}`);
    }

    // ── 9h. Mirror root into payout_roots ────────────────────────────────
    await db.from("payout_roots").upsert({
      contest_id: contestRow.contest_id,
      root: payoutRoot,
      finalized_block: Number(payoutReceipt.blockNumber),
    });
  }

  console.log(`[publish] matchday ${matchday} complete.`);
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI entry point: `npx tsx services/oracle/publish.ts <matchday>`
// ─────────────────────────────────────────────────────────────────────────────

if (
  typeof process !== "undefined" &&
  process.argv[1] !== undefined &&
  // ESM: import.meta.url check isn't possible under tsx's CommonJS shim, so we
  // match the script path directly.  This block only runs when this file is the
  // main script, not when it's imported as a module.
  (process.argv[1].endsWith("publish.ts") || process.argv[1].endsWith("publish.js"))
) {
  // Load repo-root .env (PRIVATE_KEY, SUPABASE_* etc.)
  config({ path: resolve(process.cwd(), "../.env") });

  const arg = process.argv[2];
  const matchday = arg ? parseInt(arg, 10) : NaN;
  if (isNaN(matchday) || matchday < 1) {
    console.error("Usage: npx tsx services/oracle/publish.ts <matchday>");
    console.error("  matchday must be a positive integer");
    process.exit(1);
  }

  publishMatchday(matchday).catch((e) => {
    console.error("[publish] fatal:", e);
    process.exit(1);
  });
}
