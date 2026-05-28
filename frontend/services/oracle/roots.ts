/**
 * roots.ts — Shared, pure helpers for building Merkle roots.
 *
 * Both the oracle (publish.ts) and the public verifier (verifier/index.ts) must
 * produce byte-identical roots for the same inputs.  This module is the single
 * source of truth for every drift-prone helper so neither file can diverge.
 *
 * Rules:
 *  - No server-only imports (no supabaseAdmin, no PRIVATE_KEY, no service-role key).
 *  - Pure functions only — deterministic given the same inputs.
 *  - Any change to root-building semantics MUST happen here (and only here).
 */

import type { Address, Hex } from "viem";
import type { MatchEvents } from "@/lib/types";
import { Tier } from "@/lib/types";
import {
  scoreLeaf,
  dnpLeaf,
  buildMerkleTree,
  buildPayoutTree,
} from "@/lib/business/merkle";
import { buildContestPayout, type ScoredEntrant } from "@/lib/business/contest";
import { contestRake } from "@/lib/business/fees";
import { isEligibleForContest } from "@/lib/business/lineup";

// ─────────────────────────────────────────────────────────────────────────────
// Sentinel — used when no cards were DNP'd so buildMerkleTree never receives an
// empty array, and the on-chain dnpRoot is non-zero.
// ─────────────────────────────────────────────────────────────────────────────

export const EMPTY_DNP_SENTINEL: Hex =
  "0x0000000000000000000000000000000000000000000000000000000000000001";

// ─────────────────────────────────────────────────────────────────────────────
// isDNP
//
// A card Did Not Play when its events record has played60===false AND minutes===0.
// This is the authoritative condition used by the oracle (publish.ts §4+5).
//
// NOTE: do NOT use `card.raw===0 && card.final===0` — a sub who played ≥1 min
// but scored zero raw points would be misclassified as DNP.
// ─────────────────────────────────────────────────────────────────────────────

export function isDNP(events: MatchEvents): boolean {
  return !events.played60 && events.minutes === 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// scaleScore
//
// Converts floating-point fantasy points to the int256 encoding used in
// scoreLeaf (×1000, rounded).  e.g. 16.5 pts → 16500n,  -3.0 pts → -3000n.
// ─────────────────────────────────────────────────────────────────────────────

export function scaleScore(total: number): bigint {
  return BigInt(Math.round(total * 1000));
}

// ─────────────────────────────────────────────────────────────────────────────
// buildScoreRoot
//
// Builds the score Merkle root from an array of {wallet, total} entries for a
// given matchday.  Returns the root hex string.
//
// Raises if `scored` is empty (caller must guard — if no lineups exist there is
// nothing to publish).
// ─────────────────────────────────────────────────────────────────────────────

export function buildScoreRoot(
  scored: Array<{ wallet: string; total: number }>,
  matchday: number,
): Hex {
  const leaves: Hex[] = scored.map(({ wallet, total }) =>
    scoreLeaf(wallet as Address, matchday, scaleScore(total)),
  );
  return buildMerkleTree(leaves).root;
}

// ─────────────────────────────────────────────────────────────────────────────
// buildDnpRoot
//
// Builds the DNP Merkle root from an array of tokenIds that DNP'd.
// When the array is empty (no DNPs this matchday) the oracle emits a single
// sentinel leaf so the on-chain root is non-zero.
// ─────────────────────────────────────────────────────────────────────────────

export function buildDnpRoot(dnpTokenIds: bigint[]): Hex {
  const leaves: Hex[] =
    dnpTokenIds.length > 0
      ? dnpTokenIds.map((tid) => dnpLeaf(tid))
      : [EMPTY_DNP_SENTINEL];
  return buildMerkleTree(leaves).root;
}

// ─────────────────────────────────────────────────────────────────────────────
// eligibleEntrants
//
// Applies the contest's minTier gate (isEligibleForContest) to each entrant.
// Ineligible entrants keep their wallet and enteredBlock but get total=0 so they
// remain in the ranking (per spec §5.2 and oracle §9a).
//
// cardTiersForWallet must return the tier array for a given wallet address (lower).
// ─────────────────────────────────────────────────────────────────────────────

export function eligibleEntrants(
  entrants: ScoredEntrant[],
  minTier: Tier,
  cardTiersForWallet: (wallet: string) => Tier[],
): ScoredEntrant[] {
  return entrants.map((entrant) => {
    const tiers = cardTiersForWallet(entrant.wallet.toLowerCase());
    const eligible = tiers.length > 0 ? isEligibleForContest(tiers, minTier) : false;
    return {
      wallet: entrant.wallet,
      total: eligible ? entrant.total : 0,
      enteredBlock: entrant.enteredBlock,
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// buildContestPayoutRoot
//
// Builds the payout Merkle root + per-account claims for a contest.
//
// Follows the oracle's logic exactly (publish.ts §9c–e):
//   1. contestRake(pool, rakeBps) → net pool.
//   2. buildContestPayout(scoredEntrants, netPool) → ranked.
//   3. Only entrants with amount > 0 go into the tree; if everyone has 0 we
//      still build a minimal sentinel tree so the on-chain state is consistent.
// ─────────────────────────────────────────────────────────────────────────────

export interface PayoutRootResult {
  payoutRoot: Hex;
  ranked: ReturnType<typeof buildContestPayout>["ranked"];
  claims: Array<{ account: Address; amount: bigint; proof: Hex[] }>;
}

export function buildContestPayoutRoot(
  scoredEntrants: ScoredEntrant[],
  pool: bigint,
  rakeBps: number,
): PayoutRootResult {
  const { net: netPool } = contestRake(pool, rakeBps);
  const { ranked } = buildContestPayout(scoredEntrants, netPool);

  const payableEntries = ranked
    .filter((r) => r.amount > 0n)
    .map((r) => ({ account: r.wallet as Address, amount: r.amount }));

  const { root: payoutRoot, claims } =
    payableEntries.length > 0
      ? buildPayoutTree(payableEntries)
      : buildPayoutTree([
          {
            account: "0x0000000000000000000000000000000000000001" as Address,
            amount: 0n,
          },
        ]);

  return { payoutRoot, ranked, claims };
}
