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

  let db;
  try {
    db = supabaseAnonServer();
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Supabase unavailable" },
      { status: 503 },
    );
  }

  // Two-step manual join (marketplace_listings -> cards on token_id). We do not
  // rely on a PostgREST embedded join, so no DB foreign key is required.
  // price is stored as numeric(78,0); Supabase JS returns/accepts it as a string.
  let listQuery = db
    .from("marketplace_listings")
    .select("token_id, seller, price")
    .eq("active", true)
    .order("price", { ascending: true });
  if (maxPriceFilter !== null) {
    listQuery = listQuery.lte("price", maxPriceFilter.toString());
  }

  const listRes = await listQuery;
  if (listRes.error) {
    return Response.json(
      { error: `Supabase error: ${listRes.error.message}` },
      { status: 500 }
    );
  }

  type ListingRow = { token_id: string; seller: string; price: string };
  const listingRows = (listRes.data ?? []) as unknown as ListingRow[];
  if (listingRows.length === 0) {
    return Response.json({ listings: [] } satisfies MarketResponse);
  }

  // Fetch the matching cards (tier/player filters applied here in SQL).
  const tokenIds = listingRows.map((r) => String(r.token_id));
  let cardQuery = db
    .from("cards")
    .select("token_id, player_id, tier")
    .in("token_id", tokenIds);
  if (tierFilter !== null) cardQuery = cardQuery.eq("tier", tierFilter);
  if (playerParam) cardQuery = cardQuery.eq("player_id", playerParam.trim().toLowerCase());

  const cardRes = await cardQuery;
  if (cardRes.error) {
    return Response.json(
      { error: `Supabase error: ${cardRes.error.message}` },
      { status: 500 }
    );
  }

  type CardRow = { token_id: string; player_id: string; tier: number };
  const cardByToken = new Map<string, CardRow>(
    ((cardRes.data ?? []) as unknown as CardRow[]).map((c) => [String(c.token_id), c]),
  );

  // Join (preserving price order) and apply derived nation/position filters.
  const listings: MarketListing[] = [];
  for (const row of listingRows) {
    const card = cardByToken.get(String(row.token_id));
    if (!card) continue; // card missing or filtered out by tier/player
    const pid = card.player_id as `0x${string}`;
    const nation = nationOf(pid) ?? null;
    const position = positionOf(pid) ?? null;

    if (nationParam && nation !== nationParam) continue;
    if (positionParam && position !== positionParam) continue;

    listings.push({
      tokenId: String(row.token_id),
      seller: row.seller,
      price: String(row.price),
      playerId: card.player_id,
      tier: card.tier,
      nation,
      position,
    });
  }

  return Response.json({ listings } satisfies MarketResponse);
}
