/**
 * Offline param-validation tests for GET /api/dnp-proof
 *
 * These tests hit only the validation layer (status 400) which returns BEFORE
 * any Supabase call or Merkle computation, so they work without a DB connection
 * or env vars.
 *
 * The supabaseAnonServer import is mocked to a no-op so that even if the
 * validation branch is accidentally bypassed the test won't throw on missing env.
 */
import { describe, it, expect, vi, beforeAll } from "vitest";
import { NextRequest } from "next/server";

// Mock Supabase so imports don't throw on missing env vars
vi.mock("@/lib/supabase/server", () => ({
  supabaseAnonServer: () => {
    throw new Error("supabaseAnonServer should not be called in validation tests");
  },
  supabaseAdmin: () => {
    throw new Error("supabaseAdmin should not be called in validation tests");
  },
}));

// Mock viem (used inside dnpLeaf / buildMerkleTree) at a safe level —
// not needed for param-validation tests since they return 400 before the tree.
// No additional mocks required; the route exits at validation before any imports.

let dnpProofGET: (req: NextRequest) => Promise<Response>;

beforeAll(async () => {
  const mod = await import("../dnp-proof/route");
  dnpProofGET = mod.GET;
});

// ── matchday param ────────────────────────────────────────────────────────────

describe("GET /api/dnp-proof — matchday param validation", () => {
  it("returns 400 when matchday is missing", async () => {
    const req = new NextRequest("http://localhost/api/dnp-proof?tokenId=1");
    const res = await dnpProofGET(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("error");
    expect(body.error).toMatch(/matchday/i);
  });

  it("returns 400 when matchday is a blank string", async () => {
    const req = new NextRequest("http://localhost/api/dnp-proof?matchday=&tokenId=1");
    const res = await dnpProofGET(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("error");
    expect(body.error).toMatch(/matchday/i);
  });

  it("returns 400 when matchday is a non-numeric string", async () => {
    const req = new NextRequest("http://localhost/api/dnp-proof?matchday=abc&tokenId=1");
    const res = await dnpProofGET(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("returns 400 when matchday is zero", async () => {
    const req = new NextRequest("http://localhost/api/dnp-proof?matchday=0&tokenId=1");
    const res = await dnpProofGET(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("returns 400 when matchday is negative", async () => {
    const req = new NextRequest("http://localhost/api/dnp-proof?matchday=-1&tokenId=1");
    const res = await dnpProofGET(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("returns 400 when matchday is a float string", async () => {
    const req = new NextRequest("http://localhost/api/dnp-proof?matchday=1.5&tokenId=1");
    const res = await dnpProofGET(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });
});

// ── tokenId param ─────────────────────────────────────────────────────────────

describe("GET /api/dnp-proof — tokenId param validation", () => {
  it("returns 400 when tokenId is missing", async () => {
    const req = new NextRequest("http://localhost/api/dnp-proof?matchday=1");
    const res = await dnpProofGET(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("error");
    expect(body.error).toMatch(/tokenId/i);
  });

  it("returns 400 when tokenId is a blank string", async () => {
    const req = new NextRequest("http://localhost/api/dnp-proof?matchday=1&tokenId=");
    const res = await dnpProofGET(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("error");
    expect(body.error).toMatch(/tokenId/i);
  });

  it("returns 400 when tokenId is a non-numeric string", async () => {
    const req = new NextRequest("http://localhost/api/dnp-proof?matchday=1&tokenId=abc");
    const res = await dnpProofGET(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("returns 400 when tokenId is a hex address", async () => {
    const req = new NextRequest("http://localhost/api/dnp-proof?matchday=1&tokenId=0xdeadbeef");
    const res = await dnpProofGET(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("returns 400 when tokenId is a float string", async () => {
    const req = new NextRequest("http://localhost/api/dnp-proof?matchday=1&tokenId=1.5");
    const res = await dnpProofGET(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });
});

// ── Both params missing ───────────────────────────────────────────────────────

describe("GET /api/dnp-proof — both params missing", () => {
  it("returns 400 when both params are missing", async () => {
    const req = new NextRequest("http://localhost/api/dnp-proof");
    const res = await dnpProofGET(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });
});
