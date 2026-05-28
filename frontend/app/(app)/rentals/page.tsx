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
import { PricingMode } from "@/lib/types";
import { toUsdc } from "@/lib/business/format";

import { PlayerCard } from "@/components/PlayerCard";
import {
  SectionHeading,
  Pill,
  Panel,
  EmptyState,
  Skeleton,
  Button,
  buttonClasses,
  cx,
} from "@/components/ui";
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
import type { Nation } from "@/lib/data/nations";
import type { TierId } from "@/components/ui";

// ── Mode label ────────────────────────────────────────────────────────────────

const MODE_LABEL: Record<number, string> = {
  [PricingMode.Fixed]: "Fixed",
  [PricingMode.FloorPegged]: "Floor-Pegged",
  [PricingMode.Suggested]: "Suggested",
};

// ── Shared form-control class ─────────────────────────────────────────────────

const FORM_CONTROL =
  "rounded-sm border border-line-2 bg-paper-2 text-ink px-3 h-10 text-sm " +
  "focus-visible:outline-2 focus-visible:outline-cobalt";

// ── Stamina badge ─────────────────────────────────────────────────────────────

interface StaminaBadgeProps {
  value: number | null;
}

function StaminaBadge({ value }: StaminaBadgeProps) {
  if (value === null) {
    return <Skeleton className="h-5 w-16" />;
  }
  const label =
    value > STAMINA.freshThreshold
      ? "Fresh"
      : value < STAMINA.fatiguedThreshold
        ? "Fatigued"
        : "Normal";
  const tone =
    label === "Fresh" ? "ok" : label === "Fatigued" ? "danger" : "neutral";
  return (
    <Pill tone={tone}>
      {label} ({value})
    </Pill>
  );
}

// ── Availability badge ────────────────────────────────────────────────────────

interface AvailBadgeProps {
  used: boolean | null;
}

function AvailBadge({ used }: AvailBadgeProps) {
  if (used === null) {
    return <Skeleton className="h-5 w-20" />;
  }
  return used ? (
    <Pill tone="warn">Used this matchday</Pill>
  ) : (
    <Pill tone="ok">Available</Pill>
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
        <span className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
          Nation
        </span>
        <input
          type="text"
          placeholder="e.g. FRA"
          className={cx(FORM_CONTROL, "w-24")}
          value={filters.nation}
          onChange={(e) => onChange({ ...filters, nation: e.target.value })}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
          Tier
        </span>
        <select
          className={cx(FORM_CONTROL, "w-32")}
          value={filters.tier}
          onChange={(e) => onChange({ ...filters, tier: e.target.value })}
        >
          <option value="">All tiers</option>
          <option value="0">Common</option>
          <option value="1">Rare</option>
          <option value="2">Super Rare</option>
          <option value="3">Unique</option>
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
          Position
        </span>
        <select
          className={cx(FORM_CONTROL, "w-28")}
          value={filters.position}
          onChange={(e) => onChange({ ...filters, position: e.target.value })}
        >
          <option value="">All positions</option>
          <option value="GK">GK</option>
          <option value="DEF">DEF</option>
          <option value="MID">MID</option>
          <option value="FWD">FWD</option>
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
          Max price (USDC)
        </span>
        <input
          type="number"
          min="0"
          step="0.01"
          placeholder="any"
          className={cx(FORM_CONTROL, "w-28")}
          value={filters.maxPrice}
          onChange={(e) => onChange({ ...filters, maxPrice: e.target.value })}
        />
      </label>

      <Button
        type="button"
        variant="primary"
        size="md"
        disabled={loading}
        loading={loading}
        onClick={onApply}
        className="self-end"
      >
        {loading ? "Searching" : "Search"}
      </Button>
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
  // toggle stays in sync. We track it here so InsureToggle + ClaimDnpPanel share
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
      ? `${listing.priceValue} bps`
      : `${(Number(priceValueBig) / 1_000_000).toFixed(2)} USDC`;

  // Dummy resolvedPrice for RentPanel (best effort: treat non-FloorPegged as exact price)
  const resolvedPrice =
    listing.mode !== PricingMode.FloorPegged ? priceValueBig : toUsdc("1");

  const isAutoListed = listing.mode === PricingMode.FloorPegged;

  const handleSuccess = (hash: Hex) => {
    console.info("RentalAction tx:", hash);
    onSuccess(listing.tokenId);
  };

  // Build a minimal footer for PlayerCard: price pill + Rent / Manage toggle
  const cardFooter = (
    <div className="flex items-center justify-between gap-2 py-0.5">
      <div className="flex flex-col gap-0.5">
        <span className="tabular-nums font-semibold text-ink text-xs leading-none">
          {listing.mode === PricingMode.FloorPegged
            ? priceDisplay
            : (Number(priceValueBig) / 1_000_000).toFixed(2) + " USDC"}
        </span>
        <span className="text-[10px] text-muted leading-none">
          {MODE_LABEL[listing.mode] ?? "?"}
        </span>
      </div>
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={`rental-actions-${listing.tokenId}`}
        onClick={() => setExpanded((v) => !v)}
        className={buttonClasses(isOwner ? "secondary" : "cta", "sm")}
      >
        {isOwner ? "Manage" : "Rent"}
      </button>
    </div>
  );

  return (
    <article aria-label={`Rental listing for token ${listing.tokenId.slice(-8)}`}>
      <PlayerCard
        name={`#${listing.tokenId.slice(-8)}`}
        nation={(listing.nation ?? "BRA") as Nation}
        position={(listing.position ?? "MID") as "GK" | "DEF" | "MID" | "FWD"}
        tier={(listing.tier ?? 0) as TierId}
        footer={cardFooter}
        corner={
          <div className="flex flex-col items-end gap-1">
            <StaminaBadge value={stamina} />
            <AvailBadge used={usedThisMatchday} />
          </div>
        }
      />

      {expanded && (
        <div
          id={`rental-actions-${listing.tokenId}`}
          className="mt-2 flex flex-col gap-3"
        >
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
              <Panel variant="paper" className="p-4">
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between border-b border-line pb-3">
                    <p className="text-xs font-semibold text-ink">DNP Insurance</p>
                    <label className="flex items-center gap-2 text-xs text-muted">
                      <span className="text-[10px] uppercase tracking-[0.14em]">Matchday</span>
                      <select
                        className="rounded-sm border border-line-2 bg-paper-2 text-ink px-2 h-7 text-xs focus-visible:outline-2 focus-visible:outline-cobalt"
                        value={rentMatchday}
                        onChange={(e) => setRentMatchday(Number(e.target.value))}
                      >
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((d) => (
                          <option key={d} value={d}>
                            MD {d}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <InsureToggle
                    matchday={rentMatchday}
                    tokenId={tokenIdBig}
                    rentalCost={resolvedPrice}
                    onSuccess={handleSuccess}
                  />
                </div>
              </Panel>

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

// ── Skeleton grid ─────────────────────────────────────────────────────────────

function ListingSkeletons() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="rounded-card border-2 border-line-2 bg-paper-2 overflow-hidden shadow-sticker">
          <Skeleton className="h-7 rounded-none" />
          <div className="p-3 flex gap-3">
            <Skeleton className="size-12 rounded-full shrink-0" />
            <div className="flex-1 flex flex-col gap-2">
              <Skeleton className="h-8 w-12" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-3 w-16" />
            </div>
          </div>
          <Skeleton className="h-9 rounded-none" />
        </div>
      ))}
    </div>
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
    <main className="flex max-w-5xl flex-col gap-8">
      {/* Page header */}
      <div className="flex flex-col gap-4">
        <SectionHeading
          kicker="Rental Market"
          title="Field a star for a matchday"
          action={
            <Pill tone="flame">
              <span aria-hidden>●</span> From ~$0.30 / match
            </Pill>
          }
        />
        <p className="max-w-xl text-sm text-ink-2">
          Browse available cards to rent for one matchday, or list your own cards for others to rent.
          Pricing is set by the owner; cancel before kickoff for a 90% refund.
        </p>
      </div>

      {/* No wallet warning */}
      {!address && (
        <Panel variant="outline" className="flex items-center gap-3 px-4 py-3">
          <Pill tone="warn">No wallet</Pill>
          <p className="text-sm text-ink-2">
            Connect your wallet to rent or list cards.
          </p>
        </Panel>
      )}

      {/* Controls row */}
      <Panel variant="sunken" className="flex flex-wrap items-end gap-6 px-4 py-4">
        {/* Matchday selector */}
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
            Check availability for
          </span>
          <select
            id="check-matchday"
            className={cx(FORM_CONTROL, "w-36")}
            value={checkMatchday}
            onChange={(e) => setCheckMatchday(Number(e.target.value))}
          >
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((d) => (
              <option key={d} value={d}>
                Matchday {d}
              </option>
            ))}
          </select>
        </label>

        {/* Divider */}
        <div className="hidden h-10 w-px bg-line-2 sm:block" aria-hidden />

        {/* Filter bar */}
        <FilterBar
          filters={filters}
          onChange={setFilters}
          onApply={() => triggerFetch(filters)}
          loading={loading}
        />
      </Panel>

      {/* Error state */}
      {error && (
        <Panel variant="outline" className="flex items-center justify-between gap-3 px-4 py-3 border-danger/30">
          <div className="flex items-center gap-2">
            <Pill tone="danger">Error</Pill>
            <p className="text-sm text-ink-2">{error}</p>
          </div>
          <Button variant="secondary" size="sm" onClick={handleRefresh}>
            Retry
          </Button>
        </Panel>
      )}

      {/* Loading skeletons */}
      {loading && <ListingSkeletons />}

      {/* Empty state */}
      {!loading && !error && listings.length === 0 && (
        <EmptyState
          icon="🃏"
          title="No listings found"
          hint="Try adjusting your filters, or list one of your own cards to earn rental income."
          action={
            <Button variant="secondary" size="sm" onClick={handleRefresh}>
              Refresh
            </Button>
          }
        />
      )}

      {/* Results grid */}
      {!loading && listings.length > 0 && (
        <section aria-label={`${listings.length} rental listing${listings.length !== 1 ? "s" : ""}`}>
          <div className="mb-4 flex items-center gap-2">
            <span className="text-xs font-semibold text-muted">
              {listings.length} listing{listings.length !== 1 ? "s" : ""}
            </span>
          </div>

          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {listings.map((listing) => (
              <CardTile
                key={listing.tokenId}
                listing={listing}
                walletAddress={address}
                checkMatchday={checkMatchday}
                onSuccess={handleRefresh}
              />
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
