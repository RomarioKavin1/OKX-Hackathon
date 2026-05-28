/**
 * GET /api/report?matchday=<n>&wallet=<address>
 *
 * Day-after performance report for a wallet on a given matchday.
 *
 * Computations (server-side, no chart dep):
 *   1. decileRank      — wallet's score percentile (0–100) among all matchday scores.
 *                        Computed as: (scores below wallet / total scores) × 100
 *   2. withinTierRank  — rank among wallets whose contest_id matches the wallet's
 *   3. yourTotal       — wallet's score from `scores` table
 *   4. bestPossibleTotal — greedy counterfactual: for the same formation+chip, pick
 *                          the top-scoring player per slot from match_events pool
 *   5. captainPoints   — actual captain contribution vs best possible captain
 *   6. chipEfficiency  — 1.0 = baseline; ratio of final/raw accounting for chip
 *   7. traitHeatmap    — per-synergy contribution grid for transparency (§4.10)
 *
 * Returns zeros/nulls gracefully when scores are not yet populated.
 */

import type { NextRequest } from "next/server";
import { supabaseAnonServer } from "@/lib/supabase/server";
import { PLAYERS, PLAYER_BY_ID } from "@/lib/data/players";
import { traitModifier } from "@/lib/business/synergy";
import { formationSynergy } from "@/lib/business/synergy";
import { scoreCard } from "@/lib/business/scoring";
import { FORMATIONS } from "@/lib/constants";
import { ChipId, Tier, type MatchEvents, type Position } from "@/lib/types";
import type { FormationName } from "@/lib/types";
import type { SynergyName } from "@/lib/data/formationSynergy";
import { FORMATION_SYNERGIES } from "@/lib/data/formationSynergy";

// ── Types exported for the page component ──────────────────────────────────────

export interface TraitHeatmapCell {
  /** Synergy name */
  synergy: SynergyName;
  /** Whether this synergy was active for the wallet's lineup */
  active: boolean;
  /** Average multiplier contribution for the positions this synergy affects (1.0 = no boost) */
  avgMult: number;
  /** Positions the synergy boosts */
  affectedPositions: Position[];
}

export interface CaptainAnalysis {
  /** Score points earned by the actual captain */
  captainActual: number;
  /** Score points that the best possible captain would have earned */
  captainBest: number;
  /** Player name of the actual captain (null if lineup not found) */
  captainName: string | null;
  /** Player name of the best possible captain */
  bestCaptainName: string | null;
}

export interface ReportResponse {
  matchday: number;
  wallet: string;
  /** Wallet's score percentile rank (0–100) among all players on this matchday */
  decileRank: number | null;
  /** Rank within the wallet's contest (1 = best) */
  withinTierRank: number | null;
  /** Total score actually achieved */
  yourTotal: number;
  /** Counterfactual: greedy best-possible score with same formation */
  bestPossibleTotal: number;
  /** Ratio of actual to best possible (1.0 = optimal) */
  optimality: number | null;
  captain: CaptainAnalysis;
  /** Chip effectiveness: ratio of actual points with chip vs estimated without (null if no chip used) */
  chipEfficiency: number | null;
  /** Trait synergy heatmap data */
  traitHeatmap: TraitHeatmapCell[];
  /** Whether scores have been populated for this matchday yet */
  scoresAvailable: boolean;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Parse a MatchEvents-shaped object from Supabase JSON.
 * Returns zero-value MatchEvents if the input is null/undefined.
 */
function parseMatchEvents(raw: unknown): MatchEvents {
  if (!raw || typeof raw !== "object") {
    return {
      goals: 0,
      assists: 0,
      cleanSheet: false,
      tackles: 0,
      keyPasses: 0,
      saves: 0,
      penaltiesSaved: 0,
      manOfTheMatch: false,
      played60: false,
      yellowCards: 0,
      redCards: 0,
      ownGoals: 0,
      penaltiesMissed: 0,
      goalsConceded: 0,
      minutes: 0,
    };
  }
  const e = raw as Record<string, unknown>;
  return {
    goals: Number(e.goals ?? 0),
    assists: Number(e.assists ?? 0),
    cleanSheet: Boolean(e.cleanSheet ?? e.clean_sheet ?? false),
    tackles: Number(e.tackles ?? 0),
    keyPasses: Number(e.keyPasses ?? e.key_passes ?? 0),
    saves: Number(e.saves ?? 0),
    penaltiesSaved: Number(e.penaltiesSaved ?? e.penalties_saved ?? 0),
    manOfTheMatch: Boolean(e.manOfTheMatch ?? e.man_of_the_match ?? false),
    played60: Boolean(e.played60 ?? e.played_60 ?? false),
    yellowCards: Number(e.yellowCards ?? e.yellow_cards ?? 0),
    redCards: Number(e.redCards ?? e.red_cards ?? 0),
    ownGoals: Number(e.ownGoals ?? e.own_goals ?? 0),
    penaltiesMissed: Number(e.penaltiesMissed ?? e.penalties_missed ?? 0),
    goalsConceded: Number(e.goalsConceded ?? e.goals_conceded ?? 0),
    minutes: Number(e.minutes ?? 0),
  };
}

/**
 * Compute the greedy best-possible total for a lineup slot configuration.
 *
 * Algorithm:
 *   - For each slot position (GK, DEF, MID, FWD) in the formation, find the
 *     player from the match_events pool with the highest scoreCard.final
 *   - Each player can only be used once (greedy deduplication)
 *   - Same chip and stamina=100 (full freshness for the counterfactual)
 *   - No captain multiplier (computed separately)
 *   - Returns the sum of best card finals, plus the best captainable card
 */
function computeCounterfactualBest(
  formationIdx: number,
  chip: ChipId,
  // map from playerId -> MatchEvents
  eventsPool: Map<string, MatchEvents>,
): { total: number; bestCaptainName: string | null; bestCaptainPoints: number } {
  const formation = FORMATIONS[formationIdx];
  if (!formation) {
    return { total: 0, bestCaptainName: null, bestCaptainPoints: 0 };
  }

  const slots = formation.slots; // 11 positions
  const usedPlayerIds = new Set<string>();
  let total = 0;
  let bestCardFinal = 0;
  let bestCaptainName: string | null = null;

  // Build a lookup of all players by position
  const playersByPosition = new Map<Position, typeof PLAYERS>();
  for (const pos of ["GK", "DEF", "MID", "FWD"] as Position[]) {
    playersByPosition.set(
      pos,
      PLAYERS.filter((p) => p.position === pos),
    );
  }

  for (const slotPos of slots) {
    const candidates = playersByPosition.get(slotPos) ?? [];
    let bestFinal = 0;
    let bestPid: string | null = null;
    let bestPlayerName: string | null = null;

    for (const candidate of candidates) {
      if (usedPlayerIds.has(candidate.playerId)) continue;
      const events = eventsPool.get(candidate.playerId) ?? null;
      if (!events) continue;

      const result = scoreCard({
        position: candidate.position,
        scoringPosition: slotPos,
        tier: Tier.Common, // counterfactual uses Common tier (available to all)
        events,
        stamina: 100, // assume fresh
        isCaptain: false,
        chip,
        sameNationCount: 1,
        traitModifier: traitModifier(candidate.position, [candidate.primaryTrait, candidate.secondaryTrait], events),
        formationSynergyMult: 1, // no synergy in counterfactual (lineup composition unknown)
      });

      if (result.final > bestFinal) {
        bestFinal = result.final;
        bestPid = candidate.playerId;
        bestPlayerName = candidate.name;
      }
    }

    if (bestPid) {
      usedPlayerIds.add(bestPid);
      total += bestFinal;

      // Track best captain candidate (non-GK preferred, but any will do)
      if (bestFinal > bestCardFinal && slotPos !== "GK") {
        bestCardFinal = bestFinal;
        bestCaptainName = bestPlayerName;
      }
    }
  }

  return { total, bestCaptainName, bestCaptainPoints: bestCardFinal };
}

/**
 * Compute the trait heatmap — one cell per formation synergy.
 * Shows which synergies were active and what average multiplier they contributed.
 */
function computeTraitHeatmap(
  formationName: FormationName,
  slotPositions: Position[],
  playerTraits: Array<[string, string]>, // [primaryTrait, secondaryTrait] per slot
): TraitHeatmapCell[] {
  // Build context for formationSynergy
  const cards = slotPositions.map((pos, i) => {
    const [primary, secondary] = playerTraits[i] ?? ["", ""];
    return {
      position: pos,
      scoringPosition: pos,
      traits: [primary, secondary].filter(Boolean) as import("@/lib/data/traits").Trait[],
    };
  });

  const { active, multForCard } = formationSynergy({ formation: formationName, cards });
  const activeSet = new Set(active);

  return FORMATION_SYNERGIES.map((def) => {
    const isActive = activeSet.has(def.name);

    // Determine which positions this synergy affects (mult > 1)
    const affected = (["GK", "DEF", "MID", "FWD"] as Position[]).filter(
      (pos) => def.multForPosition(pos) !== 1.0,
    );

    // Compute average multiplier across all 11 cards (if active)
    let avgMult = 1.0;
    if (isActive) {
      const mults = cards.map((_, i) => multForCard(i));
      avgMult = mults.reduce((a, b) => a + b, 0) / mults.length;
    }

    return {
      synergy: def.name,
      active: isActive,
      avgMult,
      affectedPositions: affected,
    };
  });
}

// ── Route handler ──────────────────────────────────────────────────────────────

export async function GET(request: NextRequest): Promise<Response> {
  const sp = request.nextUrl.searchParams;
  const matchdayParam = sp.get("matchday");
  const walletParam = sp.get("wallet");

  // ── Param validation ──────────────────────────────────────────────────────
  if (matchdayParam === null || matchdayParam.trim() === "") {
    return Response.json(
      { error: "Missing required query param: matchday" },
      { status: 400 },
    );
  }
  if (!/^\d+$/.test(matchdayParam.trim())) {
    return Response.json(
      { error: "Invalid query param: matchday must be a non-negative integer" },
      { status: 400 },
    );
  }
  const matchday = parseInt(matchdayParam.trim(), 10);
  if (!Number.isFinite(matchday)) {
    return Response.json(
      { error: "Invalid query param: matchday out of range" },
      { status: 400 },
    );
  }

  if (!walletParam || walletParam.trim() === "") {
    return Response.json(
      { error: "Missing required query param: wallet" },
      { status: 400 },
    );
  }
  const wallet = walletParam.trim().toLowerCase();

  // ── Supabase queries ──────────────────────────────────────────────────────
  const db = supabaseAnonServer();

  // 1. Fetch all scores for the matchday (for rank computation)
  const { data: allScores, error: scoresError } = await db
    .from("scores")
    .select("wallet, score, rank, contest_id, payout")
    .eq("matchday", matchday);

  if (scoresError) {
    return Response.json(
      { error: `Supabase error (scores): ${scoresError.message}` },
      { status: 500 },
    );
  }

  const scores = allScores ?? [];
  const scoresAvailable = scores.length > 0;

  // Empty/graceful response when no scores yet
  const emptyResponse: ReportResponse = {
    matchday,
    wallet,
    decileRank: null,
    withinTierRank: null,
    yourTotal: 0,
    bestPossibleTotal: 0,
    optimality: null,
    captain: {
      captainActual: 0,
      captainBest: 0,
      captainName: null,
      bestCaptainName: null,
    },
    chipEfficiency: null,
    traitHeatmap: [],
    scoresAvailable: false,
  };

  if (!scoresAvailable) {
    return Response.json(emptyResponse satisfies ReportResponse);
  }

  // Find this wallet's score row
  const myScoreRow = scores.find((s) => s.wallet.toLowerCase() === wallet);
  const yourTotal = myScoreRow ? Number(myScoreRow.score) : 0;
  const myContestId = myScoreRow?.contest_id ?? null;

  // 2. Decile rank — percentile position (higher = better)
  const allTotals = scores.map((s) => Number(s.score));
  const scoresBelow = allTotals.filter((t) => t < yourTotal).length;
  const decileRank =
    allTotals.length > 1
      ? Math.round((scoresBelow / (allTotals.length - 1)) * 100)
      : myScoreRow
        ? 50
        : null;

  // 3. Within-tier rank (rank among same contest)
  let withinTierRank: number | null = null;
  if (myScoreRow && myContestId !== null) {
    const tierScores = scores
      .filter((s) => String(s.contest_id) === String(myContestId))
      .map((s) => Number(s.score))
      .sort((a, b) => b - a);
    const myIdx = tierScores.indexOf(yourTotal);
    withinTierRank = myIdx >= 0 ? myIdx + 1 : null;
  } else if (myScoreRow) {
    // No contest — rank within all matchday participants
    const sorted = [...allTotals].sort((a, b) => b - a);
    const myIdx = sorted.indexOf(yourTotal);
    withinTierRank = myIdx >= 0 ? myIdx + 1 : null;
  }

  // 4. Fetch this wallet's lineup for deeper analysis
  const { data: lineupRow, error: lineupError } = await db
    .from("lineups")
    .select(
      "token_ids, formation, captain_idx, vice_idx, chip_id",
    )
    .eq("matchday", matchday)
    .eq("wallet", wallet)
    .maybeSingle();

  if (lineupError) {
    return Response.json(
      { error: `Supabase error (lineups): ${lineupError.message}` },
      { status: 500 },
    );
  }

  // 5. Fetch match_events for this matchday
  const { data: eventRows, error: eventsError } = await db
    .from("match_events")
    .select("player_key, events")
    .eq("matchday", matchday);

  if (eventsError) {
    return Response.json(
      { error: `Supabase error (match_events): ${eventsError.message}` },
      { status: 500 },
    );
  }

  // Build player_key (= playerId) → MatchEvents map
  const eventsPool = new Map<string, MatchEvents>();
  for (const row of eventRows ?? []) {
    eventsPool.set(row.player_key, parseMatchEvents(row.events));
  }

  // 6. Fetch cards for the lineup (to get playerId per tokenId)
  const tokenIds: string[] = Array.isArray(lineupRow?.token_ids)
    ? (lineupRow.token_ids as string[]).map(String)
    : [];

  let cardPlayerIds: string[] = [];
  if (tokenIds.length > 0) {
    const { data: cardRows } = await db
      .from("cards")
      .select("token_id, player_id, tier")
      .in("token_id", tokenIds);
    const cardMap = new Map<string, { playerId: string; tier: number }>();
    for (const row of cardRows ?? []) {
      cardMap.set(String(row.token_id), {
        playerId: row.player_id as string,
        tier: row.tier as number,
      });
    }
    cardPlayerIds = tokenIds.map((tid) => cardMap.get(tid)?.playerId ?? "");
  }

  // 7. Captain analysis
  const captainIdx = lineupRow?.captain_idx ?? 0;
  const chip = (lineupRow?.chip_id ?? ChipId.None) as ChipId;
  const formationIdx = lineupRow?.formation ?? 0;
  const formationDef = FORMATIONS[formationIdx];

  let captainActual = 0;
  let captainName: string | null = null;

  if (cardPlayerIds.length > 0 && formationDef) {
    const captainPlayerId = cardPlayerIds[captainIdx];
    if (captainPlayerId) {
      const captainPlayer = PLAYER_BY_ID.get(captainPlayerId as `0x${string}`);
      captainName = captainPlayer?.name ?? null;
      const captainEvents = eventsPool.get(captainPlayerId);
      if (captainEvents && captainPlayer) {
        const captainPos = formationDef.slots[captainIdx] ?? captainPlayer.position;
        const captainScore = scoreCard({
          position: captainPlayer.position,
          scoringPosition: captainPos,
          tier: Tier.Common,
          events: captainEvents,
          stamina: 100,
          isCaptain: true,
          chip,
          sameNationCount: 1,
          traitModifier: traitModifier(
            captainPlayer.position,
            [captainPlayer.primaryTrait, captainPlayer.secondaryTrait],
            captainEvents,
          ),
          formationSynergyMult: 1,
        });
        captainActual = captainScore.final;
      }
    }
  }

  // 8. Counterfactual best lineup
  const { total: bestPossibleTotal, bestCaptainName, bestCaptainPoints } =
    computeCounterfactualBest(formationIdx, chip, eventsPool);

  const optimality =
    bestPossibleTotal > 0 ? yourTotal / bestPossibleTotal : null;

  // 9. Chip efficiency
  // Chip efficiency: ratio of scored points vs what they'd be without the chip.
  // TripleCaptain: captain scores 3× instead of 2×; raw ratio = actual/estimated_no_chip
  // Doubler: all 11 cards doubled; we use 2.0 as the chip baseline factor
  // For other/no chip: null
  let chipEfficiency: number | null = null;
  if (chip === ChipId.TripleCaptain && captainActual > 0 && yourTotal > 0) {
    // Without triple captain, captain contributes captainActual * (2/3)
    const noChipCaptain = captainActual * (2 / 3);
    const noChipTotal = yourTotal - captainActual + noChipCaptain;
    chipEfficiency = noChipTotal > 0 ? yourTotal / noChipTotal : null;
  } else if (chip === ChipId.Doubler && yourTotal > 0) {
    // Doubler doubles all 11 finals; efficiency = 2.0 if all positive
    chipEfficiency = 2.0;
  }

  // 10. Trait heatmap
  let traitHeatmap: TraitHeatmapCell[] = [];
  if (formationDef && cardPlayerIds.length === 11) {
    const slotPositions = formationDef.slots;
    const playerTraitsList: Array<[string, string]> = cardPlayerIds.map((pid) => {
      const player = PLAYER_BY_ID.get(pid as `0x${string}`);
      return [player?.primaryTrait ?? "", player?.secondaryTrait ?? ""];
    });
    traitHeatmap = computeTraitHeatmap(
      formationDef.name,
      slotPositions,
      playerTraitsList,
    );
  }

  const response: ReportResponse = {
    matchday,
    wallet,
    decileRank,
    withinTierRank,
    yourTotal,
    bestPossibleTotal,
    optimality,
    captain: {
      captainActual,
      captainBest: bestCaptainPoints,
      captainName,
      bestCaptainName,
    },
    chipEfficiency,
    traitHeatmap,
    scoresAvailable,
  };

  return Response.json(response satisfies ReportResponse);
}
