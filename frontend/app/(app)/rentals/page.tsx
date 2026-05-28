"use client";

/**
 * /rentals — Browse rentable cards + owner listing / renter rent flows.
 *
 * Data flow:
 *   - GET /api/rentals?{filters}  → RentalsResponse (from DB, active listings)
 *   - staminaOf(tokenId)          → stamina label (Fresh / Normal / Fatigued)
 *   - cardUsedInMatchday(md, tid) → availability badge for next matchday
 *
 * Owner actions (card.owner === walletAddress):
 *   - ListForRentPanel  (Fixed / FloorPegged / Suggested)
 *   - AutoListPanel     (FR-R5: FloorPegged auto-list + setFloorPrice + delist)
 *   - SettlePanel       (post-lock settle)
 *   - PostponeRefundPanel (FR-R7)
 *
 * Renter actions:
 *   - RentPanel  (approve USDC + rent)
 *   - InsureToggle (DNP insurance — Task 7.3)
 *   - CancelPanel (pre-lock cancel, shows 90% refund)
 *   - ClaimDnpPanel (post-DNP-root claim — Task 7.3)
 *   - PostponeRefundPanel (FR-R7)
 */

import { useEffect, useRef, useState } from "react";
import { useWallets } from "@privy-io/react-auth";
import type { Address, Hex } from "viem";

import { staminaOf, cardUsedInMatchday } from "@/lib/actions/reads";
import { STAMINA } from "@/lib/constants";
import { PricingMode, TIER_NAME, type Tier } from "@/lib/types";
import { toUsdc } from "@/lib/business/format";

import {
  ListForRentPanel,
  AutoListPanel,
  RentPanel,
  SettlePanel,
  CancelPanel,
  PostponeRefundPanel,
} from "@/components/RentalActions";
import { InsureToggle, ClaimDnpPanel } from "@/components/InsureToggle";
import type { RentalsResponse, RentalListing } from "@/app/api/rentals/route";

// ── Mode label ────────────────────────────────────────────────────────────────

const MODE_LABEL: Record<number, string> = {
  [PricingMode.Fixed]: "Fixed",
  [PricingMode.FloorPegged]: "Floor-Pegged",
  [PricingMode.Suggested]: "Suggested",
};

// ── Stamina badge ─────────────────────────────────────────────────────────────

interface StaminaBadgeProps {
  value: number | null;
}

function StaminaBadge({ value }: StaminaBadgeProps) {
  if (value === null) {
    return (
      <span className="rounded bg-zinc-100 px-2 py-0.5 text-xs text-zinc-500">
        stamina …
      </span>
    );
  }
  const label =
    value > STAMINA.freshThreshold
      ? "Fresh"
      : value < STAMINA.fatiguedThreshold
        ? "Fatigued"
        : "Normal";
  const cls =
    label === "Fresh"
      ? "bg-emerald-50 text-emerald-700"
      : label === "Fatigued"
        ? "bg-red-50 text-red-700"
        : "bg-zinc-100 text-zinc-600";
  return (
    <span className={`rounded px-2 py-0.5 text-xs font-medium ${cls}`}>
      {label} ({value})
    </span>
  );
}

// ── Availability badge ────────────────────────────────────────────────────────

interface AvailBadgeProps {
  used: boolean | null;
}

function AvailBadge({ used }: AvailBadgeProps) {
  if (used === null) {
    return (
      <span className="rounded bg-zinc-100 px-2 py-0.5 text-xs text-zinc-500">
        avail …
      </span>
    );
  }
  return used ? (
    <span className="rounded bg-amber-50 px-2 py-0.5 text-xs text-amber-700">
      Used this matchday
    </span>
  ) : (
    <span className="rounded bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">
      Available
    </span>
  );
}

// ── Filter bar ────────────────────────────────────────────────────────────────

interface FilterState {
  nation: string;
  tier: string;
  position: string;
  maxPrice: string;
}

interface FilterBarProps {
  filters: FilterState;
  onChange: (f: FilterState) => void;
  onApply: () => void;
  loading: boolean;
}

function FilterBar({ filters, onChange, onApply, loading }: FilterBarProps) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-zinc-500">Nation</span>
        <input
          type="text"
          placeholder="e.g. FRA"
          className="w-24 rounded border border-zinc-300 bg-white px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400"
          value={filters.nation}
          onChange={(e) => onChange({ ...filters, nation: e.target.value })}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-zinc-500">Tier</span>
        <select
          className="rounded border border-zinc-300 bg-white px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400"
          value={filters.tier}
          onChange={(e) => onChange({ ...filters, tier: e.target.value })}
        >
          <option value="">All</option>
          <option value="0">Common</option>
          <option value="1">Rare</option>
          <option value="2">Super Rare</option>
          <option value="3">Unique</option>
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-zinc-500">Position</span>
        <select
          className="rounded border border-zinc-300 bg-white px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400"
          value={filters.position}
          onChange={(e) => onChange({ ...filters, position: e.target.value })}
        >
          <option value="">All</option>
          <option value="GK">GK</option>
          <option value="DEF">DEF</option>
          <option value="MID">MID</option>
          <option value="FWD">FWD</option>
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-zinc-500">Max price (USDC)</span>
        <input
          type="number"
          min="0"
          step="0.01"
          placeholder="any"
          className="w-28 rounded border border-zinc-300 bg-white px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400"
          value={filters.maxPrice}
          onChange={(e) => onChange({ ...filters, maxPrice: e.target.value })}
        />
      </label>

      <button
        type="button"
        disabled={loading}
        onClick={onApply}
        className="self-end rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-40"
      >
        {loading ? "Loading…" : "Search"}
      </button>
    </div>
  );
}

// ── Card tile ─────────────────────────────────────────────────────────────────

interface CardTileProps {
  listing: RentalListing;
  walletAddress: Address | undefined;
  checkMatchday: number;
  onSuccess: (tokenId: string) => void;
}

function CardTile({ listing, walletAddress, checkMatchday, onSuccess }: CardTileProps) {
  const tokenIdBig = BigInt(listing.tokenId);
  const isOwner =
    walletAddress !== undefined &&
    listing.owner.toLowerCase() === walletAddress.toLowerCase();

  // On-chain derived state
  const [stamina, setStamina] = useState<number | null>(null);
  const [usedThisMatchday, setUsedThisMatchday] = useState<boolean | null>(null);
  const [expanded, setExpanded] = useState(false);
  // Insurance: track the matchday chosen in the rent panel so the insure/claim
  // toggle stays in sync.  We track it here so InsureToggle + ClaimDnpPanel share
  // the same matchday value.
  const [rentMatchday, setRentMatchday] = useState<number>(checkMatchday);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const s = await staminaOf(tokenIdBig);
        if (!cancelled) setStamina(s);
      } catch {
        // on-chain read unavailable — leave null
      }
    })();
    return () => { cancelled = true; };
  }, [tokenIdBig]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const used = await cardUsedInMatchday(checkMatchday, tokenIdBig);
        if (!cancelled) setUsedThisMatchday(used);
      } catch {
        // leave null
      }
    })();
    return () => { cancelled = true; };
  }, [tokenIdBig, checkMatchday]);

  // Derive displayed price string
  const priceValueBig = BigInt(listing.priceValue);
  const priceDisplay =
    listing.mode === PricingMode.FloorPegged
      ? `${listing.priceValue} bps of floor`
      : `${(Number(priceValueBig) / 1_000_000).toFixed(2)} USDC`;

  // Dummy resolvedPrice for RentPanel (best effort: treat non-FloorPegged as exact price)
  const resolvedPrice =
    listing.mode !== PricingMode.FloorPegged ? priceValueBig : toUsdc("1");

  const isAutoListed = listing.mode === PricingMode.FloorPegged;

  const handleSuccess = (hash: Hex) => {
    console.info("RentalAction tx:", hash);
    onSuccess(listing.tokenId);
  };

  return (
    <article className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
      {/* Header row */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-semibold">
            Token #{listing.tokenId.slice(-8)}
          </span>
          <span className="text-xs text-zinc-500">
            {TIER_NAME[listing.tier as Tier]} ·{" "}
            {listing.position ?? "?"} ·{" "}
            {listing.nation ?? "—"}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1">
          <StaminaBadge value={stamina} />
          <AvailBadge used={usedThisMatchday} />
          <span className="rounded bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600">
            {MODE_LABEL[listing.mode] ?? "?"} · {priceDisplay}
          </span>
        </div>
      </div>

      {/* Owner tag */}
      <p className="mt-1 truncate text-xs text-zinc-400">
        Owner: {listing.owner}
      </p>

      {/* Expand / collapse actions */}
      <button
        type="button"
        className="mt-3 text-xs font-medium text-zinc-600 underline hover:text-zinc-900"
        onClick={() => setExpanded((v) => !v)}
      >
        {expanded ? "Hide actions" : "Show actions"}
      </button>

      {expanded && (
        <div className="mt-4 flex flex-col gap-4">
          {/* Owner flows */}
          {isOwner && (
            <>
              <ListForRentPanel tokenId={tokenIdBig} onSuccess={handleSuccess} />
              <AutoListPanel
                tokenId={tokenIdBig}
                playerId={listing.playerId as Hex}
                tier={listing.tier}
                isAutoListed={isAutoListed}
                onSuccess={handleSuccess}
              />
              <SettlePanel
                tokenId={tokenIdBig}
                paid={resolvedPrice}
                onSuccess={handleSuccess}
              />
              <PostponeRefundPanel tokenId={tokenIdBig} onSuccess={handleSuccess} />
            </>
          )}

          {/* Renter flows (anyone can see; also shown to owner so they can act) */}
          {!isOwner && (
            <>
              <RentPanel
                tokenId={tokenIdBig}
                resolvedPrice={resolvedPrice}
                onSuccess={handleSuccess}
              />

              {/* DNP Insurance — shown alongside the rent flow (Task 7.3) */}
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <label className="text-xs font-medium text-zinc-500">
                    Insurance matchday:
                  </label>
                  <select
                    className="rounded border border-zinc-300 bg-white px-2 py-0.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400"
                    value={rentMatchday}
                    onChange={(e) => setRentMatchday(Number(e.target.value))}
                  >
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((d) => (
                      <option key={d} value={d}>
                        Matchday {d}
                      </option>
                    ))}
                  </select>
                </div>
                <InsureToggle
                  matchday={rentMatchday}
                  tokenId={tokenIdBig}
                  rentalCost={resolvedPrice}
                  onSuccess={handleSuccess}
                />
              </div>

              {/* DNP Refund Claim — shown after the oracle posts a DNP root */}
              <ClaimDnpPanel
                matchday={rentMatchday}
                tokenId={tokenIdBig}
                rentalCost={resolvedPrice}
                onSuccess={handleSuccess}
              />

              <CancelPanel
                tokenId={tokenIdBig}
                paid={resolvedPrice}
                onSuccess={handleSuccess}
              />
              <PostponeRefundPanel tokenId={tokenIdBig} onSuccess={handleSuccess} />
            </>
          )}
        </div>
      )}
    </article>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

const DEFAULT_FILTERS: FilterState = {
  nation: "",
  tier: "",
  position: "",
  maxPrice: "",
};

export default function RentalsPage() {
  const { wallets } = useWallets();
  const address = wallets[0]?.address as Address | undefined;

  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [listings, setListings] = useState<RentalListing[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkMatchday, setCheckMatchday] = useState<number>(1);
  // Trigger a re-fetch by bumping this counter
  const [fetchTick, setFetchTick] = useState(0);
  // Hold the active filter snapshot at fetch time
  const activeFiltersRef = useRef<FilterState>(DEFAULT_FILTERS);

  // Fetch whenever fetchTick changes (initial + manual search + refresh)
  useEffect(() => {
    const f = activeFiltersRef.current;
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (f.nation.trim()) params.set("nation", f.nation.trim());
        if (f.tier.trim()) params.set("tier", f.tier.trim());
        if (f.position.trim()) params.set("position", f.position.trim());
        if (f.maxPrice.trim()) {
          try {
            const rawPrice = toUsdc(f.maxPrice.trim());
            params.set("maxPrice", rawPrice.toString());
          } catch {
            // leave maxPrice out if conversion fails
          }
        }
        const res = await fetch(`/api/rentals?${params.toString()}`);
        if (!res.ok) {
          const body = await res.json().catch(() => ({})) as { error?: string };
          throw new Error(body.error ?? `HTTP ${res.status}`);
        }
        const data = await res.json() as RentalsResponse;
        if (!cancelled) setListings(data.listings);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [fetchTick]);

  function triggerFetch(f: FilterState) {
    activeFiltersRef.current = f;
    setFetchTick((t) => t + 1);
  }

  const handleRefresh = () => {
    triggerFetch(filters);
  };

  return (
    <main className="flex max-w-4xl flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold">Rental Market</h1>
        <p className="text-sm opacity-70">
          Browse available cards to rent for a matchday, or list your cards for others to rent.
        </p>
      </header>

      {!address && (
        <p className="rounded border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Connect your wallet to rent or list cards.
        </p>
      )}

      {/* Matchday selector for availability check */}
      <section className="flex items-center gap-3">
        <label className="text-sm font-medium" htmlFor="check-matchday">
          Check availability for matchday:
        </label>
        <select
          id="check-matchday"
          className="rounded border border-zinc-300 bg-white px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400"
          value={checkMatchday}
          onChange={(e) => setCheckMatchday(Number(e.target.value))}
        >
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((d) => (
            <option key={d} value={d}>
              Matchday {d}
            </option>
          ))}
        </select>
      </section>

      {/* Filters */}
      <section>
        <FilterBar
          filters={filters}
          onChange={setFilters}
          onApply={() => triggerFetch(filters)}
          loading={loading}
        />
      </section>

      {/* Error state */}
      {error && (
        <p className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Error: {error}
        </p>
      )}

      {/* Results */}
      {!loading && !error && listings.length === 0 && (
        <p className="text-sm opacity-60">No active listings match your filters.</p>
      )}

      {listings.length > 0 && (
        <section className="flex flex-col gap-4">
          <p className="text-xs text-zinc-500">
            {listings.length} listing{listings.length !== 1 ? "s" : ""} found
          </p>
          {listings.map((listing) => (
            <CardTile
              key={listing.tokenId}
              listing={listing}
              walletAddress={address}
              checkMatchday={checkMatchday}
              onSuccess={handleRefresh}
            />
          ))}
        </section>
      )}
    </main>
  );
}
