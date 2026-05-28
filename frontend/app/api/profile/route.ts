import type { NextRequest } from "next/server";
import { supabaseAnonServer } from "@/lib/supabase/server";

/**
 * A single card row returned from the profile endpoint.
 */
export interface ProfileCard {
  tokenId: string;
  playerId: string;
  tier: number;
  serialNumber: number;
  mintBatch: number;
  userAddr: string | null;
  userExpires: number;
}

/**
 * Counts of cards grouped by tier.
 */
export interface TierSummary {
  common: number;
  rare: number;
  superRare: number;
  unique: number;
  total: number;
}

export interface ProfileResponse {
  address: string;
  cards: ProfileCard[];
  summary: TierSummary;
}

/**
 * GET /api/profile?address=0x...
 *
 * Returns the PANENKA cards owned by the given address from the indexer
 * (cards table, owner = lower(address)), plus a tier count summary.
 *
 * Uses supabaseAnonServer — relies on the public "read cards" RLS policy.
 *
 * Validates:
 *   - address param must be present and non-blank → 400 otherwise
 */
export async function GET(request: NextRequest): Promise<Response> {
  const searchParams = request.nextUrl.searchParams;
  const rawAddress = searchParams.get("address");

  if (!rawAddress || rawAddress.trim() === "") {
    return Response.json(
      { error: "Missing required query param: address" },
      { status: 400 }
    );
  }

  const address = rawAddress.trim().toLowerCase();

  const db = supabaseAnonServer();

  const { data, error } = await db
    .from("cards")
    .select(
      "token_id, player_id, tier, serial_number, mint_batch, user_addr, user_expires"
    )
    .eq("owner", address);

  if (error) {
    return Response.json(
      { error: `Supabase error: ${error.message}` },
      { status: 500 }
    );
  }

  type RawCard = {
    token_id: string;
    player_id: string;
    tier: number;
    serial_number: number;
    mint_batch: number;
    user_addr: string | null;
    user_expires: number;
  };

  const rows = (data ?? []) as RawCard[];

  const cards: ProfileCard[] = rows.map((row) => ({
    tokenId: String(row.token_id),
    playerId: row.player_id,
    tier: row.tier,
    serialNumber: row.serial_number,
    mintBatch: row.mint_batch,
    userAddr: row.user_addr,
    userExpires: row.user_expires,
  }));

  // Tiers: 0=Common, 1=Rare, 2=SuperRare, 3=Unique
  const summary: TierSummary = {
    common: cards.filter((c) => c.tier === 0).length,
    rare: cards.filter((c) => c.tier === 1).length,
    superRare: cards.filter((c) => c.tier === 2).length,
    unique: cards.filter((c) => c.tier === 3).length,
    total: cards.length,
  };

  return Response.json({ address, cards, summary } satisfies ProfileResponse);
}
