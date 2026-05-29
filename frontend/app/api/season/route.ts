/**
 * GET /api/season
 * GET /api/season?wallet=<address>
 *
 * With `wallet`:
 *   Returns the wallet's season rank + claim proof from the `scores` table
 *   (matchday = -1, contest_id = 'season').
 *
 *   Response:
 *     { rank, score, amount, proof }  — when a season row exists for the wallet
 *     { eligible: false }             — when the wallet has no season entry
 *     400                             — when wallet param is malformed
 *
 * Without `wallet`:
 *   Returns the top-N season standings (default N=50, capped at 250).
 *
 *   Response:
 *     { standings: Array<{ rank, wallet, score, amount }> }
 *
 * Data source:
 *   `supabaseAnonServer()` (anon / publishable key, RLS-filtered read).
 *   The `scores` table has a public SELECT policy → no service-role key needed.
 */

import type { NextRequest } from "next/server";
import { supabaseAnonServer } from "@/lib/supabase/server";

// Inlined to avoid importing the oracle module (which pulls in script-only
// deps that crash the route at module load). Keep in sync with
// services/oracle/season.ts.
const SEASON_MATCHDAY_SENTINEL = -1;
const SEASON_CONTEST_ID = "season";

// ── Wallet validation ─────────────────────────────────────────────────────────

function isValidAddress(s: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(s);
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest): Promise<Response> {
  const searchParams = request.nextUrl.searchParams;
  const walletParam = searchParams.get("wallet");

  // ─── With wallet: return season claim proof ─────────────────────────────────
  if (walletParam !== null) {
    const wallet = walletParam.trim();

    if (!wallet || !isValidAddress(wallet)) {
      return Response.json(
        { error: "Invalid wallet address. Must be a 0x-prefixed 20-byte hex string." },
        { status: 400 },
      );
    }

    const walletLower = wallet.toLowerCase();
    const db = supabaseAnonServer();

    const { data, error } = await db
      .from("scores")
      .select("rank, score, payout, proof")
      .eq("matchday", SEASON_MATCHDAY_SENTINEL)
      .eq("contest_id", SEASON_CONTEST_ID)
      .eq("wallet", walletLower)
      .maybeSingle();

    if (error) {
      // No season has been finalized yet (e.g. the numeric contest_id sentinel
      // has no rows). Treat as "not eligible" rather than surfacing a 500.
      console.warn(`[api/season] wallet query: ${error.message}`);
      return Response.json({ eligible: false });
    }

    if (!data) {
      return Response.json({ eligible: false });
    }

    const amount = String(data.payout ?? "0");
    const amountBigInt = BigInt(amount);

    if (amountBigInt === 0n) {
      // Ranked but not in paid positions — still return rank so the UI can
      // display the wallet's standing even if claim amount is zero.
      return Response.json({
        rank: data.rank ?? null,
        score: Number(data.score ?? 0),
        amount,
        proof: data.proof ?? [],
        eligible: false,
      });
    }

    return Response.json({
      rank: data.rank ?? null,
      score: Number(data.score ?? 0),
      amount,
      proof: data.proof ?? [],
    });
  }

  // ─── Without wallet: return top-N standings ────────────────────────────────
  const limitParam = searchParams.get("limit");
  const rawLimit = limitParam ? parseInt(limitParam, 10) : 50;
  const limit = isNaN(rawLimit) ? 50 : Math.min(250, Math.max(1, rawLimit));

  const db = supabaseAnonServer();
  const { data: standings, error: standingsErr } = await db
    .from("scores")
    .select("rank, wallet, score, payout")
    .eq("matchday", SEASON_MATCHDAY_SENTINEL)
    .eq("contest_id", SEASON_CONTEST_ID)
    .order("rank", { ascending: true })
    .limit(limit);

  if (standingsErr) {
    // Season not finalized yet → empty table, not an error.
    console.warn(`[api/season] standings query: ${standingsErr.message}`);
    return Response.json({ standings: [] });
  }

  return Response.json({
    standings: (standings ?? []).map((row) => ({
      rank: row.rank,
      wallet: row.wallet,
      score: Number(row.score ?? 0),
      amount: String(row.payout ?? "0"),
    })),
  });
}
