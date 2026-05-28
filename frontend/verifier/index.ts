/**
 * verifier/index.ts — Public verifier CLI (Task 4.5)
 *
 * Trust property: recomputes score/DNP/payout Merkle roots from ONLY public data
 * (Supabase anon key + publicClient read — no service-role key, no private key)
 * and asserts the recomputed roots EQUAL what is on-chain in ScoreOracle.
 *
 * Usage:
 *   tsx verifier/index.ts <matchday>
 *
 * The verify() function is also importable for programmatic use.
 *
 * On-chain reads:
 *   ScoreOracle.roots(matchday)       → score root (bytes32)
 *   ScoreOracle.dnpRoots(matchday)    → DNP root (bytes32)
 *   ScoreOracle.payoutRoots(contestId)→ payout root (bytes32)  [one per contest on this matchday]
 *
 * Recomputation pipeline (identical to oracle, Task 4.2):
 *   1. Pull match_events rows (Supabase public) → Map<playerId, MatchEvents>
 *   2. Pull lineups rows (Supabase public) → Lineup[]
 *   3. Pull cards rows (Supabase public) → Map<tokenId, CardContext>
 *   4. Pull contests + contest_entries rows (Supabase public)
 *   5. Pull stamina (publicClient) for each tokenId in each lineup
 *   6. Compute per-lineup scores via computeLineupScore() (same code as oracle)
 *   7. Build score/DNP leaves + tree via shared helpers from services/oracle/roots.ts
 *   8. Build payout trees via buildContestPayoutRoot from services/oracle/roots.ts
 *   9. Assert recomputed roots === on-chain roots; print PASS/FAIL per root
 */

import { config } from "dotenv";
import { resolve } from "node:path";
import type { Address, Hex } from "viem";

// Load Supabase URL + anon key from frontend .env.local / repo-root .env (no private key needed)
config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), "../.env") });

import { supabaseAnonServer } from "@/lib/supabase/server";
import { publicClient } from "@/lib/clients";
import { ADDRESSES } from "@/lib/contracts/addresses";
import { ScoreOracleAbi } from "@/lib/abis/ScoreOracle";
import { ChipId, Tier, type Lineup, type MatchEvents } from "@/lib/types";
import { computeLineupScore, type CardContext } from "@/services/oracle/score";
import {
  isDNP,
  buildScoreRoot,
  buildDnpRoot,
  buildContestPayoutRoot,
} from "@/services/oracle/roots";
import { isEligibleForContest } from "@/lib/business/lineup";
import { staminaOf } from "@/lib/actions/reads";

// ---------------------------------------------------------------------------
// On-chain root reads (publicClient only — no signer required)
// ---------------------------------------------------------------------------

async function onChainScoreRoot(matchday: number): Promise<Hex> {
  return publicClient.readContract({
    address: ADDRESSES.ScoreOracle,
    abi: ScoreOracleAbi,
    functionName: "roots",
    args: [BigInt(matchday)],
  });
}

async function onChainDnpRoot(matchday: number): Promise<Hex> {
  return publicClient.readContract({
    address: ADDRESSES.ScoreOracle,
    abi: ScoreOracleAbi,
    functionName: "dnpRoots",
    args: [BigInt(matchday)],
  });
}

async function onChainPayoutRoot(contestId: bigint): Promise<Hex> {
  return publicClient.readContract({
    address: ADDRESSES.ScoreOracle,
    abi: ScoreOracleAbi,
    functionName: "payoutRoots",
    args: [contestId],
  });
}

// ---------------------------------------------------------------------------
// Supabase data helpers (anon key — public data only)
// ---------------------------------------------------------------------------

interface MatchEventRow {
  player_key: string;
  events: MatchEvents;
}

interface LineupRow {
  wallet: string;
  token_ids: string[];
  formation: number;
  captain_idx: number;
  vice_idx: number;
  chip_id: number;
  committed_block: number;
}

interface CardRow {
  token_id: string;
  player_id: string;
  tier: number;
}

interface ContestRow {
  contest_id: string;
  matchday: number;
  entry_fee: string;
  rake_bps: number;
  min_tier: number;   // required: eligibility gate
  pool: string;
  rake_taken: boolean;
}

interface ContestEntryRow {
  contest_id: string;
  wallet: string;
  entered_block: number;
}

async function fetchMatchEvents(supabase: ReturnType<typeof supabaseAnonServer>, matchday: number): Promise<Map<string, MatchEvents>> {
  const { data, error } = await supabase
    .from("match_events")
    .select("player_key, events")
    .eq("matchday", matchday);

  if (error) throw new Error(`match_events fetch failed: ${error.message}`);
  const map = new Map<string, MatchEvents>();
  for (const row of (data as MatchEventRow[]) ?? []) {
    map.set(row.player_key, row.events as MatchEvents);
  }
  return map;
}

async function fetchLineups(supabase: ReturnType<typeof supabaseAnonServer>, matchday: number): Promise<LineupRow[]> {
  const { data, error } = await supabase
    .from("lineups")
    .select("wallet, token_ids, formation, captain_idx, vice_idx, chip_id, committed_block")
    .eq("matchday", matchday);

  if (error) throw new Error(`lineups fetch failed: ${error.message}`);
  return (data as LineupRow[]) ?? [];
}

async function fetchCards(supabase: ReturnType<typeof supabaseAnonServer>, tokenIds: bigint[]): Promise<Map<bigint, CardRow>> {
  if (tokenIds.length === 0) return new Map();
  // Supabase numeric(78,0) stored as string; filter by string list
  const idStrs = tokenIds.map((t) => t.toString());
  const { data, error } = await supabase
    .from("cards")
    .select("token_id, player_id, tier")
    .in("token_id", idStrs);

  if (error) throw new Error(`cards fetch failed: ${error.message}`);
  const map = new Map<bigint, CardRow>();
  for (const row of (data as CardRow[]) ?? []) {
    map.set(BigInt(row.token_id), row);
  }
  return map;
}

async function fetchContests(supabase: ReturnType<typeof supabaseAnonServer>, matchday: number): Promise<ContestRow[]> {
  const { data, error } = await supabase
    .from("contests")
    .select("contest_id, matchday, entry_fee, rake_bps, min_tier, pool, rake_taken")
    .eq("matchday", matchday);

  if (error) throw new Error(`contests fetch failed: ${error.message}`);
  return (data as ContestRow[]) ?? [];
}

async function fetchContestEntries(supabase: ReturnType<typeof supabaseAnonServer>, contestId: string): Promise<ContestEntryRow[]> {
  const { data, error } = await supabase
    .from("contest_entries")
    .select("contest_id, wallet, entered_block")
    .eq("contest_id", contestId);

  if (error) throw new Error(`contest_entries fetch failed: ${error.message}`);
  return (data as ContestEntryRow[]) ?? [];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hex2(h: Hex): string {
  return h.toLowerCase();
}

function pass(label: string, recomputed: Hex, onchain: Hex): boolean {
  const ok = hex2(recomputed) === hex2(onchain);
  const status = ok ? "PASS" : "FAIL";
  console.log(`  [${status}] ${label}`);
  console.log(`         recomputed: ${recomputed}`);
  console.log(`         on-chain:   ${onchain}`);
  return ok;
}

const ZERO_ROOT = "0x0000000000000000000000000000000000000000000000000000000000000000" as Hex;

function isZeroRoot(h: Hex): boolean {
  return hex2(h) === hex2(ZERO_ROOT);
}

// ---------------------------------------------------------------------------
// Main verify function
// ---------------------------------------------------------------------------

/**
 * Verify all roots for a given matchday.
 *
 * Reads ONLY from:
 *   - Supabase anon (public match_events, lineups, cards, contests, contest_entries)
 *   - publicClient (ScoreOracle.roots, dnpRoots, payoutRoots; staminaOf)
 *
 * No service-role key, no private key, no admin access.
 */
export async function verify(matchday: number): Promise<{ allPassed: boolean }> {
  const supabase = supabaseAnonServer();
  let allPassed = true;

  console.log(`\nManagerCup Public Verifier — matchday ${matchday}`);
  console.log("=".repeat(60));
  console.log("Data sources: Supabase anon + publicClient (no private key)");

  // ------------------------------------------------------------------
  // 1. Fetch public match events
  // ------------------------------------------------------------------
  console.log("\n[1/5] Fetching match_events from Supabase...");
  const eventsByPlayerKey = await fetchMatchEvents(supabase, matchday);
  console.log(`      ${eventsByPlayerKey.size} player event records`);

  // ------------------------------------------------------------------
  // 2. Fetch committed lineups
  // ------------------------------------------------------------------
  console.log("[2/5] Fetching lineups from Supabase...");
  const lineupRows = await fetchLineups(supabase, matchday);
  console.log(`      ${lineupRows.length} lineups committed`);

  if (lineupRows.length === 0) {
    console.log("\nNo lineups for this matchday. Nothing to verify.");
    return { allPassed: true };
  }

  // ------------------------------------------------------------------
  // 3. Collect all tokenIds and fetch card metadata (player_id, tier)
  // ------------------------------------------------------------------
  console.log("[3/5] Fetching card metadata from Supabase...");
  const allTokenIds = new Set<bigint>();
  for (const lr of lineupRows) {
    for (const tid of lr.token_ids) allTokenIds.add(BigInt(tid));
  }
  const cardRows = await fetchCards(supabase, Array.from(allTokenIds));
  console.log(`      ${cardRows.size} cards resolved`);

  // ------------------------------------------------------------------
  // 4. Fetch stamina for each tokenId via publicClient (no key needed)
  // ------------------------------------------------------------------
  console.log("[4/5] Fetching stamina from on-chain (publicClient)...");
  const staminaMap = new Map<bigint, number>();
  for (const tokenId of allTokenIds) {
    const s = await staminaOf(tokenId);
    staminaMap.set(tokenId, s);
  }
  console.log(`      ${staminaMap.size} stamina values fetched`);

  // ------------------------------------------------------------------
  // 5. Build CardContext + Lineup maps; recompute scores
  // ------------------------------------------------------------------
  console.log("[5/5] Recomputing scores (same code as oracle)...");

  // Build Lineup objects from DB rows
  const lineups: Lineup[] = lineupRows.map((lr) => ({
    matchday,
    wallet: lr.wallet as Address,
    tokenIds: lr.token_ids.map((t) => BigInt(t)),
    formation: lr.formation,
    captainIdx: lr.captain_idx,
    viceIdx: lr.vice_idx,
    chipId: lr.chip_id as ChipId,
  }));

  // Build eventsByPlayerId — match_events stores player_key (same as playerId hex bytes32)
  const eventsByPlayerId = new Map<`0x${string}`, MatchEvents>();
  for (const [key, ev] of eventsByPlayerKey.entries()) {
    eventsByPlayerId.set(key as `0x${string}`, ev);
  }

  // Zero events sentinel (same as oracle's ZERO_EVENTS)
  const ZERO_EVENTS: MatchEvents = {
    goals: 0, assists: 0, cleanSheet: false, tackles: 0, keyPasses: 0,
    saves: 0, penaltiesSaved: 0, manOfTheMatch: false, played60: false,
    yellowCards: 0, redCards: 0, ownGoals: 0, penaltiesMissed: 0,
    goalsConceded: 0, minutes: 0,
  };

  // Compute per-lineup scores
  const walletScores = new Map<string, number>();
  const dnpTokenIds = new Set<bigint>();

  for (const lineup of lineups) {
    // Build CardContext for this lineup's tokens
    const cardCtx = new Map<bigint, CardContext>();
    for (const tokenId of lineup.tokenIds) {
      const card = cardRows.get(tokenId);
      if (!card) {
        console.warn(`    WARN: card ${tokenId} not found in Supabase cards table — using tier=0`);
      }
      cardCtx.set(tokenId, {
        playerId: (card?.player_id ?? "0x0000000000000000000000000000000000000000000000000000000000000000") as `0x${string}`,
        tier: (card?.tier ?? 0) as Tier,
        stamina: staminaMap.get(tokenId) ?? 100,
      });
    }

    // Compute scored lineup (reuses the exact same computeLineupScore from services/oracle/score.ts)
    const result = computeLineupScore(lineup, eventsByPlayerId, cardCtx);
    walletScores.set(lineup.wallet.toLowerCase(), result.total);

    // Collect DNP tokenIds: isDNP uses the oracle's condition (!played60 && minutes===0)
    // NOT result.cards[i].raw===0 — that would misclassify zero-score subs who played ≥1 min.
    for (const tokenId of lineup.tokenIds) {
      const ctx = cardCtx.get(tokenId);
      if (!ctx) continue;
      const events = eventsByPlayerId.get(ctx.playerId) ?? ZERO_EVENTS;
      if (isDNP(events)) {
        dnpTokenIds.add(tokenId);
      }
    }
  }

  console.log(`      Scored ${walletScores.size} wallets; ${dnpTokenIds.size} DNP card instances`);

  // ------------------------------------------------------------------
  // Score Merkle tree — uses shared buildScoreRoot from roots.ts
  // ------------------------------------------------------------------
  console.log("\n--- Score Root ---");
  const scoreRootRecomputed = buildScoreRoot(
    Array.from(walletScores.entries()).map(([wallet, total]) => ({ wallet, total })),
    matchday,
  );

  const onchainScoreRoot = await onChainScoreRoot(matchday);
  if (isZeroRoot(onchainScoreRoot)) {
    console.log("  [SKIP] Score root not yet finalized on-chain (all-zero) — deferred to Task 4.4");
  } else {
    const ok = pass("scoreRoot", scoreRootRecomputed, onchainScoreRoot);
    if (!ok) allPassed = false;
  }

  // ------------------------------------------------------------------
  // DNP Merkle tree — uses shared buildDnpRoot from roots.ts
  // (empty set → EMPTY_DNP_SENTINEL leaf, same as oracle)
  // ------------------------------------------------------------------
  console.log("\n--- DNP Root ---");
  const dnpRootRecomputed = buildDnpRoot(Array.from(dnpTokenIds));

  const onchainDnpRoot = await onChainDnpRoot(matchday);
  if (isZeroRoot(onchainDnpRoot)) {
    console.log("  [SKIP] DNP root not yet finalized on-chain (all-zero) — deferred to Task 4.4");
  } else {
    const ok = pass("dnpRoot", dnpRootRecomputed, onchainDnpRoot);
    if (!ok) allPassed = false;
  }

  // ------------------------------------------------------------------
  // Payout trees — uses shared buildContestPayoutRoot from roots.ts
  // (includes eligibility gate via min_tier)
  // ------------------------------------------------------------------
  console.log("\n--- Payout Roots ---");
  const contests = await fetchContests(supabase, matchday);

  if (contests.length === 0) {
    console.log("  [SKIP] No contests for this matchday");
  }

  for (const contest of contests) {
    const contestId = BigInt(contest.contest_id);
    const minTier = contest.min_tier as Tier;
    const entries = await fetchContestEntries(supabase, contest.contest_id);

    // Build scored entrants with eligibility gate applied:
    // entrants without a lineup or with cards below minTier → total=0.
    const lineupRowByWallet = new Map(
      lineupRows.map((lr) => [lr.wallet.toLowerCase(), lr]),
    );

    const scoredEntrants = entries.map((e) => {
      const walletLower = e.wallet.toLowerCase();
      const lr = lineupRowByWallet.get(walletLower);

      if (!lr) {
        // Entered but no lineup → score 0
        return { wallet: e.wallet as Address, total: 0, enteredBlock: e.entered_block };
      }

      // Check tier eligibility (isEligibleForContest from lib/business/lineup)
      const cardTiers: Tier[] = lr.token_ids.map((tid) => {
        const card = cardRows.get(BigInt(tid));
        return card ? (card.tier as Tier) : Tier.Common;
      });
      const eligible = isEligibleForContest(cardTiers, minTier);

      return {
        wallet: e.wallet as Address,
        total: eligible ? (walletScores.get(walletLower) ?? 0) : 0,
        enteredBlock: e.entered_block,
      };
    });

    // buildContestPayoutRoot handles rake, contest payout, and sentinel tree
    const pool = BigInt(contest.pool);
    const { payoutRoot: payoutRootRecomputed } = buildContestPayoutRoot(
      scoredEntrants,
      pool,
      contest.rake_bps,
    );

    const onchainPayout = await onChainPayoutRoot(contestId);
    if (isZeroRoot(onchainPayout)) {
      console.log(`  [SKIP] contest ${contest.contest_id} payout root not yet finalized — deferred to Task 4.4`);
    } else {
      const ok = pass(`payoutRoot contest=${contest.contest_id}`, payoutRootRecomputed, onchainPayout);
      if (!ok) allPassed = false;
    }
  }

  // ------------------------------------------------------------------
  // Summary
  // ------------------------------------------------------------------
  console.log("\n" + "=".repeat(60));
  console.log(`Result: ${allPassed ? "ALL PASS" : "SOME FAILED"}`);
  console.log("=".repeat(60));
  console.log("\nData used:");
  console.log("  - match_events:    Supabase anon (public)");
  console.log("  - lineups:         Supabase anon (public)");
  console.log("  - cards:           Supabase anon (public)");
  console.log("  - contests:        Supabase anon (public, incl. min_tier)");
  console.log("  - contest_entries: Supabase anon (public)");
  console.log("  - stamina:         GameRegistry.staminaOf (publicClient, no key)");
  console.log("  - score roots:     ScoreOracle.roots / .dnpRoots / .payoutRoots (publicClient)");
  console.log("  - scoring code:    services/oracle/score.ts (computeLineupScore) — same as oracle");
  console.log("  - root helpers:    services/oracle/roots.ts (isDNP/buildScoreRoot/buildDnpRoot/buildContestPayoutRoot)");
  console.log("\nNo service-role key or private key was used in this verification.\n");

  return { allPassed };
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

// When run directly via `tsx verifier/index.ts <matchday>`
const isMain = process.argv[1]?.endsWith("verifier/index.ts") ||
  process.argv[1]?.endsWith("verifier/index");

if (isMain) {
  const arg = process.argv[2];
  const matchday = arg ? parseInt(arg, 10) : NaN;

  if (!arg || isNaN(matchday) || matchday < 1) {
    console.error("Usage: tsx verifier/index.ts <matchday>");
    console.error("  <matchday> must be a positive integer");
    process.exit(1);
  }

  verify(matchday)
    .then(({ allPassed }) => {
      process.exit(allPassed ? 0 : 1);
    })
    .catch((err) => {
      console.error("Verifier error:", err);
      process.exit(2);
    });
}
