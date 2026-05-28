import { NextRequest, NextResponse } from "next/server";
import type { Address } from "viem";
import { supabaseAnonServer } from "@/lib/supabase/server";
import { contestClaimed } from "@/lib/actions/reads";

/**
 * GET /api/profile/claims?wallet=0x...&limit=25
 *
 * Returns all scoring rows for the given wallet where payout > 0, enriched
 * with the on-chain claimed flag from ContestEscrow.claimed(contestId, wallet).
 *
 * Query params:
 *   wallet  — required, 0x-prefixed 40-char hex address (case-insensitive)
 *   limit   — optional, max rows to return (default 25, capped at 100)
 *
 * Response shape:
 *   { claims: ClaimRow[] }
 *
 * Uses supabaseAnonServer — relies on the public "read scores" RLS policy.
 */

export const dynamic = "force-dynamic";

interface ClaimRow {
  matchday: number;
  contestId: string;
  score: number;
  rank: number | null;
  payout: string;     // USDC base units as string (bigint-safe)
  claimed: boolean;
  proof: string[];
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(req.url);
  const wallet = searchParams.get("wallet")?.toLowerCase() ?? null;
  const limitParam = searchParams.get("limit");
  const limit = Math.min(Number(limitParam ?? 25), 100);

  if (!wallet || !/^0x[0-9a-f]{40}$/.test(wallet)) {
    return NextResponse.json({ error: "missing or invalid wallet" }, { status: 400 });
  }

  const sb = supabaseAnonServer();
  const { data, error } = await sb
    .from("scores")
    .select("matchday, contest_id, score, rank, payout, proof")
    .eq("wallet", wallet)
    .gt("payout", 0)
    .order("matchday", { ascending: false })
    .limit(limit);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Enrich with on-chain claimed status — parallelized per row
  const rows: ClaimRow[] = await Promise.all(
    (data ?? []).map(async (r) => {
      const contestId = BigInt(r.contest_id);
      const claimed = await contestClaimed(contestId, wallet as Address);
      return {
        matchday: Number(r.matchday),
        contestId: r.contest_id,
        score: Number(r.score),
        rank: r.rank,
        payout: String(r.payout),
        claimed,
        proof: r.proof ?? [],
      };
    }),
  );

  return NextResponse.json({ claims: rows });
}
