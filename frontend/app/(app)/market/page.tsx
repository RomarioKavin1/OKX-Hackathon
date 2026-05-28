"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { TIER_NAME } from "@/lib/types";
import { NATION_NAME } from "@/lib/data/nations";
import { fmtUsdc } from "@/lib/business/format";
import { PLAYER_BY_ID } from "@/lib/data/players";
import type { MarketListing } from "@/app/api/market/route";
import { PlayerCard } from "@/components/PlayerCard";
import {
  Button,
  buttonClasses,
  Pill,
  SectionHeading,
  EmptyState,
  Skeleton,
  TierBadge,
  cx,
} from "@/components/ui";
import type { TierId } from "@/components/ui";
import type { Nation } from "@/lib/data/nations";
import type { Position } from "@/lib/types";

// ── Types ────────────────────────────────────────────────────────────────────

interface Filters {
  player: string;
  nation: string;
  tier: string;
  position: string;
  maxPrice: string;
}

// ── Tier quick-filter chips ───────────────────────────────────────────────────

const TIER_CHIPS: { value: string; label: string; tone: "neutral" | "cobalt" | "violet" | "gold" }[] = [
  { value: "", label: "All", tone: "neutral" },
  { value: "0", label: "Common", tone: "neutral" },
  { value: "1", label: "Rare", tone: "cobalt" },
  { value: "2", label: "Super Rare", tone: "violet" },
  { value: "3", label: "Unique", tone: "gold" },
];

const POSITION_CHIPS: { value: string; label: string }[] = [
  { value: "", label: "All positions" },
  { value: "GK", label: "GK" },
  { value: "DEF", label: "DEF" },
  { value: "MID", label: "MID" },
  { value: "FWD", label: "FWD" },
];

// ── Module-scope sub-components ───────────────────────────────────────────────

interface ListingCardProps {
  listing: MarketListing;
}

function ListingCard({ listing }: ListingCardProps) {
  const player = PLAYER_BY_ID.get(listing.playerId as `0x${string}`);
  const name = player?.name ?? `Player ${listing.playerId.slice(0, 10)}…`;
  const tierId = Math.min(3, Math.max(0, listing.tier)) as TierId;
  const priceBigInt = BigInt(listing.price);
  const priceDisplay = fmtUsdc(priceBigInt);

  // Map nation/position from listing to PlayerCard props
  const nation = (listing.nation ?? (player?.nation as Nation | undefined)) ?? "FRA";
  const position = (listing.position ?? (player?.position as Position | undefined)) ?? "MID";

  return (
    <Link href={`/market/${listing.tokenId}`} className="block focus:outline-none">
      <PlayerCard
        name={name}
        nation={nation as Nation}
        position={position as Position}
        tier={tierId}
        stats={player?.base}
        footer={
          <div className="flex items-center justify-between gap-2">
            <span className="display tabular-nums text-base leading-none text-ink">
              {priceDisplay}
              <span className="ml-1 text-xs font-sans font-semibold text-muted">USDC</span>
            </span>
            <span className={buttonClasses("primary", "sm")}>Buy</span>
          </div>
        }
      />
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

  const inputBase =
    "rounded-sm border border-line-2 bg-paper-2 px-3 py-1.5 text-sm text-ink " +
    "placeholder:text-muted focus:border-cobalt focus:outline-none focus:ring-2 focus:ring-cobalt/25 " +
    "transition-[border-color,box-shadow] duration-150";

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); onSearch(); }}
      className="flex flex-wrap items-end gap-3"
    >
      <label className="flex flex-col gap-1">
        <span className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Player ID</span>
        <input
          type="text"
          placeholder="0x…"
          value={filters.player}
          onChange={set("player")}
          className={cx(inputBase, "w-36 font-mono")}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Nation</span>
        <select
          value={filters.nation}
          onChange={set("nation")}
          className={inputBase}
        >
          <option value="">All nations</option>
          {(Object.keys(NATION_NAME) as (keyof typeof NATION_NAME)[]).map((code) => (
            <option key={code} value={code}>
              {NATION_NAME[code]}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Max price (USDC)</span>
        <input
          type="number"
          min="0"
          step="1"
          placeholder="any"
          value={filters.maxPrice}
          onChange={set("maxPrice")}
          className={cx(inputBase, "w-28")}
        />
      </label>

      <Button type="submit" variant="primary" size="md" loading={loading}>
        {loading ? "Searching" : "Search"}
      </Button>
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

  function setTierFilter(val: string) {
    const next = { ...filters, tier: val };
    setFilters(next);
    void fetchListings(next);
  }

  function setPositionFilter(val: string) {
    const next = { ...filters, position: val };
    setFilters(next);
    void fetchListings(next);
  }

  return (
    <main className="flex flex-col gap-8">
      {/* ── Header ── */}
      <SectionHeading
        kicker="2026 World Cup"
        title="Marketplace"
        action={
          <p className="text-sm text-muted">
            {loading ? "Loading…" : `${listings.length} listing${listings.length === 1 ? "" : "s"}`}
          </p>
        }
      />

      {/* ── Tier quick-filter row ── */}
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter by tier">
        {TIER_CHIPS.map((chip) => (
          <button
            key={chip.value}
            type="button"
            onClick={() => setTierFilter(chip.value)}
            className="focus:outline-none focus-visible:ring-2 focus-visible:ring-cobalt focus-visible:ring-offset-2 rounded-full"
            aria-pressed={filters.tier === chip.value}
          >
            <Pill
              tone={filters.tier === chip.value ? chip.tone : "neutral"}
              className={cx(
                "cursor-pointer transition-opacity duration-150",
                filters.tier === chip.value
                  ? "opacity-100 ring-1 ring-current"
                  : "opacity-70 hover:opacity-100",
              )}
            >
              {chip.label}
            </Pill>
          </button>
        ))}

        <div className="ml-4 h-4 w-px bg-line-2" aria-hidden />

        {POSITION_CHIPS.map((chip) => (
          <button
            key={chip.value}
            type="button"
            onClick={() => setPositionFilter(chip.value)}
            className="focus:outline-none focus-visible:ring-2 focus-visible:ring-cobalt focus-visible:ring-offset-2 rounded-full"
            aria-pressed={filters.position === chip.value}
          >
            <Pill
              tone={filters.position === chip.value ? "cobalt" : "neutral"}
              className={cx(
                "cursor-pointer transition-opacity duration-150",
                filters.position === chip.value
                  ? "opacity-100 ring-1 ring-current"
                  : "opacity-70 hover:opacity-100",
              )}
            >
              {chip.label}
            </Pill>
          </button>
        ))}
      </div>

      {/* ── Advanced filter bar ── */}
      <FilterBar
        filters={filters}
        onChange={setFilters}
        onSearch={() => fetchListings(filters)}
        loading={loading}
      />

      {/* ── Error ── */}
      {error && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-card border border-danger/30 bg-danger/8 px-4 py-3 text-sm text-danger"
        >
          <span aria-hidden className="mt-0.5 shrink-0">!</span>
          {error}
        </div>
      )}

      {/* ── Results ── */}
      {loading ? (
        <section
          aria-label="Loading listings"
          className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3"
        >
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-52 rounded-card" />
          ))}
        </section>
      ) : listings.length === 0 && !error ? (
        <EmptyState
          icon="🃏"
          title="No listings found"
          hint="Try adjusting your filters or check back when more cards are listed."
          action={
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                const empty: Filters = { player: "", nation: "", tier: "", position: "", maxPrice: "" };
                setFilters(empty);
                void fetchListings(empty);
              }}
            >
              Clear filters
            </Button>
          }
        />
      ) : (
        <section
          aria-label={`${listings.length} market listing${listings.length === 1 ? "" : "s"}`}
          className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3"
        >
          {listings.map((l) => (
            <ListingCard key={l.tokenId} listing={l} />
          ))}
        </section>
      )}
    </main>
  );
}
