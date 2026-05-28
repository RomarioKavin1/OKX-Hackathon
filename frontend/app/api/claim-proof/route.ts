import type { NextRequest } from "next/server";
import { supabaseAnonServer } from "@/lib/supabase/server";

/**
 * GET /api/claim-proof?contestId=<id>&wallet=<address>
 *
 * Looks up the `scores` table for a row where:
 *   contest_id = contestId  AND  wallet = lower(wallet)
 *
 * Returns:
 *   { amount: string, proof: string[] }  — when payout > 0 exists
 *   { eligible: false }                  — otherwise
 *
 * Used by the claim flow (Phase 4) to feed ContestEscrow.claim(id, amount, proof).
 */
export async function GET(request: NextRequest): Promise<Response> {
  const searchParams = request.nextUrl.searchParams;
  const contestIdParam = searchParams.get("contestId");
  const walletParam = searchParams.get("wallet");

  // ── Validate params ──────────────────────────────────────────────────────
  if (!contestIdParam || contestIdParam.trim() === "") {
    return Response.json(
      { error: "Missing required query param: contestId" },
      { status: 400 }
    );
  }
  if (!walletParam || walletParam.trim() === "") {
    return Response.json(
      { error: "Missing required query param: wallet" },
      { status: 400 }
    );
  }

  const contestId = contestIdParam.trim();
  const wallet = walletParam.trim().toLowerCase();

  // ── Query scores ─────────────────────────────────────────────────────────
  const db = supabaseAnonServer();

  const { data, error } = await db
    .from("scores")
    .select("payout, proof")
    .eq("contest_id", contestId)
    .eq("wallet", wallet)
    .maybeSingle();

  if (error) {
    return Response.json(
      { error: `Supabase error: ${error.message}` },
      { status: 500 }
    );
  }

  // No row found, or payout is 0 → not eligible
  if (!data || !data.payout || BigInt(String(data.payout)) === 0n) {
    return Response.json({ eligible: false });
  }

  return Response.json({
    amount: String(data.payout),
    proof: data.proof ?? [],
  });
}
