/**
 * fixtures.ts — On-chain scoring/lifecycle demo fixtures for PANENKA.
 *
 * These are NOT the World Cup schedule. The real 2026 tournament draw and
 * group-stage fixtures live in `lib/data/worldcup2026.ts` (and the /schedule
 * page). This file drives the on-chain game loop: each entry maps to one
 * GameRegistry matchday number and is consumed by `services/lifecycle/cron.ts`.
 *
 * Until the World Cup kicks off (11 Jun 2026) there are no live matches to
 * settle against, so the demo replays real, finished historical matches between
 * the four squads PANENKA ships cards for (FRA / ARG / ENG / BRA).
 *
 * fixtureId semantics (read by cron.ts -> isFixtureFinished):
 *   0          : OFFLINE mode. No API-Football call; trust the static `status`
 *                below. This is intentional, not a placeholder.
 *   <real id>  : LIVE mode. Set API_FOOTBALL_KEY and a real fixture id to drive
 *                settlement from the live feed instead.
 */

import type { Nation } from "./nations";

export interface Fixture {
  fixtureId: number;
  matchday: number;
  home: Nation;
  away: Nation;
  kickoff: string; // ISO 8601
  status: "SCHEDULED" | "LIVE" | "FINISHED" | "POSTPONED";
}

// Offline-replay sentinel (see fixtureId semantics above). Set a real
// API-Football fixture id here to switch the demo into live settlement mode.
export const DEMO_FIXTURE_ID = 0;
export const DEMO_FIXTURE_ID_ENG_BRA = 0;

export const FIXTURES: Fixture[] = [
  {
    // France 3-3 Argentina, 2022 World Cup Final (18 Dec 2022). Replayed as the
    // headline demo matchday: a real, finished match for offline scoring.
    fixtureId: DEMO_FIXTURE_ID,
    matchday: 1,
    home: "FRA",
    away: "ARG",
    kickoff: "2022-12-18T15:00:00Z",
    status: "FINISHED",
  },
  {
    // England vs Brazil, real finished fixture used for the second demo matchday.
    fixtureId: DEMO_FIXTURE_ID_ENG_BRA,
    matchday: 2,
    home: "ENG",
    away: "BRA",
    kickoff: "2023-03-23T19:45:00Z",
    status: "FINISHED",
  },
  {
    // Brazil vs France, third demo matchday (offline replay).
    fixtureId: 0,
    matchday: 3,
    home: "BRA",
    away: "FRA",
    kickoff: "2024-06-01T18:00:00Z",
    status: "FINISHED",
  },
];
