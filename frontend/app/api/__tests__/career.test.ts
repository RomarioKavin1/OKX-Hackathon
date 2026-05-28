/**
 * Unit tests for GET /api/profile/career
 *
 * Mocks supabaseAnonServer so no live DB is required.
 */
import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { NextRequest } from "next/server";

// ── Supabase mock ─────────────────────────────────────────────────────────────

// Each table query ends in .eq() or .in() returning a promise-like.
// We track calls via mockFrom so individual tests can override per-table results.

const mockFrom = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  supabaseAnonServer: () => ({ from: mockFrom }),
}));

// ── Lazy-import handler after mocks ───────────────────────────────────────────

let careerGET: (req: NextRequest) => Promise<Response>;

beforeAll(async () => {
  const mod = await import("../profile/career/route");
  careerGET = mod.GET;
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeReq(qs: string) {
  return new NextRequest(`http://localhost/api/profile/career${qs}`);
}

const VALID_WALLET = "0x" + "a".repeat(40);

/**
 * Build a chainable supabase query stub that resolves with `result`.
 * Supports the chains used by this route:
 *   .select().eq()           → resolves
 *   .select().eq("renter")  → resolves
 *   .select().in()           → resolves  (contests lookup)
 */
function makeChain(result: { data: unknown; error: unknown }) {
  const terminal = Promise.resolve(result);
  const stub: Record<string, unknown> = {};
  stub["in"] = vi.fn(() => terminal);
  stub["eq"] = vi.fn(() => terminal);
  stub["select"] = vi.fn(() => stub);
  return stub;
}

// ── Validation: wallet param ──────────────────────────────────────────────────

describe("GET /api/profile/career — wallet param validation", () => {
  it("returns 400 when wallet param is missing", async () => {
    const res = await careerGET(makeReq(""));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("returns 400 when wallet param is blank", async () => {
    const res = await careerGET(makeReq("?wallet="));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("returns 400 when wallet is not a valid 0x address (too short)", async () => {
    const res = await careerGET(makeReq("?wallet=0xabc"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("returns 400 when wallet contains non-hex characters", async () => {
    const res = await careerGET(makeReq("?wallet=0x" + "Z".repeat(40)));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("returns 400 when wallet has no 0x prefix", async () => {
    const res = await careerGET(makeReq("?wallet=" + "a".repeat(40)));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });
});

// ── Success: empty data ───────────────────────────────────────────────────────

describe("GET /api/profile/career — empty data", () => {
  beforeEach(() => {
    // All four parallel queries return empty arrays; no contests lookup triggered.
    mockFrom.mockReturnValue(makeChain({ data: [], error: null }));
  });

  it("returns 200 with all-zero stats and seasonRank null", async () => {
    const res = await careerGET(makeReq(`?wallet=${VALID_WALLET}`));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      matchdaysPlayed: 0,
      totalPoints: 0,
      bestDayScore: 0,
      totalWon: "0",
      totalSpent: "0",
      seasonRank: null,
    });
  });
});

// ── Success: realistic case ───────────────────────────────────────────────────

describe("GET /api/profile/career — realistic case", () => {
  /**
   * Scenario:
   *   lineups:         matchday 1, matchday 2  → matchdaysPlayed = 2
   *   scores:          md1/c100 score=50 payout=1000000
   *                    md1/c200 score=50 payout=0
   *                    md2/c100 score=80 payout=2000000
   *                    → totalPoints = 50+80 = 130 (deduplicated by matchday)
   *                    → bestDayScore = 80
   *                    → totalWon = 1000000+0+2000000 = 3000000
   *   contest_entries: 2 entries (contest_id 100 and 200)
   *   contests:        c100 entry_fee=1000000, c200 entry_fee=500000
   *                    → totalEntryFees = 1500000
   *   rentals:         paid=500000
   *                    → totalRentalPaid = 500000
   *                    → totalSpent = 2000000
   */
  beforeEach(() => {
    // Route calls: lineups, scores, contest_entries, rentals in parallel,
    // then contests via .in() if entries exist.
    mockFrom.mockImplementation((table: string) => {
      if (table === "lineups") {
        return makeChain({
          data: [{ matchday: 1 }, { matchday: 2 }],
          error: null,
        });
      }
      if (table === "scores") {
        return makeChain({
          data: [
            { matchday: 1, score: 50, payout: "1000000" },
            { matchday: 1, score: 50, payout: "0" },
            { matchday: 2, score: 80, payout: "2000000" },
          ],
          error: null,
        });
      }
      if (table === "contest_entries") {
        return makeChain({
          data: [{ contest_id: "100" }, { contest_id: "200" }],
          error: null,
        });
      }
      if (table === "rentals") {
        return makeChain({
          data: [{ paid: "500000" }],
          error: null,
        });
      }
      if (table === "contests") {
        return makeChain({
          data: [
            { contest_id: "100", entry_fee: "1000000" },
            { contest_id: "200", entry_fee: "500000" },
          ],
          error: null,
        });
      }
      return makeChain({ data: [], error: null });
    });
  });

  it("computes matchdaysPlayed correctly", async () => {
    const res = await careerGET(makeReq(`?wallet=${VALID_WALLET}`));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.matchdaysPlayed).toBe(2);
  });

  it("deduplicates scores by matchday for totalPoints", async () => {
    const res = await careerGET(makeReq(`?wallet=${VALID_WALLET}`));
    const body = await res.json();
    expect(body.totalPoints).toBe(130);
  });

  it("computes bestDayScore correctly", async () => {
    const res = await careerGET(makeReq(`?wallet=${VALID_WALLET}`));
    const body = await res.json();
    expect(body.bestDayScore).toBe(80);
  });

  it("sums all payout rows (per-contest, not deduplicated) for totalWon", async () => {
    const res = await careerGET(makeReq(`?wallet=${VALID_WALLET}`));
    const body = await res.json();
    expect(body.totalWon).toBe("3000000");
  });

  it("sums entry fees + rental paid for totalSpent", async () => {
    const res = await careerGET(makeReq(`?wallet=${VALID_WALLET}`));
    const body = await res.json();
    expect(body.totalSpent).toBe("2000000");
  });

  it("always returns seasonRank as null", async () => {
    const res = await careerGET(makeReq(`?wallet=${VALID_WALLET}`));
    const body = await res.json();
    expect(body.seasonRank).toBeNull();
  });

  it("returns all stats in a single response object", async () => {
    const res = await careerGET(makeReq(`?wallet=${VALID_WALLET}`));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      matchdaysPlayed: 2,
      totalPoints: 130,
      bestDayScore: 80,
      totalWon: "3000000",
      totalSpent: "2000000",
      seasonRank: null,
    });
  });
});

// ── Error handling: Supabase failures ────────────────────────────────────────

describe("GET /api/profile/career — Supabase errors", () => {
  it("returns 500 when lineups query fails", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "lineups") return makeChain({ data: null, error: { message: "lineups boom" } });
      return makeChain({ data: [], error: null });
    });

    const res = await careerGET(makeReq(`?wallet=${VALID_WALLET}`));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toHaveProperty("error", "lineups boom");
  });

  it("returns 500 when scores query fails", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "scores") return makeChain({ data: null, error: { message: "scores boom" } });
      return makeChain({ data: [], error: null });
    });

    const res = await careerGET(makeReq(`?wallet=${VALID_WALLET}`));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toHaveProperty("error", "scores boom");
  });

  it("returns 500 when contest_entries query fails", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "contest_entries")
        return makeChain({ data: null, error: { message: "entries boom" } });
      return makeChain({ data: [], error: null });
    });

    const res = await careerGET(makeReq(`?wallet=${VALID_WALLET}`));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toHaveProperty("error", "entries boom");
  });

  it("returns 500 when rentals query fails", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "rentals") return makeChain({ data: null, error: { message: "rentals boom" } });
      return makeChain({ data: [], error: null });
    });

    const res = await careerGET(makeReq(`?wallet=${VALID_WALLET}`));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toHaveProperty("error", "rentals boom");
  });

  it("returns 500 when contests fee lookup fails", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "contest_entries")
        return makeChain({ data: [{ contest_id: "100" }], error: null });
      if (table === "contests")
        return makeChain({ data: null, error: { message: "contests boom" } });
      return makeChain({ data: [], error: null });
    });

    const res = await careerGET(makeReq(`?wallet=${VALID_WALLET}`));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toHaveProperty("error", "contests boom");
  });
});
