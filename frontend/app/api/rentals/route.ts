import type { NextRequest } from "next/server";
import { supabaseAnonServer } from "@/lib/supabase/server";
import { nationOf, positionOf } from "@/lib/data";
import type { Nation } from "@/lib/data/nations";
import type { Position } from "@/lib/types";

export interface RentalListing {
  tokenId: string;
  owner: string;
  /** 0 = FixedFee, 1 = RevShare — matches on-chain RentalMarket.Mode enum */
  mode: number;
  priceValue: string;
  playerId: string;
  tier: number;
  nation: Nation | null;
  position: Position | null;
}

export interface RentalsResponse {
  listings: RentalListing[];
}

/**
 * GET /api/rentals
 *
 * Optional query params (all may be omitted):
 *   player    — exact playerId (hex bytes32)
 *   nation    — e.g. "FRA"
 *   tier      — integer 0-3 (must be a valid integer if provided)
 *   position  — e.g. "GK", "DEF", "MID", "FWD"
 *   maxPrice  — maximum price_value in USDC units (must be a valid integer if provided)
 *
 * Queries `rental_listings` (active=true) joined with `cards` for playerId/tier.
 * tier and maxPrice are filtered in SQL; nation/position are derived from lib/data and
 * applied post-fetch. Returns the listing rows + card metadata so the UI can display
 * cards and perform availability checks client-side (stamina and cardUsedInMatchday
 * require live on-chain reads that are better done in the browser).
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

  // Build query: join rental_listings with cards on token_id
  let query = db
    .from("rental_listings")
    .select(
      "token_id, owner, mode, price_value, cards!inner(player_id, tier)"
    )
    .eq("active", true)
    .order("price_value", { ascending: true });

  // SQL-level filters on indexed columns
  if (tierFilter !== null) {
    query = query.eq("cards.tier", tierFilter);
  }
  if (playerParam) {
    query = query.eq("cards.player_id", playerParam.trim().toLowerCase());
  }
  if (maxPriceFilter !== null) {
    query = query.lte("price_value", maxPriceFilter.toString());
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
    owner: string;
    mode: number;
    price_value: string;
    cards: { player_id: string; tier: number };
  };

  const rows = (res.data ?? []) as unknown as RawRow[];

  // Derive nation/position from lib/data and apply post-fetch filters
  const listings: RentalListing[] = [];
  for (const row of rows) {
    const pid = row.cards.player_id as `0x${string}`;
    const nation = nationOf(pid) ?? null;
    const position = positionOf(pid) ?? null;

    // Apply post-fetch filters for nation and position (derived, not in DB)
    if (nationParam && nation !== nationParam) continue;
    if (positionParam && position !== positionParam) continue;

    listings.push({
      tokenId: String(row.token_id),
      owner: row.owner,
      mode: row.mode,
      priceValue: String(row.price_value),
      playerId: row.cards.player_id,
      tier: row.cards.tier,
      nation,
      position,
    });
  }

  return Response.json({ listings } satisfies RentalsResponse);
}
