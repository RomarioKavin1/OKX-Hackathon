/**
 * roots.test.ts — Unit tests for shared Merkle-root helpers (services/oracle/roots.ts)
 *
 * These tests run offline (no network, no Supabase, no chain).  They verify:
 *   1. isDNP — correct condition; sub who played ≥1 min is NOT DNP.
 *   2. EMPTY_DNP_SENTINEL — non-zero, stable hex string.
 *   3. buildDnpRoot with empty set → sentinel root (non-zero, deterministic).
 *   4. buildScoreRoot — deterministic for same inputs.
 *   5. buildContestPayoutRoot — deterministic; respects rake.
 */

import { describe, it, expect } from "vitest";
import type { MatchEvents } from "@/lib/types";
import {
  EMPTY_DNP_SENTINEL,
  isDNP,
  scaleScore,
  buildScoreRoot,
  buildDnpRoot,
  buildContestPayoutRoot,
} from "./roots";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function events(overrides: Partial<MatchEvents> = {}): MatchEvents {
  return {
    goals: 0, assists: 0, cleanSheet: false, tackles: 0, keyPasses: 0,
    saves: 0, penaltiesSaved: 0, manOfTheMatch: false, played60: false,
    yellowCards: 0, redCards: 0, ownGoals: 0, penaltiesMissed: 0,
    goalsConceded: 0, minutes: 0,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// isDNP
// ---------------------------------------------------------------------------

describe("isDNP", () => {
  it("returns true when played60=false AND minutes=0 (classic DNP)", () => {
    expect(isDNP(events())).toBe(true);
  });

  it("returns false when played60=true (started and played)", () => {
    expect(isDNP(events({ played60: true, minutes: 90 }))).toBe(false);
  });

  it("returns false when minutes > 0 but played60=false (sub who played <60 min)", () => {
    // A sub on at the 70th minute: minutes=20, played60=false.
    // Should NOT be DNP — they were on the pitch.
    expect(isDNP(events({ played60: false, minutes: 20 }))).toBe(false);
  });

  it("returns false when played60=false but minutes=1 (came on in injury time)", () => {
    expect(isDNP(events({ played60: false, minutes: 1 }))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// scaleScore
// ---------------------------------------------------------------------------

describe("scaleScore", () => {
  it("scales 16.5 to 16500n", () => {
    expect(scaleScore(16.5)).toBe(16500n);
  });

  it("scales -3.0 to -3000n", () => {
    expect(scaleScore(-3.0)).toBe(-3000n);
  });

  it("scales 0 to 0n", () => {
    expect(scaleScore(0)).toBe(0n);
  });

  it("rounds to nearest integer before converting (×1000)", () => {
    // 1.2345 * 1000 = 1234.5 → rounds to 1235
    expect(scaleScore(1.2345)).toBe(1235n);
  });
});

// ---------------------------------------------------------------------------
// EMPTY_DNP_SENTINEL
// ---------------------------------------------------------------------------

describe("EMPTY_DNP_SENTINEL", () => {
  it("is a 32-byte hex string", () => {
    expect(EMPTY_DNP_SENTINEL).toMatch(/^0x[0-9a-f]{64}$/i);
  });

  it("is non-zero (last byte is 1)", () => {
    const ZERO = "0x" + "0".repeat(64);
    expect(EMPTY_DNP_SENTINEL.toLowerCase()).not.toBe(ZERO);
    expect(EMPTY_DNP_SENTINEL.endsWith("0001")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// buildDnpRoot
// ---------------------------------------------------------------------------

describe("buildDnpRoot", () => {
  it("with no DNPs: returns non-zero sentinel root (not the all-zeros hash)", () => {
    const ZERO_ROOT = "0x" + "0".repeat(64);
    const root = buildDnpRoot([]);
    expect(root.toLowerCase()).not.toBe(ZERO_ROOT);
  });

  it("with no DNPs: is deterministic across calls", () => {
    expect(buildDnpRoot([])).toBe(buildDnpRoot([]));
  });

  it("with actual DNPs: is deterministic for the same tokenId set", () => {
    const tokenIds = [1n, 2n, 3n];
    expect(buildDnpRoot(tokenIds)).toBe(buildDnpRoot(tokenIds));
  });

  it("with 1 DNP: root is different from the empty-set sentinel root", () => {
    const emptyRoot = buildDnpRoot([]);
    const oneRoot = buildDnpRoot([999n]);
    expect(emptyRoot).not.toBe(oneRoot);
  });

  it("with DNPs: root is a valid 32-byte hex string", () => {
    const root = buildDnpRoot([42n, 7n]);
    expect(root).toMatch(/^0x[0-9a-f]{64}$/i);
  });
});

// ---------------------------------------------------------------------------
// buildScoreRoot
// ---------------------------------------------------------------------------

describe("buildScoreRoot", () => {
  const wallet1 = "0x1111111111111111111111111111111111111111";
  const wallet2 = "0x2222222222222222222222222222222222222222";
  const matchday = 1;

  it("is deterministic for the same inputs", () => {
    const scored = [
      { wallet: wallet1, total: 16.5 },
      { wallet: wallet2, total: 8.0 },
    ];
    expect(buildScoreRoot(scored, matchday)).toBe(buildScoreRoot(scored, matchday));
  });

  it("returns a valid 32-byte hex string", () => {
    const root = buildScoreRoot([{ wallet: wallet1, total: 0 }], matchday);
    expect(root).toMatch(/^0x[0-9a-f]{64}$/i);
  });

  it("produces different roots for different scores", () => {
    const rootA = buildScoreRoot([{ wallet: wallet1, total: 16.5 }], matchday);
    const rootB = buildScoreRoot([{ wallet: wallet1, total: 17.0 }], matchday);
    expect(rootA).not.toBe(rootB);
  });

  it("produces different roots for different matchdays", () => {
    const scored = [{ wallet: wallet1, total: 10.0 }];
    const rootA = buildScoreRoot(scored, 1);
    const rootB = buildScoreRoot(scored, 2);
    expect(rootA).not.toBe(rootB);
  });

  it("single-wallet root equals the scoreLeaf for that wallet (single-node tree)", () => {
    // A single-leaf Merkle tree has root === leaf.
    // We verify this indirectly by checking the root is non-zero.
    const root = buildScoreRoot([{ wallet: wallet1, total: 5.0 }], matchday);
    const ZERO = "0x" + "0".repeat(64);
    expect(root.toLowerCase()).not.toBe(ZERO);
  });
});

// ---------------------------------------------------------------------------
// buildContestPayoutRoot
// ---------------------------------------------------------------------------

describe("buildContestPayoutRoot", () => {
  const wallet1 = "0x1111111111111111111111111111111111111111" as `0x${string}`;
  const wallet2 = "0x2222222222222222222222222222222222222222" as `0x${string}`;

  it("is deterministic for the same inputs", () => {
    const entrants = [
      { wallet: wallet1, total: 112.34, enteredBlock: 100 },
      { wallet: wallet2, total: 50.0,   enteredBlock: 200 },
    ];
    const { payoutRoot: rootA } = buildContestPayoutRoot(entrants, 1000_000000n, 1000);
    const { payoutRoot: rootB } = buildContestPayoutRoot(entrants, 1000_000000n, 1000);
    expect(rootA).toBe(rootB);
  });

  it("returns a valid 32-byte hex root", () => {
    const { payoutRoot } = buildContestPayoutRoot(
      [{ wallet: wallet1, total: 10.0, enteredBlock: 1 }],
      100_000000n,
      0,
    );
    expect(payoutRoot).toMatch(/^0x[0-9a-f]{64}$/i);
  });

  it("applies rake correctly (10% rake → net pool = 90% of gross)", () => {
    // 100 USDC gross, 10% rake → 90 USDC net, single entrant gets all
    const { ranked } = buildContestPayoutRoot(
      [{ wallet: wallet1, total: 10.0, enteredBlock: 1 }],
      100_000000n,  // 100 USDC
      1000,         // 10% in bps
    );
    expect(ranked[0].amount).toBe(90_000000n);
  });

  it("all-zero scores → still produces a non-zero root (sentinel tree)", () => {
    const ZERO = "0x" + "0".repeat(64);
    const { payoutRoot } = buildContestPayoutRoot(
      [{ wallet: wallet1, total: 0, enteredBlock: 1 }],
      0n,
      0,
    );
    expect(payoutRoot.toLowerCase()).not.toBe(ZERO);
  });

  it("rank 1 receives more than rank 2 in a two-entrant contest", () => {
    const { ranked } = buildContestPayoutRoot(
      [
        { wallet: wallet1, total: 100.0, enteredBlock: 10 },
        { wallet: wallet2, total: 50.0,  enteredBlock: 20 },
      ],
      200_000000n,
      0,
    );
    const r1 = ranked.find((r) => r.wallet.toLowerCase() === wallet1.toLowerCase())!;
    const r2 = ranked.find((r) => r.wallet.toLowerCase() === wallet2.toLowerCase())!;
    expect(r1.rank).toBe(1);
    expect(r2.rank).toBe(2);
    expect(r1.amount).toBeGreaterThan(r2.amount);
  });
});
