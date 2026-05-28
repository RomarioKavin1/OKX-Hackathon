/**
 * ingest.ts — API-Football ingester (Task 4.1)
 *
 * Three public exports:
 *   fetchFixturePlayers(fixtureId)   — GET /fixtures/players from API-Football
 *   normalizePlayer(stats, teamConceded) — map one player stats object → MatchEvents (pure)
 *   ingestFixture(fixtureId, matchday)   — fetch + normalize + upsert to Supabase
 *
 * API-Football v3 /fixtures/players response shape (relevant fields only):
 *   response[n].team.id
 *   response[n].players[m].player.id          ← apiFootballId
 *   response[n].players[m].statistics[0].games.minutes
 *   response[n].players[m].statistics[0].goals.total
 *   response[n].players[m].statistics[0].goals.assists
 *   response[n].players[m].statistics[0].goals.saves
 *   response[n].players[m].statistics[0].goals.conceded  ← GK only (API name is confusing)
 *   response[n].players[m].statistics[0].tackles.total
 *   response[n].players[m].statistics[0].passes.key
 *   response[n].players[m].statistics[0].penalty.saved
 *   response[n].players[m].statistics[0].penalty.missed
 *   response[n].players[m].statistics[0].penalty.committed (not used but present)
 *   response[n].players[m].statistics[0].cards.yellow
 *   response[n].players[m].statistics[0].cards.red
 *   response[n].players[m].statistics[0].games.motm (boolean or null)
 */

import { PLAYER_BY_APIID } from "@/lib/data/players";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { MatchEvents } from "@/lib/types";

// ---------------------------------------------------------------------------
// Types for the raw API-Football /fixtures/players payload
// ---------------------------------------------------------------------------

/** Minimal shape of one player statistics object from the API */
export interface ApiPlayerStats {
  player: {
    id: number;
    name: string;
  };
  statistics: Array<{
    games: {
      minutes: number | null;
      motm?: boolean | null;
      // Some API responses expose 'motm' as a string ("true"/"false"/null) at
      // the fixture level; we handle both boolean and string below.
    };
    goals: {
      total: number | null;
      assists: number | null;
      saves: number | null;
      conceded: number | null; // for GK: goals conceded this match
    };
    tackles: {
      total: number | null;
    };
    passes: {
      key: number | null;
    };
    penalty: {
      saved: number | null;
      missed: number | null;
      won?: number | null;
      committed?: number | null;
    };
    cards: {
      yellow: number | null;
      red: number | null;
    };
  }>;
}

/** One team entry in the /fixtures/players response */
export interface ApiTeamEntry {
  team: {
    id: number;
    name: string;
  };
  players: ApiPlayerStats[];
}

/** The raw response from /fixtures/players keyed by fixture */
export interface RawFixture {
  fixtureId: number;
  /** Raw API response array (two entries: home team + away team) */
  teams: ApiTeamEntry[];
  /** Goals conceded per team.id — derived from the other team's goals.total in
   *  the fixture result. This MUST be pre-computed by the caller (fetchFixturePlayers
   *  does it from the /fixtures endpoint or by summing goals.total for GK). */
  teamConceded: Record<number, number>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Coerce a nullable number to a safe integer (0 if null/undefined/NaN) */
function safeInt(v: number | null | undefined): number {
  if (v === null || v === undefined || !Number.isFinite(v)) return 0;
  return Math.max(0, Math.floor(v));
}

/** Coerce a nullable boolean-ish value */
function safeBool(v: boolean | string | null | undefined): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === "boolean") return v;
  return v === "true" || v === "1";
}

// ---------------------------------------------------------------------------
// fetchFixturePlayers
// ---------------------------------------------------------------------------

/**
 * GET https://v3.football.api-sports.io/fixtures/players?fixture=<fixtureId>
 *
 * Also fetches https://v3.football.api-sports.io/fixtures?id=<fixtureId> to
 * obtain the final score (needed to compute teamConceded per team).
 *
 * Throws if API_FOOTBALL_KEY is missing.
 */
export async function fetchFixturePlayers(fixtureId: number): Promise<RawFixture> {
  const apiKey = process.env.API_FOOTBALL_KEY;
  if (!apiKey) {
    throw new Error(
      "API_FOOTBALL_KEY env var is not set. " +
        "Provide it in .env (repo root) or as an environment variable.",
    );
  }

  const headers: Record<string, string> = {
    "x-apisports-key": apiKey,
    "Content-Type": "application/json",
  };

  // 1. Fetch fixture result to determine teamConceded
  const fixtureRes = await fetch(
    `https://v3.football.api-sports.io/fixtures?id=${fixtureId}`,
    { headers },
  );
  if (!fixtureRes.ok) {
    throw new Error(
      `API-Football /fixtures?id=${fixtureId} returned ${fixtureRes.status} ${fixtureRes.statusText}`,
    );
  }
  const fixtureJson = await fixtureRes.json();
  const fixtureData = fixtureJson?.response?.[0];

  // Parse final score from the fixture result
  // fixtureData.goals.home / fixtureData.goals.away
  // fixtureData.teams.home.id / fixtureData.teams.away.id
  const teamConceded: Record<number, number> = {};
  if (fixtureData) {
    const homeId = fixtureData.teams?.home?.id as number | undefined;
    const awayId = fixtureData.teams?.away?.id as number | undefined;
    const homeGoals = safeInt(fixtureData.goals?.home);
    const awayGoals = safeInt(fixtureData.goals?.away);
    if (homeId !== undefined && awayId !== undefined) {
      teamConceded[homeId] = awayGoals; // home team conceded = away goals scored
      teamConceded[awayId] = homeGoals; // away team conceded = home goals scored
    }
  }

  // 2. Fetch player stats
  const playersRes = await fetch(
    `https://v3.football.api-sports.io/fixtures/players?fixture=${fixtureId}`,
    { headers },
  );
  if (!playersRes.ok) {
    throw new Error(
      `API-Football /fixtures/players?fixture=${fixtureId} returned ` +
        `${playersRes.status} ${playersRes.statusText}`,
    );
  }
  const playersJson = await playersRes.json();
  const teams: ApiTeamEntry[] = playersJson?.response ?? [];

  return { fixtureId, teams, teamConceded };
}

// ---------------------------------------------------------------------------
// normalizePlayer
// ---------------------------------------------------------------------------

/**
 * Pure function: maps one API-Football player statistics object → MatchEvents.
 *
 * @param stats         - One element from response[n].players
 * @param teamConceded  - How many goals did this player's team concede (for cleanSheet logic)
 *
 * Field mapping:
 *   minutes      ← statistics[0].games.minutes (null → 0)
 *   goals        ← statistics[0].goals.total (null → 0)
 *   assists      ← statistics[0].goals.assists (null → 0)
 *   cleanSheet   ← minutes >= 60 AND teamConceded === 0
 *   played60     ← minutes >= 60
 *   tackles      ← statistics[0].tackles.total (null → 0)
 *   keyPasses    ← statistics[0].passes.key (null → 0)
 *   saves        ← statistics[0].goals.saves (null → 0)
 *   penaltiesSaved ← statistics[0].penalty.saved (null → 0)
 *   penaltiesMissed ← statistics[0].penalty.missed (null → 0)
 *   yellowCards  ← statistics[0].cards.yellow (null → 0)
 *   redCards     ← statistics[0].cards.red (null → 0)
 *   manOfTheMatch ← statistics[0].games.motm (null → false)
 *   goalsConceded ← statistics[0].goals.conceded (GK; null → 0)
 *                   NOTE: For non-GK players the API either omits or sets 0; we always store it.
 *   ownGoals     ← API-Football does NOT expose own goals in /fixtures/players.
 *                   We approximate as 0. (Own goals appear in /fixtures/events
 *                   but that requires a separate endpoint call; the oracle can
 *                   enrich this field in a future pass if needed.)
 */
export function normalizePlayer(
  stats: ApiPlayerStats,
  teamConceded: number,
): MatchEvents {
  const s = stats.statistics?.[0];
  if (!s) {
    // No statistics entry — treat as DNP
    return {
      minutes: 0,
      goals: 0,
      assists: 0,
      cleanSheet: false,
      played60: false,
      tackles: 0,
      keyPasses: 0,
      saves: 0,
      penaltiesSaved: 0,
      penaltiesMissed: 0,
      yellowCards: 0,
      redCards: 0,
      manOfTheMatch: false,
      ownGoals: 0,
      goalsConceded: 0,
    };
  }

  const minutes = safeInt(s.games?.minutes);
  const played60 = minutes >= 60;
  // cleanSheet: player was on the pitch for 60+ minutes AND team conceded 0
  const cleanSheet = played60 && teamConceded === 0;

  return {
    minutes,
    goals: safeInt(s.goals?.total),
    assists: safeInt(s.goals?.assists),
    cleanSheet,
    played60,
    tackles: safeInt(s.tackles?.total),
    keyPasses: safeInt(s.passes?.key),
    saves: safeInt(s.goals?.saves),
    penaltiesSaved: safeInt(s.penalty?.saved),
    penaltiesMissed: safeInt(s.penalty?.missed),
    yellowCards: safeInt(s.cards?.yellow),
    redCards: safeInt(s.cards?.red),
    manOfTheMatch: safeBool(s.games?.motm),
    // Approximation: ownGoals = 0 (API-Football /fixtures/players does not expose
    // own goals at this endpoint; a future enrichment pass can set this from /fixtures/events)
    ownGoals: 0,
    // goalsConceded: API returns this for GKs in goals.conceded; for outfield players it's
    // typically null (→ 0). We store whatever the API gives.
    goalsConceded: safeInt(s.goals?.conceded),
  };
}

// ---------------------------------------------------------------------------
// ingestFixture
// ---------------------------------------------------------------------------

/**
 * Fetch, normalize, and upsert one fixture's player data to Supabase.
 *
 * Unmapped players (no entry in PLAYER_BY_APIID) are still stored with their
 * api_football_id as the player_key and a warning is logged. They won't affect
 * scoring because the score runner resolves player_key → playerId via lib/data.
 *
 * Upsert key: (matchday, fixture_id, player_key)
 */
export async function ingestFixture(
  fixtureId: number,
  matchday: number,
): Promise<void> {
  const raw = await fetchFixturePlayers(fixtureId);
  const db = supabaseAdmin();

  const rows: Array<{
    matchday: number;
    fixture_id: number;
    player_key: string;
    raw: object;
    events: MatchEvents;
  }> = [];

  for (const teamEntry of raw.teams) {
    const teamId = teamEntry.team.id;
    const conceded = raw.teamConceded[teamId] ?? 0;

    for (const playerStats of teamEntry.players) {
      const apiId = playerStats.player.id;
      const playerDef = PLAYER_BY_APIID.get(apiId);

      let playerKey: string;
      if (playerDef) {
        // Map API id → on-chain player key (the keccak256 bytes32 playerId)
        playerKey = playerDef.playerId;
      } else {
        // Unmapped player — store with api id as key; log for observability
        playerKey = `api:${apiId}`;
        console.warn(
          `[ingest] fixtureId=${fixtureId} — unmapped API-Football player ` +
            `id=${apiId} name="${playerStats.player.name}". ` +
            `Add apiFootballId to lib/data/players.ts to include in scoring.`,
        );
      }

      const normalized = normalizePlayer(playerStats, conceded);

      rows.push({
        matchday,
        fixture_id: fixtureId,
        player_key: playerKey,
        raw: playerStats as unknown as object,
        events: normalized,
      });
    }
  }

  if (rows.length === 0) {
    console.warn(`[ingest] No player rows to upsert for fixtureId=${fixtureId}`);
    return;
  }

  const { error } = await db.from("match_events").upsert(rows, {
    onConflict: "matchday,fixture_id,player_key",
  });

  if (error) {
    throw new Error(
      `[ingest] Supabase upsert failed for fixtureId=${fixtureId}: ${error.message}`,
    );
  }

  console.log(
    `[ingest] Upserted ${rows.length} player rows for fixtureId=${fixtureId} matchday=${matchday}`,
  );
}
