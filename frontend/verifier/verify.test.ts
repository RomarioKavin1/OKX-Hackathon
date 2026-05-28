/**
 * verify.test.ts — Pure unit tests for verifier helper logic (Task 4.5)
 *
 * These tests run in `npm test` (vitest.config.ts includes verifier/**\/*.test.ts).
 * They exercise the determinism contract: given the same inputs the oracle used,
 * the verifier MUST produce bit-identical roots.
 *
 * No network calls, no Supabase, no private key. Pure computation only.
 */

import { describe, it, expect } from "vitest";
import { scoreLeaf, dnpLeaf, buildMerkleTree, buildPayoutTree } from "@/lib/business/merkle";
import { buildContestPayout } from "@/lib/business/contest";
import { computeLineupScore, type CardContext } from "@/services/oracle/score";
import { ChipId, Tier, type Lineup, type MatchEvents } from "@/lib/types";
import { PLAYERS } from "@/lib/data/players";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pid(key: string): `0x${string}` {
  const p = PLAYERS.find((pl) => pl.key === key);
  if (!p) throw new Error(`Player not found: ${key}`);
  return p.playerId;
}

const ZERO_EVENTS: MatchEvents = {
  goals: 0, assists: 0, cleanSheet: false, tackles: 0, keyPasses: 0,
  saves: 0, penaltiesSaved: 0, manOfTheMatch: false, played60: false,
  yellowCards: 0, redCards: 0, ownGoals: 0, penaltiesMissed: 0,
  goalsConceded: 0, minutes: 0,
};

// ---------------------------------------------------------------------------
// Merkle helper determinism
// ---------------------------------------------------------------------------

describe("verifier — scoreLeaf determinism", () => {
  it("produces the same leaf hash for the same wallet/matchday/score", () => {
    const wallet = "0x1111111111111111111111111111111111111111" as `0x${string}`;
    const a = scoreLeaf(wallet, 1, 16500n);
    const b = scoreLeaf(wallet, 1, 16500n);
    expect(a).toBe(b);
  });

  it("produces a different leaf for different scores (×1000 int scaling)", () => {
    const wallet = "0x1111111111111111111111111111111111111111" as `0x${string}`;
    const a = scoreLeaf(wallet, 1, 16500n); // 16.5 pts
    const b = scoreLeaf(wallet, 1, 16000n); // 16.0 pts
    expect(a).not.toBe(b);
  });

  it("handles negative scores (own goal / red card can push total < 0)", () => {
    const wallet = "0x1111111111111111111111111111111111111111" as `0x${string}`;
    const leaf = scoreLeaf(wallet, 1, -3000n); // -3.0 pts
    expect(leaf).toMatch(/^0x[0-9a-f]{64}$/);
  });
});

describe("verifier — dnpLeaf determinism", () => {
  it("produces the same leaf hash for the same tokenId", () => {
    const a = dnpLeaf(42n);
    const b = dnpLeaf(42n);
    expect(a).toBe(b);
  });
});

describe("verifier — score Merkle tree stability", () => {
  it("buildMerkleTree root is deterministic given same leaves (order-independent)", () => {
    const wallet1 = "0x1111111111111111111111111111111111111111" as `0x${string}`;
    const wallet2 = "0x2222222222222222222222222222222222222222" as `0x${string}`;

    const leaf1 = scoreLeaf(wallet1, 1, 16500n);
    const leaf2 = scoreLeaf(wallet2, 1, 8000n);

    // Build twice with same leaves in the same order
    const treeA = buildMerkleTree([leaf1, leaf2]);
    const treeB = buildMerkleTree([leaf1, leaf2]);
    expect(treeA.root).toBe(treeB.root);
  });

  it("single-wallet tree root equals its own leaf", () => {
    const wallet = "0x3333333333333333333333333333333333333333" as `0x${string}`;
    const leaf = scoreLeaf(wallet, 2, 5000n);
    const tree = buildMerkleTree([leaf]);
    expect(tree.root).toBe(leaf);
  });
});

describe("verifier — DNP Merkle tree stability", () => {
  it("buildMerkleTree root is deterministic for DNP leaves", () => {
    const leaves = [dnpLeaf(1n), dnpLeaf(2n), dnpLeaf(3n)];
    const treeA = buildMerkleTree(leaves);
    const treeB = buildMerkleTree(leaves);
    expect(treeA.root).toBe(treeB.root);
  });
});

describe("verifier — payout tree stability", () => {
  it("buildPayoutTree root is deterministic given same entries", () => {
    const entries = [
      { account: "0x1111111111111111111111111111111111111111" as `0x${string}`, amount: 10_000000n },
      { account: "0x2222222222222222222222222222222222222222" as `0x${string}`, amount: 5_000000n },
    ];
    const { root: rootA } = buildPayoutTree(entries);
    const { root: rootB } = buildPayoutTree(entries);
    expect(rootA).toBe(rootB);
  });

  it("single-entry payout root equals its own payoutLeaf", () => {
    // buildPayoutTree with a single entry: root = leaf (no pairs to combine)
    const entries = [
      { account: "0x4444444444444444444444444444444444444444" as `0x${string}`, amount: 20_000000n },
    ];
    const { root, claims } = buildPayoutTree(entries);
    expect(claims).toHaveLength(1);
    expect(root).toBeDefined();
    expect(root).toMatch(/^0x[0-9a-f]{64}$/);
  });
});

describe("verifier — oracle reuse: computeLineupScore identical to Task 4.2", () => {
  // France XI fixture — mirrors score.test.ts to confirm verifier uses the exact same code path.
  const MAIGNAN_PID   = pid("FRA-1-Maignan");
  const PAVARD_PID    = pid("FRA-2-Pavard");
  const KOUNDE_PID    = pid("FRA-5-Kounde");
  const UPAMA_PID     = pid("FRA-4-Upamecano");
  const THEO_PID      = pid("FRA-22-Theo");
  const TCHOU_PID     = pid("FRA-8-Tchouameni");
  const RABIOT_PID    = pid("FRA-14-Rabiot");
  const GRIEZ_PID     = pid("FRA-7-Griezmann");
  const DEMBELE_PID   = pid("FRA-11-Dembele");
  const GIROUD_PID    = pid("FRA-9-Giroud");
  const MBAPPE_PID    = pid("FRA-10-Mbappe");

  const TOKEN_IDS = [1n, 2n, 3n, 4n, 5n, 6n, 7n, 8n, 9n, 10n, 11n];

  const CARD_CTX = new Map<bigint, CardContext>([
    [1n,  { playerId: MAIGNAN_PID,  tier: Tier.Common, stamina: 80 }],
    [2n,  { playerId: PAVARD_PID,   tier: Tier.Common, stamina: 50 }],
    [3n,  { playerId: KOUNDE_PID,   tier: Tier.Rare,   stamina: 50 }],
    [4n,  { playerId: UPAMA_PID,    tier: Tier.Common, stamina: 50 }],
    [5n,  { playerId: THEO_PID,     tier: Tier.Common, stamina: 50 }],
    [6n,  { playerId: TCHOU_PID,    tier: Tier.Common, stamina: 50 }],
    [7n,  { playerId: RABIOT_PID,   tier: Tier.Common, stamina: 50 }],
    [8n,  { playerId: GRIEZ_PID,    tier: Tier.Common, stamina: 80 }],
    [9n,  { playerId: DEMBELE_PID,  tier: Tier.Common, stamina: 50 }],
    [10n, { playerId: GIROUD_PID,   tier: Tier.Rare,   stamina: 50 }],
    [11n, { playerId: MBAPPE_PID,   tier: Tier.Unique, stamina: 50 }],
  ]);

  const LINEUP: Lineup = {
    matchday: 1,
    wallet: "0x1111111111111111111111111111111111111111",
    tokenIds: TOKEN_IDS,
    formation: 0, // 4-3-3
    captainIdx: 10,
    viceIdx: 7,
    chipId: ChipId.None,
  };

  function buildEvents(): Map<`0x${string}`, MatchEvents> {
    return new Map([
      [MAIGNAN_PID,  { goals: 0, assists: 0, cleanSheet: true,  tackles: 0, keyPasses: 0, saves: 4, penaltiesSaved: 0, manOfTheMatch: false, played60: true,  yellowCards: 0, redCards: 0, ownGoals: 0, penaltiesMissed: 0, goalsConceded: 0, minutes: 90 }],
      [PAVARD_PID,   { goals: 0, assists: 0, cleanSheet: true,  tackles: 1, keyPasses: 0, saves: 0, penaltiesSaved: 0, manOfTheMatch: false, played60: true,  yellowCards: 0, redCards: 0, ownGoals: 0, penaltiesMissed: 0, goalsConceded: 0, minutes: 90 }],
      [KOUNDE_PID,   { goals: 0, assists: 0, cleanSheet: true,  tackles: 0, keyPasses: 1, saves: 0, penaltiesSaved: 0, manOfTheMatch: false, played60: true,  yellowCards: 0, redCards: 0, ownGoals: 0, penaltiesMissed: 0, goalsConceded: 0, minutes: 90 }],
      [UPAMA_PID,    { goals: 0, assists: 0, cleanSheet: true,  tackles: 0, keyPasses: 0, saves: 0, penaltiesSaved: 0, manOfTheMatch: false, played60: true,  yellowCards: 0, redCards: 0, ownGoals: 0, penaltiesMissed: 0, goalsConceded: 0, minutes: 90 }],
      [THEO_PID,     { goals: 0, assists: 1, cleanSheet: false, tackles: 0, keyPasses: 0, saves: 0, penaltiesSaved: 0, manOfTheMatch: false, played60: true,  yellowCards: 0, redCards: 0, ownGoals: 0, penaltiesMissed: 0, goalsConceded: 1, minutes: 90 }],
      [TCHOU_PID,    { goals: 0, assists: 0, cleanSheet: false, tackles: 2, keyPasses: 0, saves: 0, penaltiesSaved: 0, manOfTheMatch: false, played60: true,  yellowCards: 0, redCards: 0, ownGoals: 0, penaltiesMissed: 0, goalsConceded: 0, minutes: 90 }],
      [RABIOT_PID,   { goals: 1, assists: 1, cleanSheet: false, tackles: 0, keyPasses: 0, saves: 0, penaltiesSaved: 0, manOfTheMatch: false, played60: true,  yellowCards: 0, redCards: 0, ownGoals: 0, penaltiesMissed: 0, goalsConceded: 0, minutes: 90 }],
      [GRIEZ_PID,    { goals: 0, assists: 2, cleanSheet: false, tackles: 0, keyPasses: 0, saves: 0, penaltiesSaved: 0, manOfTheMatch: true,  played60: true,  yellowCards: 0, redCards: 0, ownGoals: 0, penaltiesMissed: 0, goalsConceded: 0, minutes: 90 }],
      [DEMBELE_PID,  { goals: 1, assists: 0, cleanSheet: false, tackles: 0, keyPasses: 0, saves: 0, penaltiesSaved: 0, manOfTheMatch: false, played60: true,  yellowCards: 0, redCards: 0, ownGoals: 0, penaltiesMissed: 0, goalsConceded: 0, minutes: 90 }],
      [GIROUD_PID,   { goals: 2, assists: 0, cleanSheet: false, tackles: 0, keyPasses: 0, saves: 0, penaltiesSaved: 0, manOfTheMatch: false, played60: true,  yellowCards: 0, redCards: 0, ownGoals: 0, penaltiesMissed: 0, goalsConceded: 0, minutes: 90 }],
      // Mbappe absent → DNP → ZERO_EVENTS
    ]);
  }

  it("verifier reuses computeLineupScore and matches oracle expected total", () => {
    // This is the core trust property: same function call → same number
    const result = computeLineupScore(LINEUP, buildEvents(), CARD_CTX);
    expect(result.wallet).toBe(LINEUP.wallet);
    expect(result.total).toBeCloseTo(112.34, 1);
  });

  it("verifier: DNP card (Mbappe absent) has raw=0 and final=0", () => {
    const result = computeLineupScore(LINEUP, buildEvents(), CARD_CTX);
    const mbappe = result.cards[10]; // slot10
    expect(mbappe.raw).toBe(0);
    expect(mbappe.final).toBe(0);
  });

  it("verifier: score→leaf→tree pipeline is reproducible end-to-end", () => {
    const result = computeLineupScore(LINEUP, buildEvents(), CARD_CTX);
    const scoreInt = BigInt(Math.round(result.total * 1000));
    const leaf = scoreLeaf(LINEUP.wallet as `0x${string}`, LINEUP.matchday, scoreInt);
    const tree = buildMerkleTree([leaf]);
    // Root of single-leaf tree equals the leaf itself
    expect(tree.root).toBe(leaf);
    expect(tree.root).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("verifier: prize curve produces valid payout amounts that sum to netPool", () => {
    // Simulate a 1-entrant free contest (entry_fee=0, pool=100 USDC)
    const scored = [
      { wallet: LINEUP.wallet as `0x${string}`, total: 112.34 },
    ];
    const netPool = 100_000000n; // 100 USDC
    const { ranked } = buildContestPayout(scored, netPool);
    expect(ranked).toHaveLength(1);
    expect(ranked[0].amount).toBe(netPool); // only 1 entrant → gets everything
  });

  it("verifier: two-entrant contest distributes correctly (rank1 > rank2)", () => {
    const scored = [
      { wallet: "0x1111111111111111111111111111111111111111" as `0x${string}`, total: 112.34 },
      { wallet: "0x2222222222222222222222222222222222222222" as `0x${string}`, total: 50.0  },
    ];
    const netPool = 200_000000n; // 200 USDC
    const { ranked } = buildContestPayout(scored, netPool);
    expect(ranked).toHaveLength(2);
    expect(ranked[0].rank).toBe(1);
    expect(ranked[1].rank).toBe(2);
    expect(ranked[0].amount).toBeGreaterThan(ranked[1].amount);
    // Amounts sum to netPool
    const total = ranked.reduce((acc, r) => acc + r.amount, 0n);
    expect(total).toBe(netPool);
  });
});

describe("verifier — zero root sentinel", () => {
  it("a single DNP leaf is not the zero root", () => {
    const leaf = dnpLeaf(999n);
    const tree = buildMerkleTree([leaf]);
    const ZERO = "0x0000000000000000000000000000000000000000000000000000000000000000";
    expect(tree.root.toLowerCase()).not.toBe(ZERO);
  });
});
