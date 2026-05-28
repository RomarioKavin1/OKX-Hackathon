/**
 * Unit tests for GET /api/profile/claims
 *
 * Mocks supabaseAnonServer and contestClaimed so no live DB or chain is required.
 */
import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { NextRequest } from "next/server";

// ── Mocks (hoisted before lazy imports) ───────────────────────────────────────

const mockLimit = vi.fn();
const mockOrder = vi.fn();
const mockGt = vi.fn();
const mockEq = vi.fn();
const mockSelect = vi.fn();
const mockFrom = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  supabaseAnonServer: () => ({ from: mockFrom }),
}));

const mockContestClaimed = vi.fn();

vi.mock("@/lib/actions/reads", () => ({
  contestClaimed: mockContestClaimed,
}));

// ── Lazy-import handler after mocks ───────────────────────────────────────────

let claimsGET: (req: NextRequest) => Promise<Response>;

beforeAll(async () => {
  const mod = await import("../profile/claims/route");
  claimsGET = mod.GET;
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeReq(qs: string) {
  return new NextRequest(`http://localhost/api/profile/claims${qs}`);
}

const VALID_WALLET = "0x" + "a".repeat(40);

// ── Test setup ────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();

  // Default Supabase chain: from → select → eq → gt → order → limit
  mockLimit.mockResolvedValue({ data: [], error: null });
  mockOrder.mockReturnValue({ limit: mockLimit });
  mockGt.mockReturnValue({ order: mockOrder });
  mockEq.mockReturnValue({ gt: mockGt });
  mockSelect.mockReturnValue({ eq: mockEq });
  mockFrom.mockReturnValue({ select: mockSelect });
});

// ── Validation: wallet param ──────────────────────────────────────────────────

describe("GET /api/profile/claims — wallet param validation", () => {
  it("returns 400 when wallet param is missing", async () => {
    const res = await claimsGET(makeReq(""));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("returns 400 when wallet param is blank", async () => {
    const res = await claimsGET(makeReq("?wallet="));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("returns 400 when wallet is not a valid 0x address (too short)", async () => {
    const res = await claimsGET(makeReq("?wallet=0xabc"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("returns 400 when wallet contains non-hex characters", async () => {
    const res = await claimsGET(makeReq("?wallet=0x" + "Z".repeat(40)));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("returns 400 when wallet has no 0x prefix", async () => {
    const res = await claimsGET(makeReq("?wallet=" + "a".repeat(40)));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("returns 400 for the string 'notawallet'", async () => {
    const res = await claimsGET(makeReq("?wallet=notawallet"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });
});

// ── Success: empty result set ─────────────────────────────────────────────────

describe("GET /api/profile/claims — empty result", () => {
  it("returns 200 with an empty claims array when no rows match", async () => {
    mockLimit.mockResolvedValue({ data: [], error: null });

    const res = await claimsGET(makeReq(`?wallet=${VALID_WALLET}`));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ claims: [] });
  });
});

// ── Success: rows with on-chain enrichment ────────────────────────────────────

describe("GET /api/profile/claims — enriched rows", () => {
  it("returns enriched claims with on-chain claimed=true", async () => {
    mockLimit.mockResolvedValue({
      data: [
        {
          matchday: 1,
          contest_id: "100",
          score: 50,
          rank: 3,
          payout: "1000000",
          proof: ["0xaabbcc"],
        },
      ],
      error: null,
    });
    mockContestClaimed.mockResolvedValue(true);

    const res = await claimsGET(makeReq(`?wallet=${VALID_WALLET}`));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.claims).toHaveLength(1);
    expect(body.claims[0]).toMatchObject({
      matchday: 1,
      contestId: "100",
      score: 50,
      rank: 3,
      payout: "1000000",
      claimed: true,
      proof: ["0xaabbcc"],
    });
  });

  it("returns enriched claims with on-chain claimed=false", async () => {
    mockLimit.mockResolvedValue({
      data: [
        {
          matchday: 2,
          contest_id: "200",
          score: 75,
          rank: 1,
          payout: "5000000",
          proof: ["0x11", "0x22"],
        },
      ],
      error: null,
    });
    mockContestClaimed.mockResolvedValue(false);

    const res = await claimsGET(makeReq(`?wallet=${VALID_WALLET}`));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.claims[0].claimed).toBe(false);
  });

  it("calls contestClaimed with the correct contestId and wallet", async () => {
    mockLimit.mockResolvedValue({
      data: [
        {
          matchday: 3,
          contest_id: "999",
          score: 60,
          rank: 2,
          payout: "2000000",
          proof: [],
        },
      ],
      error: null,
    });
    mockContestClaimed.mockResolvedValue(false);

    await claimsGET(makeReq(`?wallet=${VALID_WALLET}`));

    expect(mockContestClaimed).toHaveBeenCalledWith(BigInt("999"), VALID_WALLET);
  });

  it("handles multiple rows in parallel", async () => {
    mockLimit.mockResolvedValue({
      data: [
        { matchday: 5, contest_id: "501", score: 80, rank: 1, payout: "3000000", proof: [] },
        { matchday: 4, contest_id: "401", score: 65, rank: 2, payout: "1500000", proof: [] },
      ],
      error: null,
    });
    mockContestClaimed.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    const res = await claimsGET(makeReq(`?wallet=${VALID_WALLET}`));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.claims).toHaveLength(2);
    expect(body.claims[0].claimed).toBe(true);
    expect(body.claims[1].claimed).toBe(false);
  });

  it("handles null proof gracefully (defaults to [])", async () => {
    mockLimit.mockResolvedValue({
      data: [
        { matchday: 6, contest_id: "601", score: 40, rank: 5, payout: "500000", proof: null },
      ],
      error: null,
    });
    mockContestClaimed.mockResolvedValue(false);

    const res = await claimsGET(makeReq(`?wallet=${VALID_WALLET}`));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.claims[0].proof).toEqual([]);
  });
});

// ── Error: Supabase failure ───────────────────────────────────────────────────

describe("GET /api/profile/claims — Supabase error", () => {
  it("returns 500 when Supabase returns an error", async () => {
    mockLimit.mockResolvedValue({ data: null, error: { message: "db exploded" } });

    const res = await claimsGET(makeReq(`?wallet=${VALID_WALLET}`));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toHaveProperty("error", "db exploded");
  });
});

// ── Limit capping ─────────────────────────────────────────────────────────────

describe("GET /api/profile/claims — limit param", () => {
  it("passes capped limit to Supabase when limit > 100", async () => {
    mockLimit.mockResolvedValue({ data: [], error: null });

    await claimsGET(makeReq(`?wallet=${VALID_WALLET}&limit=999`));

    expect(mockLimit).toHaveBeenCalledWith(100);
  });

  it("passes provided limit to Supabase when limit <= 100", async () => {
    mockLimit.mockResolvedValue({ data: [], error: null });

    await claimsGET(makeReq(`?wallet=${VALID_WALLET}&limit=10`));

    expect(mockLimit).toHaveBeenCalledWith(10);
  });

  it("defaults to limit=25 when no limit param given", async () => {
    mockLimit.mockResolvedValue({ data: [], error: null });

    await claimsGET(makeReq(`?wallet=${VALID_WALLET}`));

    expect(mockLimit).toHaveBeenCalledWith(25);
  });
});
