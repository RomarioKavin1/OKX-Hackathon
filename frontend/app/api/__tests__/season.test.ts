/**
 * Offline param-validation tests for GET /api/season.
 *
 * These tests only exercise the validation layer (status 400 paths) which
 * returns BEFORE any Supabase call, so they work without a DB connection
 * or env vars.
 *
 * The supabaseAnonServer import is mocked to a no-op.
 * publicClient is mocked so the seasonFinalized on-chain read cannot fire.
 */
import { describe, it, expect, vi, beforeAll } from "vitest";
import { NextRequest } from "next/server";

// ── Mocks (must be hoisted before the lazy import) ────────────────────────────

vi.mock("@/lib/supabase/server", () => ({
  supabaseAnonServer: () => {
    throw new Error("supabaseAnonServer should not be called in validation tests");
  },
  supabaseAdmin: () => {
    throw new Error("supabaseAdmin should not be called in validation tests");
  },
}));

// Mock the season oracle module so the import of SEASON_MATCHDAY_SENTINEL
// and SEASON_CONTEST_ID works without triggering the viem / dotenv transitive deps.
vi.mock("@/services/oracle/season", () => ({
  SEASON_MATCHDAY_SENTINEL: -1,
  SEASON_CONTEST_ID: "season",
}));

// ── Lazy-import handler after mocks ───────────────────────────────────────────

let seasonGET: (req: NextRequest) => Promise<Response>;

beforeAll(async () => {
  const mod = await import("../season/route");
  seasonGET = mod.GET;
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("GET /api/season — wallet param validation", () => {
  it("returns 400 when wallet param is present but blank", async () => {
    const req = new NextRequest("http://localhost/api/season?wallet=");
    const res = await seasonGET(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("returns 400 when wallet param is only whitespace", async () => {
    const req = new NextRequest("http://localhost/api/season?wallet=%20%20");
    const res = await seasonGET(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("returns 400 when wallet param is not a 0x-prefixed address (too short)", async () => {
    const req = new NextRequest("http://localhost/api/season?wallet=0xabc");
    const res = await seasonGET(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("returns 400 when wallet param contains non-hex characters", async () => {
    const req = new NextRequest(
      "http://localhost/api/season?wallet=0xZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ",
    );
    const res = await seasonGET(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("returns 400 when wallet param is missing the 0x prefix", async () => {
    const req = new NextRequest(
      "http://localhost/api/season?wallet=A3327d90d087cdddfB99E598E50B5Bdee7fC55bD",
    );
    const res = await seasonGET(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("returns 400 when wallet is a valid-length hex but wrong prefix", async () => {
    // 40 hex chars but no 0x prefix → invalid
    const req = new NextRequest(
      "http://localhost/api/season?wallet=1234567890123456789012345678901234567890",
    );
    const res = await seasonGET(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });
});
