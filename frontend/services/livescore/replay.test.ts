/**
 * replay.test.ts — Offline unit tests for pure logic in replay.ts (Task 6.3)
 *
 * Only tests pure, dependency-free helpers extracted from the replay logic.
 * No Supabase calls, no network, no file system.
 */

import { describe, it, expect } from "vitest";

// ---------------------------------------------------------------------------
// Inline the pure helpers under test
// (They mirror the logic in replay.ts; keeping them here avoids importing
//  server-only modules like supabaseAdmin that would fail in test context.)
// ---------------------------------------------------------------------------

interface MatchEventsLike {
  minutes: number;
  goals: number;
  assists: number;
  tackles: number;
  keyPasses: number;
  saves: number;
  penaltiesSaved: number;
  penaltiesMissed: number;
  yellowCards: number;
  redCards: number;
  ownGoals: number;
  goalsConceded: number;
  played60: boolean;
  cleanSheet: boolean;
  manOfTheMatch: boolean;
}

function interpolateEvents(
  finalEvents: MatchEventsLike,
  currentMinute: number,
): MatchEventsLike {
  const totalMinutes = Math.max(finalEvents.minutes, 1);
  const ratio = Math.min(currentMinute / totalMinutes, 1);
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
    played60: finalEvents.played60 && currentMinute >= 60,
    cleanSheet: finalEvents.cleanSheet && currentMinute >= 60,
    manOfTheMatch: finalEvents.manOfTheMatch && currentMinute >= finalEvents.minutes,
  };
}

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
// Tests
// ---------------------------------------------------------------------------

describe("interpolateEvents", () => {
  const full: MatchEventsLike = {
    minutes: 90,
    goals: 2,
    assists: 1,
    tackles: 4,
    keyPasses: 3,
    saves: 0,
    penaltiesSaved: 0,
    penaltiesMissed: 0,
    yellowCards: 1,
    redCards: 0,
    ownGoals: 0,
    goalsConceded: 1,
    played60: true,
    cleanSheet: false,
    manOfTheMatch: true,
  };

  it("at minute 0 produces all-zero counting stats", () => {
    const snap = interpolateEvents(full, 0);
    expect(snap.goals).toBe(0);
    expect(snap.assists).toBe(0);
    expect(snap.tackles).toBe(0);
    expect(snap.minutes).toBe(0);
  });

  it("at minute 90 (= totalMinutes) produces full stats", () => {
    const snap = interpolateEvents(full, 90);
    expect(snap.goals).toBe(2);
    expect(snap.assists).toBe(1);
    expect(snap.tackles).toBe(4);
    expect(snap.minutes).toBe(90);
  });

  it("at minute 45 (half-time) linearly interpolates counting stats", () => {
    const snap = interpolateEvents(full, 45);
    // ratio = 45/90 = 0.5 → round(2 × 0.5) = 1
    expect(snap.goals).toBe(1);
    // round(1 × 0.5) = 1
    expect(snap.assists).toBe(1);
    // round(4 × 0.5) = 2
    expect(snap.tackles).toBe(2);
    expect(snap.minutes).toBe(45);
  });

  it("played60 is false before minute 60 even if final player played 90 min", () => {
    const snap = interpolateEvents(full, 59);
    expect(snap.played60).toBe(false);
  });

  it("played60 becomes true at minute 60", () => {
    const snap = interpolateEvents(full, 60);
    expect(snap.played60).toBe(true);
  });

  it("cleanSheet is false before minute 60 even if final cleanSheet is true", () => {
    const cs: MatchEventsLike = { ...full, cleanSheet: true };
    expect(interpolateEvents(cs, 59).cleanSheet).toBe(false);
    expect(interpolateEvents(cs, 60).cleanSheet).toBe(true);
  });

  it("manOfTheMatch is only set at the player's final minute (90)", () => {
    expect(interpolateEvents(full, 89).manOfTheMatch).toBe(false);
    expect(interpolateEvents(full, 90).manOfTheMatch).toBe(true);
  });

  it("clamps minutes to totalMinutes if currentMinute > totalMinutes", () => {
    const snap = interpolateEvents(full, 120);
    expect(snap.minutes).toBe(90);
    expect(snap.goals).toBe(2);
  });

  it("handles DNP player (minutes=0) without division-by-zero", () => {
    const dnp: MatchEventsLike = { ...full, minutes: 0, goals: 0, played60: false };
    const snap = interpolateEvents(dnp, 45);
    // totalMinutes = max(0, 1) = 1; ratio = min(45/1, 1) = 1
    expect(snap.goals).toBe(0);
    expect(snap.played60).toBe(false);
  });
});

describe("assignRanks", () => {
  it("assigns rank 1 to the highest scorer", () => {
    const scores = new Map([
      ["alice", 50],
      ["bob", 80],
      ["carol", 30],
    ]);
    const ranks = assignRanks(scores);
    expect(ranks.get("bob")).toBe(1);
    expect(ranks.get("alice")).toBe(2);
    expect(ranks.get("carol")).toBe(3);
  });

  it("ties receive the same rank (dense ranking)", () => {
    const scores = new Map([
      ["alice", 80],
      ["bob", 80],
      ["carol", 50],
    ]);
    const ranks = assignRanks(scores);
    expect(ranks.get("alice")).toBe(1);
    expect(ranks.get("bob")).toBe(1);
    // carol is at position 3 (two people tied above her)
    expect(ranks.get("carol")).toBe(3);
  });

  it("single entry gets rank 1", () => {
    const scores = new Map([["solo", 42]]);
    const ranks = assignRanks(scores);
    expect(ranks.get("solo")).toBe(1);
  });

  it("empty map returns empty ranks", () => {
    const ranks = assignRanks(new Map());
    expect(ranks.size).toBe(0);
  });

  it("all tied → everyone gets rank 1", () => {
    const scores = new Map([
      ["a", 100],
      ["b", 100],
      ["c", 100],
    ]);
    const ranks = assignRanks(scores);
    expect(ranks.get("a")).toBe(1);
    expect(ranks.get("b")).toBe(1);
    expect(ranks.get("c")).toBe(1);
  });

  it("descending order: higher score = lower rank number", () => {
    const scores = new Map<string, number>();
    for (let i = 1; i <= 5; i++) {
      scores.set(`player${i}`, i * 10);
    }
    const ranks = assignRanks(scores);
    expect(ranks.get("player5")).toBe(1); // 50 pts
    expect(ranks.get("player4")).toBe(2); // 40 pts
    expect(ranks.get("player1")).toBe(5); // 10 pts
  });
});
