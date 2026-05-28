/**
 * Offline param-validation tests for the three read API route handlers.
 *
 * These tests hit only the validation layer (status 400) which returns
 * BEFORE any Supabase call, so they work without a DB connection or env vars.
 *
 * The supabaseAnonServer import is mocked to a no-op so that even if the
 * validation branch is accidentally bypassed the test won't throw on missing
 * env vars.
 */
import { describe, it, expect, vi, beforeAll } from "vitest";
import { NextRequest } from "next/server";

// Mock supabase server client so imports don't throw on missing env vars
vi.mock("@/lib/supabase/server", () => ({
  supabaseAnonServer: () => {
    throw new Error("supabaseAnonServer should not be called in validation tests");
  },
  supabaseAdmin: () => {
    throw new Error("supabaseAdmin should not be called in validation tests");
  },
}));

// Mock publicClient so oracle reads don't throw on missing RPC in test env
vi.mock("@/lib/clients", () => ({
  publicClient: {
    readContract: async () => {
      throw new Error("publicClient.readContract should not be called in validation tests");
    },
  },
}));

// Lazy-import handlers after the mock is in place
let portfolioGET: (req: NextRequest) => Promise<Response>;
let contestsGET: (req: NextRequest) => Promise<Response>;
let lineupGET: (req: NextRequest) => Promise<Response>;
let marketGET: (req: NextRequest) => Promise<Response>;
let rentalsGET: (req: NextRequest) => Promise<Response>;
let profileGET: (req: NextRequest) => Promise<Response>;
let disputePOST: (req: NextRequest) => Promise<Response>;
let reportGET: (req: NextRequest) => Promise<Response>;
let rolloverGET: (req: NextRequest) => Promise<Response>;

beforeAll(async () => {
  const portfolio = await import("../portfolio/route");
  const contests = await import("../contests/route");
  const lineup = await import("../lineup/route");
  const market = await import("../market/route");
  const rentals = await import("../rentals/route");
  const profile = await import("../profile/route");
  const dispute = await import("../dispute/route");
  const report = await import("../report/route");
  const rollover = await import("../rollover/route");
  portfolioGET = portfolio.GET;
  contestsGET = contests.GET;
  lineupGET = lineup.GET;
  marketGET = market.GET;
  rentalsGET = rentals.GET;
  profileGET = profile.GET;
  disputePOST = dispute.POST;
  reportGET = report.GET;
  rolloverGET = rollover.GET;
});

// ---------------------------------------------------------------------------
// Portfolio
// ---------------------------------------------------------------------------
describe("GET /api/portfolio — param validation", () => {
  it("returns 400 when wallet param is missing", async () => {
    const req = new NextRequest("http://localhost/api/portfolio");
    const res = await portfolioGET(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("returns 400 when wallet param is blank", async () => {
    const req = new NextRequest("http://localhost/api/portfolio?wallet=");
    const res = await portfolioGET(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });
});

// ---------------------------------------------------------------------------
// Contests
// ---------------------------------------------------------------------------
describe("GET /api/contests — param validation", () => {
  it("returns 400 when matchday is not numeric", async () => {
    const req = new NextRequest("http://localhost/api/contests?matchday=abc");
    const res = await contestsGET(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("returns 400 when matchday is blank string", async () => {
    const req = new NextRequest("http://localhost/api/contests?matchday=");
    const res = await contestsGET(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("returns 400 when matchday is a float string", async () => {
    const req = new NextRequest("http://localhost/api/contests?matchday=1.5");
    const res = await contestsGET(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });
});

// ---------------------------------------------------------------------------
// Lineup
// ---------------------------------------------------------------------------
describe("GET /api/lineup — param validation", () => {
  it("returns 400 when wallet param is missing", async () => {
    const req = new NextRequest("http://localhost/api/lineup?matchday=1");
    const res = await lineupGET(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("returns 400 when wallet param is blank", async () => {
    const req = new NextRequest("http://localhost/api/lineup?matchday=1&wallet=");
    const res = await lineupGET(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("returns 400 when matchday param is missing", async () => {
    const req = new NextRequest("http://localhost/api/lineup?wallet=0xabc");
    const res = await lineupGET(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("returns 400 when matchday param is blank", async () => {
    const req = new NextRequest("http://localhost/api/lineup?matchday=&wallet=0xabc");
    const res = await lineupGET(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("returns 400 when matchday is not numeric", async () => {
    const req = new NextRequest("http://localhost/api/lineup?matchday=foo&wallet=0xabc");
    const res = await lineupGET(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });
});

// ---------------------------------------------------------------------------
// Market
// ---------------------------------------------------------------------------
describe("GET /api/market — param validation", () => {
  it("returns 400 when tier is non-numeric", async () => {
    const req = new NextRequest("http://localhost/api/market?tier=gold");
    const res = await marketGET(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("returns 400 when tier is a blank string", async () => {
    const req = new NextRequest("http://localhost/api/market?tier=");
    const res = await marketGET(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("returns 400 when maxPrice is non-numeric", async () => {
    const req = new NextRequest("http://localhost/api/market?maxPrice=abc");
    const res = await marketGET(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("returns 400 when maxPrice is a blank string", async () => {
    const req = new NextRequest("http://localhost/api/market?maxPrice=");
    const res = await marketGET(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });
});

// ---------------------------------------------------------------------------
// Rentals
// ---------------------------------------------------------------------------
describe("GET /api/rentals — param validation", () => {
  it("returns 400 when tier is non-numeric", async () => {
    const req = new NextRequest("http://localhost/api/rentals?tier=rare");
    const res = await rentalsGET(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("returns 400 when tier is a blank string", async () => {
    const req = new NextRequest("http://localhost/api/rentals?tier=");
    const res = await rentalsGET(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("returns 400 when maxPrice is non-numeric", async () => {
    const req = new NextRequest("http://localhost/api/rentals?maxPrice=cheap");
    const res = await rentalsGET(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("returns 400 when maxPrice is a float string", async () => {
    const req = new NextRequest("http://localhost/api/rentals?maxPrice=1.5");
    const res = await rentalsGET(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });
});

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------
describe("GET /api/profile — param validation", () => {
  it("returns 400 when address param is missing", async () => {
    const req = new NextRequest("http://localhost/api/profile");
    const res = await profileGET(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("returns 400 when address param is blank", async () => {
    const req = new NextRequest("http://localhost/api/profile?address=");
    const res = await profileGET(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("returns 400 when address param is only whitespace", async () => {
    const req = new NextRequest(
      "http://localhost/api/profile?address=%20%20"
    );
    const res = await profileGET(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });
});

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
describe("GET /api/report — param validation", () => {
  it("returns 400 when matchday param is missing", async () => {
    const req = new NextRequest("http://localhost/api/report?wallet=0xabc");
    const res = await reportGET(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("returns 400 when matchday param is blank", async () => {
    const req = new NextRequest("http://localhost/api/report?matchday=&wallet=0xabc");
    const res = await reportGET(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("returns 400 when matchday is not a non-negative integer", async () => {
    const req = new NextRequest("http://localhost/api/report?matchday=abc&wallet=0xabc");
    const res = await reportGET(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("returns 400 when matchday is a float string", async () => {
    const req = new NextRequest("http://localhost/api/report?matchday=1.5&wallet=0xabc");
    const res = await reportGET(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("returns 400 when wallet param is missing", async () => {
    const req = new NextRequest("http://localhost/api/report?matchday=1");
    const res = await reportGET(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("returns 400 when wallet param is blank", async () => {
    const req = new NextRequest("http://localhost/api/report?matchday=1&wallet=");
    const res = await reportGET(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });
});

// ---------------------------------------------------------------------------
// Dispute (POST /api/dispute) — validation tests
// ---------------------------------------------------------------------------
describe("POST /api/dispute — param validation", () => {
  function makeReq(body: unknown) {
    return new NextRequest("http://localhost/api/dispute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("returns 400 when kind is missing", async () => {
    const res = await disputePOST(makeReq({ message: "test dispute" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("returns 400 when kind is an invalid value", async () => {
    const res = await disputePOST(makeReq({ kind: "invalid", message: "test" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("error");
    expect(body.error).toMatch(/kind/i);
  });

  it("returns 400 when kind is a numeric value", async () => {
    const res = await disputePOST(makeReq({ kind: 42, message: "test" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("returns 400 when message is missing", async () => {
    const res = await disputePOST(makeReq({ kind: "score" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("returns 400 when message is an empty string", async () => {
    const res = await disputePOST(makeReq({ kind: "score", message: "" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("error");
    expect(body.error).toMatch(/message/i);
  });

  it("returns 400 when message exceeds 4000 characters", async () => {
    const res = await disputePOST(makeReq({ kind: "other", message: "x".repeat(4001) }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("error");
    expect(body.error).toMatch(/message/i);
  });

  it("returns 400 when body is invalid JSON", async () => {
    const req = new NextRequest("http://localhost/api/dispute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not-json",
    });
    const res = await disputePOST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("returns 400 when body is a JSON array (not object)", async () => {
    const res = await disputePOST(makeReq([{ kind: "score", message: "test" }]));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("returns 400 when matchday is not a positive integer", async () => {
    const res = await disputePOST(makeReq({ kind: "score", message: "test", matchday: -1 }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("error");
    expect(body.error).toMatch(/matchday/i);
  });
});

// ---------------------------------------------------------------------------
// Rollover (GET /api/rollover) — validation tests
// ---------------------------------------------------------------------------
describe("GET /api/rollover — param validation", () => {
  it("returns 400 when contestId is a non-numeric string", async () => {
    const req = new NextRequest("http://localhost/api/rollover?contestId=abc");
    const res = await rolloverGET(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("error");
    expect(body.error).toMatch(/contestId/i);
  });

  it("returns 400 when contestId is a blank string", async () => {
    const req = new NextRequest("http://localhost/api/rollover?contestId=");
    const res = await rolloverGET(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("error");
    expect(body.error).toMatch(/contestId/i);
  });

  it("returns 400 when contestId is a float string", async () => {
    const req = new NextRequest("http://localhost/api/rollover?contestId=1.5");
    const res = await rolloverGET(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("error");
    expect(body.error).toMatch(/contestId/i);
  });

  it("returns 400 when status is an invalid value", async () => {
    const req = new NextRequest("http://localhost/api/rollover?status=unknown");
    const res = await rolloverGET(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("error");
    expect(body.error).toMatch(/status/i);
  });

  it("returns 400 when status is a blank string", async () => {
    const req = new NextRequest("http://localhost/api/rollover?status=");
    const res = await rolloverGET(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("error");
    expect(body.error).toMatch(/status/i);
  });

  it("returns 400 when contestId is negative", async () => {
    const req = new NextRequest("http://localhost/api/rollover?contestId=-1");
    const res = await rolloverGET(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("error");
    expect(body.error).toMatch(/contestId/i);
  });
});
