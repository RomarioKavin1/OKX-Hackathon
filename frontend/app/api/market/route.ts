import type { NextRequest } from "next/server";
import { supabaseAnonServer } from "@/lib/supabase/server";
import { nationOf, positionOf } from "@/lib/data";
import type { Nation } from "@/lib/data/nations";
import type { Position } from "@/lib/types";

export interface MarketListing {
  tokenId: string;
  seller: string;
  price: string;
  playerId: string;
  tier: number;
  nation: Nation | null;
  position: Position | null;
}

export interface MarketResponse {
  listings: MarketListing[];
}

/**
 * GET /api/market
 *
 * Optional query params (all may be omitted):
 *   player    — exact playerId (hex bytes32)
 *   nation    — e.g. "FRA"
 *   tier      — integer 0-3 (must be a valid integer if provided)
 *   position  — e.g. "GK", "DEF", "MID", "FWD"
 *   maxPrice  — maximum listing price in USDC units (must be a valid integer if provided)
 *
 * Queries `marketplace_listings` (active=true) joined with `cards` for playerId/tier.
 * tier and maxPrice are filtered in SQL; nation/position are derived from lib/data and
 * applied post-fetch (they are not stored in DB columns).
 *
 * Uses supabaseAnonServer (public read RLS policy grants anon SELECT).
 */
export async function GET(request: NextRequest): Promise<Response> {
  const sp = request.nextUrl.searchParams;

  const playerParam = sp.get("player");
  const nationParam = sp.get("nation");
  const tierParam = sp.get("tier");
  const positionParam = sp.get("position");
  const maxPriceParam = sp.get("maxPrice");

  // Validate tier
  let tierFilter: number | null = null;
  if (tierParam !== null) {
    if (tierParam.trim() === "" || !/^\d+$/.test(tierParam.trim())) {
      return Response.json(
        { error: "Invalid query param: tier must be a non-negative integer" },
        { status: 400 }
      );
    }
    tierFilter = parseInt(tierParam.trim(), 10);
  }

  // Validate maxPrice
  let maxPriceFilter: bigint | null = null;
  if (maxPriceParam !== null) {
    if (maxPriceParam.trim() === "" || !/^\d+$/.test(maxPriceParam.trim())) {
      return Response.json(
        { error: "Invalid query param: maxPrice must be a non-negative integer" },
        { status: 400 }
      );
    }
    try {
      maxPriceFilter = BigInt(maxPriceParam.trim());
    } catch {
      return Response.json(
        { error: "Invalid query param: maxPrice out of range" },
        { status: 400 }
      );
    }
  }

  const db = supabaseAnonServer();

  // Build query: join marketplace_listings with cards on token_id
  // Filter active=true in SQL; also filter tier and player in SQL when provided.
  // price is stored as numeric(78,0) — compare as string since Supabase JS returns it as string.
  let query = db
    .from("marketplace_listings")
    .select(
      "token_id, seller, price, cards!inner(player_id, tier)"
    )
    .eq("active", true)
    .order("price", { ascending: true });

  // SQL-level filters on indexed columns
  if (tierFilter !== null) {
    query = query.eq("cards.tier", tierFilter);
  }
  if (playerParam) {
    query = query.eq("cards.player_id", playerParam.trim().toLowerCase());
  }
  if (maxPriceFilter !== null) {
    // price column is numeric; Supabase JS .lte accepts string for numeric columns
    query = query.lte("price", maxPriceFilter.toString());
  }

  const res = await query;

  if (res.error) {
    return Response.json(
      { error: `Supabase error: ${res.error.message}` },
      { status: 500 }
    );
  }

  type RawRow = {
    token_id: string;
    seller: string;
    price: string;
    cards: { player_id: string; tier: number };
  };

  const rows = (res.data ?? []) as unknown as RawRow[];

  // Derive nation/position from lib/data and apply post-fetch filters
  const listings: MarketListing[] = [];
  for (const row of rows) {
    const pid = row.cards.player_id as `0x${string}`;
    const nation = nationOf(pid) ?? null;
    const position = positionOf(pid) ?? null;

    // Apply post-fetch filters for nation and position (derived, not in DB)
    if (nationParam && nation !== nationParam) continue;
    if (positionParam && position !== positionParam) continue;

    listings.push({
      tokenId: String(row.token_id),
      seller: row.seller,
      price: String(row.price),
      playerId: row.cards.player_id,
      tier: row.cards.tier,
      nation,
      position,
    });
  }

  return Response.json({ listings } satisfies MarketResponse);
}
