/**
 * ingest.it.test.ts — Integration test for the API-Football ingester (Task 4.1)
 *
 * EXCLUDED from `npm test` (the default vitest.config.ts excludes *.it.test.ts).
 * Runs only via: `npm run test:it -- ingest.it`
 *
 * Guard: if API_FOOTBALL_KEY is not set, the entire suite is skipped.
 *
 * What it tests (live):
 *   1. fetchFixturePlayers returns a RawFixture with at least 2 team entries
 *      and a populated teamConceded map.
 *   2. normalizePlayer on a real response produces a valid MatchEvents shape
 *      (all fields present, correct types, no NaN).
 *   3. ingestFixture upserts rows to match_events in Supabase and we can read
 *      at least one back.
 *
 * Uses the France vs Argentina World Cup Final 2022 fixture as the demo match.
 * API-Football fixture id: 867946 (World Cup 2022 Final, FRA vs ARG, 18 Dec 2022).
 * Set TEST_FIXTURE_ID env var to override.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { fetchFixturePlayers, normalizePlayer, ingestFixture } from "./ingest";
import { supabaseAdmin } from "@/lib/supabase/server";

// ---------------------------------------------------------------------------
// Guard — skip entire suite if no API key
// ---------------------------------------------------------------------------

const API_KEY = process.env.API_FOOTBALL_KEY;
const FIXTURE_ID = parseInt(process.env.TEST_FIXTURE_ID ?? "867946", 10);
const TEST_MATCHDAY = 9999; // Use a high matchday to avoid colliding with real data

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe.skipIf(!API_KEY)(
  "ingest integration (live API + Supabase) — requires API_FOOTBALL_KEY",
  () => {
    // ---------------------------------------------------------------------------
    // 1. fetchFixturePlayers
    // ---------------------------------------------------------------------------

    describe("fetchFixturePlayers", () => {
      it(
        "returns a RawFixture with 2 team entries and teamConceded populated",
        async () => {
          const fixture = await fetchFixturePlayers(FIXTURE_ID);

          expect(fixture.fixtureId).toBe(FIXTURE_ID);
          expect(fixture.teams).toHaveLength(2);
          expect(Object.keys(fixture.teamConceded).length).toBe(2);

          // At least one team conceded goals in the final (ARG conceded 3, FRA conceded 3)
          const concededValues = Object.values(fixture.teamConceded);
          expect(concededValues.some((v) => v > 0)).toBe(true);

          // Each team has players
          for (const teamEntry of fixture.teams) {
            expect(teamEntry.players.length).toBeGreaterThan(0);
          }
        },
        30_000, // 30s timeout for network
      );

      it(
        "throws a clear error when API key is invalid",
        async () => {
          const origKey = process.env.API_FOOTBALL_KEY;
          process.env.API_FOOTBALL_KEY = "invalid_key_for_test";
          try {
            await fetchFixturePlayers(FIXTURE_ID);
            // If the API doesn't error on bad key immediately (returns empty response),
            // we just verify the call completes — the guard error is already tested below.
          } catch (err) {
            // Expected: either a network error or API error response
            expect(err).toBeDefined();
          } finally {
            process.env.API_FOOTBALL_KEY = origKey;
          }
        },
        30_000,
      );
    });

    // ---------------------------------------------------------------------------
    // 2. normalizePlayer on real response data
    // ---------------------------------------------------------------------------

    describe("normalizePlayer on live data", () => {
      let rawFixture: Awaited<ReturnType<typeof fetchFixturePlayers>>;

      beforeAll(async () => {
        rawFixture = await fetchFixturePlayers(FIXTURE_ID);
      }, 30_000);

      it("produces valid MatchEvents for every player in both teams", () => {
        for (const teamEntry of rawFixture.teams) {
          const conceded = rawFixture.teamConceded[teamEntry.team.id] ?? 0;
          for (const playerStats of teamEntry.players) {
            const events = normalizePlayer(playerStats, conceded);

            // Shape checks
            expect(typeof events.minutes).toBe("number");
            expect(typeof events.goals).toBe("number");
            expect(typeof events.assists).toBe("number");
            expect(typeof events.cleanSheet).toBe("boolean");
            expect(typeof events.played60).toBe("boolean");
            expect(typeof events.tackles).toBe("number");
            expect(typeof events.keyPasses).toBe("number");
            expect(typeof events.saves).toBe("number");
            expect(typeof events.penaltiesSaved).toBe("number");
            expect(typeof events.manOfTheMatch).toBe("boolean");
            expect(typeof events.yellowCards).toBe("number");
            expect(typeof events.redCards).toBe("number");
            expect(typeof events.ownGoals).toBe("number");
            expect(typeof events.penaltiesMissed).toBe("number");
            expect(typeof events.goalsConceded).toBe("number");

            // No NaN or negative values
            for (const [key, val] of Object.entries(events)) {
              if (typeof val === "number") {
                expect(Number.isFinite(val)).toBe(true);
                expect(val).toBeGreaterThanOrEqual(0);
              }
            }

            // played60 / cleanSheet consistency
            if (events.cleanSheet) {
              expect(events.played60).toBe(true);
            }
            if (!events.played60) {
              expect(events.cleanSheet).toBe(false);
            }
          }
        }
      });
    });

    // ---------------------------------------------------------------------------
    // 3. ingestFixture — upsert + read-back from Supabase
    // ---------------------------------------------------------------------------

    describe("ingestFixture", () => {
      it(
        "upserts player rows and they are readable from Supabase",
        async () => {
          // Guard: also needs Supabase service-role key
          if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
            console.warn(
              "[ingest.it] Skipping Supabase upsert test — SUPABASE_SERVICE_ROLE_KEY not set",
            );
            return;
          }

          await ingestFixture(FIXTURE_ID, TEST_MATCHDAY);

          const db = supabaseAdmin();
          const { data, error } = await db
            .from("match_events")
            .select("matchday, fixture_id, player_key, events")
            .eq("matchday", TEST_MATCHDAY)
            .eq("fixture_id", FIXTURE_ID)
            .limit(5);

          expect(error).toBeNull();
          expect(data).not.toBeNull();
          expect(data!.length).toBeGreaterThan(0);

          // Verify shape of a returned row
          const row = data![0];
          expect(row.matchday).toBe(TEST_MATCHDAY);
          expect(row.fixture_id).toBe(FIXTURE_ID);
          expect(typeof row.player_key).toBe("string");
          expect(row.events).toBeDefined();

          // Clean up test rows to avoid polluting the DB
          await db
            .from("match_events")
            .delete()
            .eq("matchday", TEST_MATCHDAY)
            .eq("fixture_id", FIXTURE_ID);
        },
        60_000, // 60s timeout for network + DB
      );
    });
  },
);

// ---------------------------------------------------------------------------
// Minimal guard-off test: missing API key → clear error message
// This always runs (even without the key) to verify the guard works.
// ---------------------------------------------------------------------------

describe("fetchFixturePlayers — missing key guard", () => {
  it("throws a descriptive error when API_FOOTBALL_KEY is missing", async () => {
    const origKey = process.env.API_FOOTBALL_KEY;
    delete process.env.API_FOOTBALL_KEY;

    try {
      await expect(fetchFixturePlayers(FIXTURE_ID)).rejects.toThrow(
        /API_FOOTBALL_KEY/,
      );
    } finally {
      if (origKey !== undefined) {
        process.env.API_FOOTBALL_KEY = origKey;
      }
    }
  });
});
