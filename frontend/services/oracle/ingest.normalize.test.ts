/**
 * ingest.normalize.test.ts — Offline unit tests for normalizePlayer (Task 4.1)
 *
 * PURE, offline — no network, no Supabase. Runs in the default `npm test` suite.
 *
 * Three scenarios:
 *   1. scorer    — outfield player with goals/assists/tackles (60+ min)
 *   2. cleanGK   — goalkeeper with saves + clean sheet (played 90 min, team conceded 0)
 *   3. sub       — substitute who played <60 min (no cleanSheet, played60=false)
 */

import { describe, it, expect } from "vitest";
import { normalizePlayer } from "./ingest";
import type { ApiPlayerStats } from "./ingest";

// ---------------------------------------------------------------------------
// Hand-built API-Football player stats objects
// ---------------------------------------------------------------------------

/** Helper to build a minimal ApiPlayerStats object */
function makeStats(overrides: {
  playerId?: number;
  minutes?: number | null;
  motm?: boolean | null;
  goals?: number | null;
  assists?: number | null;
  saves?: number | null;
  conceded?: number | null;
  tackles?: number | null;
  keyPasses?: number | null;
  penaltySaved?: number | null;
  penaltyMissed?: number | null;
  yellow?: number | null;
  red?: number | null;
}): ApiPlayerStats {
  return {
    player: { id: overrides.playerId ?? 1, name: "Test Player" },
    statistics: [
      {
        games: {
          minutes: overrides.minutes ?? null,
          motm: overrides.motm ?? null,
        },
        goals: {
          total: overrides.goals ?? null,
          assists: overrides.assists ?? null,
          saves: overrides.saves ?? null,
          conceded: overrides.conceded ?? null,
        },
        tackles: {
          total: overrides.tackles ?? null,
        },
        passes: {
          key: overrides.keyPasses ?? null,
        },
        penalty: {
          saved: overrides.penaltySaved ?? null,
          missed: overrides.penaltyMissed ?? null,
        },
        cards: {
          yellow: overrides.yellow ?? null,
          red: overrides.red ?? null,
        },
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Scenario 1: Scorer — outfield player, 90 min, 2 goals, 1 assist, 3 tackles,
//             1 key pass, team conceded 1 (so NO clean sheet), MOTM
// ---------------------------------------------------------------------------

describe("normalizePlayer — scorer (outfield, 90 min)", () => {
  const stats = makeStats({
    minutes: 90,
    motm: true,
    goals: 2,
    assists: 1,
    tackles: 3,
    keyPasses: 1,
    yellow: 1,
  });
  // Team conceded 1 → no clean sheet even though played 90+ min
  const result = normalizePlayer(stats, 1);

  it("minutes is 90", () => {
    expect(result.minutes).toBe(90);
  });

  it("played60 is true (90 >= 60)", () => {
    expect(result.played60).toBe(true);
  });

  it("cleanSheet is false (team conceded 1)", () => {
    expect(result.cleanSheet).toBe(false);
  });

  it("goals is 2", () => {
    expect(result.goals).toBe(2);
  });

  it("assists is 1", () => {
    expect(result.assists).toBe(1);
  });

  it("tackles is 3", () => {
    expect(result.tackles).toBe(3);
  });

  it("keyPasses is 1", () => {
    expect(result.keyPasses).toBe(1);
  });

  it("yellowCards is 1", () => {
    expect(result.yellowCards).toBe(1);
  });

  it("redCards is 0 (not set → null → 0)", () => {
    expect(result.redCards).toBe(0);
  });

  it("manOfTheMatch is true", () => {
    expect(result.manOfTheMatch).toBe(true);
  });

  it("saves is 0 (not a GK)", () => {
    expect(result.saves).toBe(0);
  });

  it("penaltiesSaved is 0", () => {
    expect(result.penaltiesSaved).toBe(0);
  });

  it("penaltiesMissed is 0", () => {
    expect(result.penaltiesMissed).toBe(0);
  });

  it("ownGoals is 0 (approximation — API endpoint does not expose it)", () => {
    expect(result.ownGoals).toBe(0);
  });

  it("goalsConceded is 0 (not a GK → API returns null → 0)", () => {
    expect(result.goalsConceded).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Scenario 2: Clean-sheet GK — 90 min, 5 saves, 1 penalty saved,
//             team conceded 0 → cleanSheet = true
// ---------------------------------------------------------------------------

describe("normalizePlayer — GK with clean sheet (90 min, team conceded 0)", () => {
  const stats = makeStats({
    minutes: 90,
    saves: 5,
    conceded: 0, // API fills goals.conceded for GKs
    penaltySaved: 1,
  });
  const result = normalizePlayer(stats, 0); // team conceded 0

  it("minutes is 90", () => {
    expect(result.minutes).toBe(90);
  });

  it("played60 is true", () => {
    expect(result.played60).toBe(true);
  });

  it("cleanSheet is true (played 90 min, team conceded 0)", () => {
    expect(result.cleanSheet).toBe(true);
  });

  it("saves is 5", () => {
    expect(result.saves).toBe(5);
  });

  it("penaltiesSaved is 1", () => {
    expect(result.penaltiesSaved).toBe(1);
  });

  it("goals is 0", () => {
    expect(result.goals).toBe(0);
  });

  it("assists is 0", () => {
    expect(result.assists).toBe(0);
  });

  it("goalsConceded is 0 (API set goals.conceded=0)", () => {
    expect(result.goalsConceded).toBe(0);
  });

  it("manOfTheMatch is false", () => {
    expect(result.manOfTheMatch).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Scenario 3: Sub who played <60 minutes (no impact on clean sheet)
// Team conceded 0 but player only played 45 min → played60=false, cleanSheet=false
// ---------------------------------------------------------------------------

describe("normalizePlayer — sub (45 min, team conceded 0)", () => {
  const stats = makeStats({
    minutes: 45,
    goals: 1, // scored after coming on
  });
  // Even though team conceded 0, sub played <60 → no clean sheet
  const result = normalizePlayer(stats, 0);

  it("minutes is 45", () => {
    expect(result.minutes).toBe(45);
  });

  it("played60 is false (45 < 60)", () => {
    expect(result.played60).toBe(false);
  });

  it("cleanSheet is false (played < 60 min)", () => {
    expect(result.cleanSheet).toBe(false);
  });

  it("goals is 1", () => {
    expect(result.goals).toBe(1);
  });

  it("assists is 0", () => {
    expect(result.assists).toBe(0);
  });

  it("saves is 0", () => {
    expect(result.saves).toBe(0);
  });

  it("manOfTheMatch is false", () => {
    expect(result.manOfTheMatch).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Scenario 4: Defensive nulls — all API fields are null (common for absent
//             stats on non-participating players). No statistics array entry.
// ---------------------------------------------------------------------------

describe("normalizePlayer — all-null fields (DNP / missing stats)", () => {
  const stats: ApiPlayerStats = {
    player: { id: 999, name: "Ghost Player" },
    statistics: [],
  };
  const result = normalizePlayer(stats, 2);

  it("minutes is 0", () => {
    expect(result.minutes).toBe(0);
  });

  it("played60 is false", () => {
    expect(result.played60).toBe(false);
  });

  it("cleanSheet is false", () => {
    expect(result.cleanSheet).toBe(false);
  });

  it("goals is 0", () => {
    expect(result.goals).toBe(0);
  });

  it("all numeric fields are 0 and boolean fields are false", () => {
    expect(result.assists).toBe(0);
    expect(result.tackles).toBe(0);
    expect(result.keyPasses).toBe(0);
    expect(result.saves).toBe(0);
    expect(result.penaltiesSaved).toBe(0);
    expect(result.penaltiesMissed).toBe(0);
    expect(result.yellowCards).toBe(0);
    expect(result.redCards).toBe(0);
    expect(result.ownGoals).toBe(0);
    expect(result.goalsConceded).toBe(0);
    expect(result.manOfTheMatch).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Scenario 5: Penalty-missed + red card edge case
// ---------------------------------------------------------------------------

describe("normalizePlayer — penalty missed + red card", () => {
  const stats = makeStats({
    minutes: 75,
    goals: 0,
    penaltyMissed: 1,
    red: 1,
  });
  const result = normalizePlayer(stats, 1);

  it("penaltiesMissed is 1", () => {
    expect(result.penaltiesMissed).toBe(1);
  });

  it("redCards is 1", () => {
    expect(result.redCards).toBe(1);
  });

  it("played60 is true (75 >= 60)", () => {
    expect(result.played60).toBe(true);
  });

  it("cleanSheet is false (team conceded 1)", () => {
    expect(result.cleanSheet).toBe(false);
  });
});
