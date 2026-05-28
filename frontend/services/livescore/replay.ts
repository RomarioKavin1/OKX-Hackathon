/**
 * replay.ts — Live-scoring replay worker (Task 6.3)
 *
 * replayMatchday(matchday, { speed })
 *   1. Reads all committed lineups for the matchday from Supabase.
 *   2. Reads all match_events rows for the matchday and groups them
 *      by player_key (which is the on-chain playerId `0x...`).
 *   3. Builds an ordered "event clock": for each matchday minute (1→90)
 *      it synthesises a MatchEvents snapshot that accumulates all events
 *      that occurred UP TO that minute.
 *   4. Emits ticks on a scaled clock (real milliseconds = (1000 / speed) per
 *      simulated minute), recomputes all lineup totals via computeLineupScore,
 *      then upserts live_scores rows (matchday, wallet, score, rank).
 *
 * Design principles:
 *   - Deterministic: given the same match_events snapshot the same sequence
 *     of upserts is always produced.
 *   - Idempotent: upsert on (matchday, wallet) PK — safe to re-run.
 *   - Reuses computeLineupScore exactly (no scoring logic is duplicated here).
 *   - No live API calls: reads only from the already-ingested match_events table.
 *
 * Argv guard: `tsx services/livescore/replay.ts <matchday> [--speed <n>]`
 *
 * NOTE: Actual replay execution requires:
 *   - SUPABASE_SERVICE_ROLE_KEY (for upserts)
 *   - NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
 *   - The schema migration 20260528184817_live_scores.sql to be applied.
 *   - match_events rows to be present (run `npm run ingest` first).
 *   - lineups rows to be present (players must have committed).
 */

import { supabaseAdmin } from "@/lib/supabase/server";
import { computeLineupScore, type CardContext } from "@/services/oracle/score";
import type { Lineup, MatchEvents } from "@/lib/types";
import { ChipId, Tier } from "@/lib/types";
import type { Address } from "viem";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Scalar minute milestone used by the clock (1..90). */
type Minute = number;

/** A full MatchEvents snapshot accumulated up to a given minute. */
type AccumulatedEvents = Map<string, MatchEvents>;

export interface ReplayOptions {
  /** Speed multiplier. speed=1 → real-time (1 tick/s per minute).
   *  speed=60 → 60× faster (1 simulated minute per ~16ms). Default: 60. */
  speed?: number;
  /** Custom tick callback for testing / observability. Called after each minute's
   *  upsert completes. Receives the current minute and wallet→score map. */
  onTick?: (minute: Minute, scores: Map<string, number>) => void;
}

/** One row returned from the lineups table. */
interface LineupRow {
  matchday: number;
  wallet: string;
  token_ids: string[]; // numeric(78,0) stored as strings in JSON
  formation: number;
  captain_idx: number;
  vice_idx: number;
  chip_id: number;
}

/** One row returned from the match_events table. */
interface MatchEventRow {
  matchday: number;
  fixture_id: number;
  player_key: string; // on-chain playerId (`0x...`) or `api:N`
  events: MatchEvents;
  raw: unknown; // stored but not used here
}

/** One row returned from the cards table (for CardContext). */
interface CardRow {
  token_id: string; // numeric(78,0) as string
  player_id: string; // bytes32 playerId as hex string
  tier: number; // smallint → Tier enum value
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Merge accumulated events with new ones arriving at `currentMinute`.
 *
 * The match_events table stores FINAL stats (full 90-min totals).  To
 * simulate a running clock we linearly interpolate each cumulative stat
 * proportional to the player's actual played minutes (or 90 if unknown).
 * Boolean fields (cleanSheet, played60, MOTM) are only set once the player
 * has reached the relevant milestone minute.
 *
 * This is an approximation — the API-Football endpoint does not expose
 * intra-match timelines.  The replay therefore provides a smooth incremental
 * animation rather than exact-minute event fidelity.
 */
function interpolateEvents(
  finalEvents: MatchEvents,
  currentMinute: Minute,
): MatchEvents {
  const totalMinutes = Math.max(finalEvents.minutes, 1);
  const ratio = Math.min(currentMinute / totalMinutes, 1);

  // Linear interpolation for counting stats
  const lerp = (v: number) => Math.round(v * ratio);

  return {
    minutes: Math.min(currentMinute, finalEvents.minutes),
    goals: lerp(finalEvents.goals),
    assists: lerp(finalEvents.assists),
    tackles: lerp(finalEvents.tackles),
    keyPasses: lerp(finalEvents.keyPasses),
    saves: lerp(finalEvents.saves),
    penaltiesSaved: lerp(finalEvents.penaltiesSaved),
    penaltiesMissed: lerp(finalEvents.penaltiesMissed),
    yellowCards: lerp(finalEvents.yellowCards),
    redCards: lerp(finalEvents.redCards),
    ownGoals: lerp(finalEvents.ownGoals),
    goalsConceded: lerp(finalEvents.goalsConceded),
    // Threshold booleans: only true once the player reaches that minute mark
    played60: finalEvents.played60 && currentMinute >= 60,
    cleanSheet: finalEvents.cleanSheet && currentMinute >= 60,
    manOfTheMatch: finalEvents.manOfTheMatch && currentMinute >= finalEvents.minutes,
  };
}

/**
 * Build a Map<string, MatchEvents> snapshot for all players at `minute`.
 */
function buildEventSnapshot(
  finalEventsByPlayer: Map<string, MatchEvents>,
  minute: Minute,
): AccumulatedEvents {
  const snapshot: AccumulatedEvents = new Map();
  for (const [playerId, finalEvents] of finalEventsByPlayer) {
    if (finalEvents.minutes === 0 && !finalEvents.played60) {
      // DNP — never interpolate; leave absent so computeLineupScore uses ZERO_EVENTS
      continue;
    }
    snapshot.set(playerId, interpolateEvents(finalEvents, minute));
  }
  return snapshot;
}

/**
 * Convert a Map<string,MatchEvents> (string keys) to the typed Map required
 * by computeLineupScore (which expects `0x${string}` keys).
 */
function toTypedEventsMap(
  snapshot: AccumulatedEvents,
): Map<`0x${string}`, MatchEvents> {
  const typed = new Map<`0x${string}`, MatchEvents>();
  for (const [k, v] of snapshot) {
    typed.set(k as `0x${string}`, v);
  }
  return typed;
}

/** Convert a LineupRow (DB snake_case) to the Lineup type used by computeLineupScore. */
function rowToLineup(row: LineupRow): Lineup {
  return {
    matchday: row.matchday,
    wallet: row.wallet as Address,
    tokenIds: row.token_ids.map((id) => BigInt(id)),
    formation: row.formation,
    captainIdx: row.captain_idx,
    viceIdx: row.vice_idx,
    chipId: row.chip_id as ChipId,
  };
}

/**
 * Assign dense integer ranks (1-based, ties share the same rank).
 * Higher score = lower rank number.
 */
function assignRanks(scores: Map<string, number>): Map<string, number> {
  const sorted = [...scores.entries()].sort((a, b) => b[1] - a[1]);
  const rankMap = new Map<string, number>();
  let rank = 1;
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i][1] < sorted[i - 1][1]) {
      rank = i + 1;
    }
    rankMap.set(sorted[i][0], rank);
  }
  return rankMap;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Replay a matchday's scoring in real-ish time, upserting live_scores rows
 * at each simulated minute tick.
 *
 * @param matchday - The matchday number to replay.
 * @param opts     - { speed, onTick } (see ReplayOptions).
 */
export async function replayMatchday(
  matchday: number,
  opts: ReplayOptions = {},
): Promise<void> {
  const speed = opts.speed ?? 60;
  const msPerMinute = Math.round(1000 / speed);
  const db = supabaseAdmin();

  // ── 1. Load committed lineups ──────────────────────────────────────────────
  const { data: lineupRows, error: lineupErr } = await db
    .from("lineups")
    .select("matchday, wallet, token_ids, formation, captain_idx, vice_idx, chip_id")
    .eq("matchday", matchday);

  if (lineupErr) {
    throw new Error(`[replay] Failed to load lineups: ${lineupErr.message}`);
  }
  if (!lineupRows || lineupRows.length === 0) {
    console.warn(`[replay] No committed lineups found for matchday ${matchday}. Exiting.`);
    return;
  }
  const lineups = (lineupRows as LineupRow[]).map(rowToLineup);

  // ── 2. Load match_events ───────────────────────────────────────────────────
  const { data: eventRows, error: eventErr } = await db
    .from("match_events")
    .select("matchday, fixture_id, player_key, events, raw")
    .eq("matchday", matchday);

  if (eventErr) {
    throw new Error(`[replay] Failed to load match_events: ${eventErr.message}`);
  }

  // Index by player_key. Skip unmapped (api:N) keys.
  const finalEventsByPlayer = new Map<string, MatchEvents>();
  for (const row of (eventRows ?? []) as MatchEventRow[]) {
    if (!row.player_key.startsWith("api:")) {
      finalEventsByPlayer.set(row.player_key, row.events as MatchEvents);
    }
  }

  // ── 3. Load card metadata (tokenId → CardContext) ──────────────────────────
  // Collect all token IDs referenced by the lineups.
  const allTokenIds = new Set<bigint>();
  for (const l of lineups) {
    for (const tid of l.tokenIds) allTokenIds.add(tid);
  }
  const tokenIdStrs = [...allTokenIds].map((tid) => tid.toString());

  const { data: cardRows, error: cardErr } = await db
    .from("cards")
    .select("token_id, player_id, tier")
    .in("token_id", tokenIdStrs);

  if (cardErr) {
    throw new Error(`[replay] Failed to load cards: ${cardErr.message}`);
  }

  // Build cardCtx map — stamina not stored in DB (default 50 = "normal").
  // A production system would read stamina from on-chain or a cache; for the
  // live replay a default of 50 gives a reasonable approximation.
  const cardCtx = new Map<bigint, CardContext>();
  for (const row of (cardRows ?? []) as CardRow[]) {
    cardCtx.set(BigInt(row.token_id), {
      playerId: row.player_id as `0x${string}`,
      tier: row.tier as Tier,
      stamina: 50,
    });
  }

  // Warn about any token IDs we couldn't resolve.
  for (const tid of allTokenIds) {
    if (!cardCtx.has(tid)) {
      console.warn(`[replay] CardContext missing for tokenId=${tid} — lineup may score 0`);
    }
  }

  // Filter lineups to those where all 11 cards are resolvable (defensive guard).
  const validLineups = lineups.filter((l) =>
    l.tokenIds.every((tid) => cardCtx.has(tid)),
  );
  if (validLineups.length < lineups.length) {
    console.warn(
      `[replay] ${lineups.length - validLineups.length} lineup(s) skipped (missing card metadata)`,
    );
  }

  console.log(
    `[replay] matchday=${matchday} lineups=${validLineups.length} players=${finalEventsByPlayer.size} speed=${speed}x`,
  );

  // ── 4. Tick loop (minutes 1..90) ───────────────────────────────────────────
  for (let minute = 1; minute <= 90; minute++) {
    const snapshot = buildEventSnapshot(finalEventsByPlayer, minute);
    const typedSnapshot = toTypedEventsMap(snapshot);

    // Compute running score for each valid lineup.
    const walletScores = new Map<string, number>();
    for (const lineup of validLineups) {
      try {
        const result = computeLineupScore(lineup, typedSnapshot, cardCtx);
        walletScores.set(lineup.wallet.toLowerCase(), result.total);
      } catch (err) {
        // Scoring error for one lineup should not abort the whole replay.
        console.warn(
          `[replay] minute=${minute} scoring error for wallet=${lineup.wallet}: ${String(err)}`,
        );
        walletScores.set(lineup.wallet.toLowerCase(), 0);
      }
    }

    // Assign ranks.
    const rankMap = assignRanks(walletScores);

    // Upsert live_scores rows.
    const rows = [...walletScores.entries()].map(([wallet, score]) => ({
      matchday,
      wallet,
      score,
      rank: rankMap.get(wallet) ?? null,
      updated_at: new Date().toISOString(),
    }));

    if (rows.length > 0) {
      const { error: upsertErr } = await db
        .from("live_scores")
        .upsert(rows, { onConflict: "matchday,wallet" });

      if (upsertErr) {
        console.error(`[replay] minute=${minute} upsert error: ${upsertErr.message}`);
      }
    }

    // Invoke optional tick callback.
    opts.onTick?.(minute, walletScores);

    // Yield to the event loop; sleep for the scaled tick interval.
    // (No sleep on the final tick — process can exit immediately.)
    if (minute < 90 && msPerMinute > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, msPerMinute));
    }
  }

  console.log(`[replay] matchday=${matchday} complete.`);
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

/**
 * When run directly via tsx:
 *   tsx services/livescore/replay.ts <matchday> [--speed <n>]
 *
 * Requires:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (anon key, for URL)
 *   SUPABASE_SERVICE_ROLE_KEY
 */
if (process.argv[1] && process.argv[1].endsWith("replay.ts")) {
  const args = process.argv.slice(2);
  const matchdayArg = parseInt(args[0] ?? "", 10);
  if (!Number.isFinite(matchdayArg) || matchdayArg < 0) {
    console.error("Usage: tsx services/livescore/replay.ts <matchday> [--speed <n>]");
    process.exit(1);
  }

  let speedArg = 60; // default: 60× faster than real-time
  const speedIdx = args.indexOf("--speed");
  if (speedIdx !== -1 && args[speedIdx + 1]) {
    const parsed = parseFloat(args[speedIdx + 1] ?? "");
    if (Number.isFinite(parsed) && parsed > 0) speedArg = parsed;
  }

  replayMatchday(matchdayArg, { speed: speedArg })
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("[replay] Fatal:", err);
      process.exit(1);
    });
}
