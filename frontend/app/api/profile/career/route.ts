import { NextRequest, NextResponse } from "next/server";
import { supabaseAnonServer } from "@/lib/supabase/server";

/**
 * GET /api/profile/career?wallet=0x...
 *
 * Returns aggregate career stats for the given wallet across all matchdays.
 *
 * Query params:
 *   wallet  — required, 0x-prefixed 40-char hex address (case-insensitive)
 *
 * Response shape:
 *   { matchdaysPlayed, totalPoints, bestDayScore, totalWon, totalSpent, seasonRank }
 *
 * Uses supabaseAnonServer — relies on public RLS policies for all tables.
 */

export const dynamic = "force-dynamic";

interface CareerStats {
  matchdaysPlayed: number;
  totalPoints: number;
  bestDayScore: number;
  totalWon: string;     // USDC base units (string-encoded bigint)
  totalSpent: string;   // USDC base units (string-encoded bigint)
  seasonRank: number | null;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const wallet = new URL(req.url).searchParams.get("wallet")?.toLowerCase();
  if (!wallet || !/^0x[0-9a-f]{40}$/.test(wallet)) {
    return NextResponse.json({ error: "missing or invalid wallet" }, { status: 400 });
  }

  const sb = supabaseAnonServer();

  // Parallelize all independent queries
  const [
    { data: lineupRows, error: lineupErr },
    { data: scoreRows, error: scoreErr },
    { data: entryRows, error: entryErr },
    { data: rentalRows, error: rentalErr },
  ] = await Promise.all([
    sb.from("lineups").select("matchday").eq("wallet", wallet),
    sb.from("scores").select("matchday, score, payout").eq("wallet", wallet),
    sb.from("contest_entries").select("contest_id").eq("wallet", wallet),
    sb.from("rentals").select("paid").eq("renter", wallet),
  ]);

  if (lineupErr) return NextResponse.json({ error: lineupErr.message }, { status: 500 });
  if (scoreErr) return NextResponse.json({ error: scoreErr.message }, { status: 500 });
  if (entryErr) return NextResponse.json({ error: entryErr.message }, { status: 500 });
  if (rentalErr) return NextResponse.json({ error: rentalErr.message }, { status: 500 });

  // matchdaysPlayed: distinct matchdays the wallet submitted a lineup
  const matchdaysPlayed = new Set((lineupRows ?? []).map((r) => Number(r.matchday))).size;

  // Score aggregates: deduplicate by matchday (same lineup → same score across all
  // contests for that day — we only take the first row seen per matchday).
  const scoresByMatchday = new Map<number, number>();
  for (const r of scoreRows ?? []) {
    const md = Number(r.matchday);
    if (!scoresByMatchday.has(md)) {
      scoresByMatchday.set(md, Number(r.score));
    }
  }
  const totalPoints = Array.from(scoresByMatchday.values()).reduce((a, b) => a + b, 0);
  const bestDayScore =
    scoresByMatchday.size > 0 ? Math.max(...Array.from(scoresByMatchday.values())) : 0;

  // totalWon: sum payout across all scores rows (per-contest, so not deduplicated)
  const totalWon = (scoreRows ?? []).reduce(
    (acc, r) => acc + (r.payout != null ? BigInt(r.payout) : 0n),
    0n,
  );

  // totalSpent: contest entry fees + rental fees paid by this wallet
  const entryContestIds = (entryRows ?? []).map((r) => String(r.contest_id));
  let totalEntryFees = 0n;
  if (entryContestIds.length > 0) {
    const { data: contestFeeRows, error: feeErr } = await sb
      .from("contests")
      .select("contest_id, entry_fee")
      .in("contest_id", entryContestIds);
    if (feeErr) return NextResponse.json({ error: feeErr.message }, { status: 500 });
    totalEntryFees = (contestFeeRows ?? []).reduce(
      (acc, r) => acc + (r.entry_fee != null ? BigInt(r.entry_fee) : 0n),
      0n,
    );
  }

  const totalRentalPaid = (rentalRows ?? []).reduce(
    (acc, r) => acc + (r.paid != null ? BigInt(r.paid) : 0n),
    0n,
  );

  const stats: CareerStats = {
    matchdaysPlayed,
    totalPoints,
    bestDayScore,
    totalWon: totalWon.toString(),
    totalSpent: (totalEntryFees + totalRentalPaid).toString(),
    seasonRank: null,
  };

  return NextResponse.json(stats);
}
