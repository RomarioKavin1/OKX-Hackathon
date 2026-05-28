"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { TIER_NAME } from "@/lib/types";
import { NATION_NAME } from "@/lib/data/nations";
import { fmtUsdc } from "@/lib/business/format";
import { PLAYER_BY_ID } from "@/lib/data/players";
import type { MarketListing } from "@/app/api/market/route";

// ── Types ────────────────────────────────────────────────────────────────────

interface Filters {
  player: string;
  nation: string;
  tier: string;
  position: string;
  maxPrice: string;
}

// ── Module-scope sub-components ───────────────────────────────────────────────

interface ListingCardProps {
  listing: MarketListing;
}

function ListingCard({ listing }: ListingCardProps) {
  const player = PLAYER_BY_ID.get(listing.playerId as `0x${string}`);
  const name = player?.name ?? `Player ${listing.playerId.slice(0, 10)}…`;
  const tierLabel = TIER_NAME[listing.tier as keyof typeof TIER_NAME] ?? `Tier ${listing.tier}`;
  const priceBigInt = BigInt(listing.price);
  const priceDisplay = fmtUsdc(priceBigInt);
  const nationLabel = listing.nation ? (NATION_NAME[listing.nation] ?? listing.nation) : "—";
  const positionLabel = listing.position ?? "—";

  return (
    <Link
      href={`/market/${listing.tokenId}`}
      className="flex flex-col gap-1 rounded-lg border border-zinc-200 bg-white p-4 shadow-sm transition hover:border-zinc-400 hover:shadow"
    >
      <div className="flex items-start justify-between">
        <span className="font-semibold text-zinc-900">{name}</span>
        <span className="rounded bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600">
          {tierLabel}
        </span>
      </div>
      <div className="mt-1 flex gap-3 text-xs text-zinc-500">
        <span>{nationLabel}</span>
        <span>{positionLabel}</span>
        <span>#{listing.tokenId}</span>
      </div>
      <div className="mt-2 text-sm font-bold text-emerald-700">{priceDisplay} USDC</div>
    </Link>
  );
}

interface FilterBarProps {
  filters: Filters;
  onChange: (f: Filters) => void;
  onSearch: () => void;
  loading: boolean;
}

function FilterBar({ filters, onChange, onSearch, loading }: FilterBarProps) {
  const set = (key: keyof Filters) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    onChange({ ...filters, [key]: e.target.value });

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); onSearch(); }}
      className="flex flex-wrap items-end gap-3"
    >
      <label className="flex flex-col gap-1 text-xs font-medium text-zinc-600">
        Player ID (hex)
        <input
          type="text"
          placeholder="0x…"
          value={filters.player}
          onChange={set("player")}
          className="w-36 rounded border border-zinc-300 bg-white px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400"
        />
      </label>

      <label className="flex flex-col gap-1 text-xs font-medium text-zinc-600">
        Nation
        <select
          value={filters.nation}
          onChange={set("nation")}
          className="rounded border border-zinc-300 bg-white px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400"
        >
          <option value="">All</option>
          {(Object.keys(NATION_NAME) as (keyof typeof NATION_NAME)[]).map((code) => (
            <option key={code} value={code}>
              {NATION_NAME[code]}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-xs font-medium text-zinc-600">
        Tier
        <select
          value={filters.tier}
          onChange={set("tier")}
          className="rounded border border-zinc-300 bg-white px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400"
        >
          <option value="">All</option>
          <option value="0">Common</option>
          <option value="1">Rare</option>
          <option value="2">Super Rare</option>
          <option value="3">Unique</option>
        </select>
      </label>

      <label className="flex flex-col gap-1 text-xs font-medium text-zinc-600">
        Position
        <select
          value={filters.position}
          onChange={set("position")}
          className="rounded border border-zinc-300 bg-white px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400"
        >
          <option value="">All</option>
          <option value="GK">GK</option>
          <option value="DEF">DEF</option>
          <option value="MID">MID</option>
          <option value="FWD">FWD</option>
        </select>
      </label>

      <label className="flex flex-col gap-1 text-xs font-medium text-zinc-600">
        Max price (USDC)
        <input
          type="number"
          min="0"
          step="1"
          placeholder="any"
          value={filters.maxPrice}
          onChange={set("maxPrice")}
          className="w-28 rounded border border-zinc-300 bg-white px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400"
        />
      </label>

      <button
        type="submit"
        disabled={loading}
        className="rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-40"
      >
        {loading ? "Searching…" : "Search"}
      </button>
    </form>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function MarketPage() {
  const [filters, setFilters] = useState<Filters>({
    player: "",
    nation: "",
    tier: "",
    position: "",
    maxPrice: "",
  });

  const [listings, setListings] = useState<MarketListing[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load all listings on mount
  useEffect(() => {
    void fetchListings({
      player: "",
      nation: "",
      tier: "",
      position: "",
      maxPrice: "",
    });
  }, []);

  async function fetchListings(f: Filters) {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (f.player.trim()) params.set("player", f.player.trim());
      if (f.nation) params.set("nation", f.nation);
      if (f.tier !== "") params.set("tier", f.tier);
      if (f.position) params.set("position", f.position);
      if (f.maxPrice.trim()) {
        // Convert human USDC to 6dp integer for the API
        const humanPrice = parseFloat(f.maxPrice.trim());
        if (!isNaN(humanPrice) && humanPrice >= 0) {
          params.set("maxPrice", Math.floor(humanPrice * 1_000_000).toString());
        }
      }

      const url = `/api/market${params.toString() ? "?" + params.toString() : ""}`;
      const res = await fetch(url);
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const data = await res.json() as { listings: MarketListing[] };
      setListings(data.listings);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex max-w-5xl flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold">Marketplace</h1>
        <p className="text-sm opacity-70">Browse and buy listed player cards.</p>
      </header>

      <FilterBar
        filters={filters}
        onChange={setFilters}
        onSearch={() => fetchListings(filters)}
        loading={loading}
      />

      {error && (
        <p className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {!loading && listings.length === 0 && !error && (
        <p className="text-sm opacity-60">No listings found. Adjust filters or check back later.</p>
      )}

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {listings.map((l) => (
          <ListingCard key={l.tokenId} listing={l} />
        ))}
      </section>
    </main>
  );
}
