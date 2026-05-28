"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useWallets } from "@privy-io/react-auth";
import type { Address } from "viem";
import type { PortfolioCard, CardState } from "@/app/api/portfolio/route";
import { PLAYER_BY_ID } from "@/lib/data/players";
import { fmtUsdc } from "@/lib/business/format";
import { PlayerCard } from "@/components/PlayerCard";
import type { TierId } from "@/components/ui";
import {
  EmptyState,
  Panel,
  Pill,
  SectionHeading,
  Skeleton,
  Stat,
  TierBadge,
  TIER_META,
  buttonClasses,
  cx,
} from "@/components/ui";

// ── State pill mapping ─────────────────────────────────────────────────────────

const STATE_PILL_TONE: Record<
  CardState,
  "ok" | "cobalt" | "flame" | "warn" | "neutral"
> = {
  OWN: "ok",
  RENTING_IN: "cobalt",
  RENTING_OUT: "flame",
  LOCKED: "warn",
};

const STATE_LABEL: Record<CardState, string> = {
  OWN: "Own",
  RENTING_IN: "Renting in",
  RENTING_OUT: "Renting out",
  LOCKED: "In lineup",
};

function StateIndicator({ state }: { state: CardState }) {
  return (
    <Pill tone={STATE_PILL_TONE[state]}>
      {STATE_LABEL[state]}
    </Pill>
  );
}

// ── Tier grouping ─────────────────────────────────────────────────────────────

const TIER_ORDER: TierId[] = [3, 2, 1, 0];

function tierIdFromNumber(t: number): TierId {
  if (t === 0 || t === 1 || t === 2 || t === 3) return t;
  return 0;
}

// ── Career Stats section ───────────────────────────────────────────────────────

interface CareerStats {
  matchdaysPlayed: number;
  totalPoints: number;
  bestDayScore: number;
  totalWon: string;
  totalSpent: string;
  seasonRank: number | null;
}

interface CareerStatsSectionProps {
  address: string;
}

function CareerStatsSection({ address }: CareerStatsSectionProps) {
  const [stats, setStats] = useState<CareerStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/profile/career?wallet=${address.toLowerCase()}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = (await res.json()) as CareerStats;
        if (!cancelled) {
          setStats(body);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [address]);

  return (
    <section aria-label="Career stats">
      <SectionHeading
        kicker="History"
        title="Career"
        className="mb-5"
      />

      {error && (
        <Panel variant="sunken" className="px-5 py-4">
          <p className="text-sm text-danger">Failed to load: {error}</p>
        </Panel>
      )}

      {!error && stats === null && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex flex-col gap-2">
              <Skeleton className="h-9 w-20" />
              <Skeleton className="h-3 w-16" />
            </div>
          ))}
        </div>
      )}

      {stats !== null && (
        <Panel variant="ink" className="p-6">
          <dl className="grid grid-cols-2 gap-x-8 gap-y-6 sm:grid-cols-3 lg:grid-cols-6">
            <div>
              <Stat
                value={stats.matchdaysPlayed}
                label="Matchdays"
                tone="on-panel"
              />
            </div>
            <div>
              <Stat
                value={stats.totalPoints.toFixed(1)}
                label="Total points"
                tone="on-panel"
              />
            </div>
            <div>
              <Stat
                value={stats.bestDayScore.toFixed(1)}
                label="Best day"
                tone="on-panel"
              />
            </div>
            <div>
              <Stat
                value={fmtUsdc(BigInt(stats.totalWon))}
                label="USDC won"
                tone="on-panel"
              />
            </div>
            <div>
              <Stat
                value={fmtUsdc(BigInt(stats.totalSpent))}
                label="USDC spent"
                tone="on-panel"
              />
            </div>
            <div>
              <Stat
                value={stats.seasonRank === null ? "—" : `#${stats.seasonRank}`}
                label="Season rank"
                tone="on-panel"
              />
            </div>
          </dl>
        </Panel>
      )}
    </section>
  );
}

// ── Skeleton grid ──────────────────────────────────────────────────────────────

function CardGridSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {Array.from({ length: 8 }).map((_, i) => (
        <Skeleton key={i} className="h-44 w-full rounded-card" />
      ))}
    </div>
  );
}

// ── Tier group ─────────────────────────────────────────────────────────────────

interface TierGroupProps {
  tier: TierId;
  cards: PortfolioCard[];
}

function TierGroup({ tier, cards }: TierGroupProps) {
  if (cards.length === 0) return null;
  const meta = TIER_META[tier];

  return (
    <section aria-label={`${meta.name} cards`}>
      <div className="mb-4 flex items-center gap-3">
        <TierBadge tier={tier} />
        <span className="text-sm font-medium text-muted">{cards.length}</span>
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {cards.map((card) => {
          const player = PLAYER_BY_ID.get(card.playerId as `0x${string}`);
          const cardTier = tierIdFromNumber(card.tier);

          if (!player) {
            return (
              <Panel
                key={card.tokenId}
                variant="sunken"
                className="flex flex-col gap-1.5 p-3"
              >
                <p className="truncate text-xs font-medium text-ink">
                  {card.playerId.slice(0, 10)}...
                </p>
                <p className="font-mono text-[10px] text-muted">
                  #{card.serialNumber}
                </p>
                <StateIndicator state={card.state} />
              </Panel>
            );
          }

          return (
            <PlayerCard
              key={card.tokenId}
              name={player.name}
              nation={player.nation}
              position={player.position}
              tier={cardTier}
              size="sm"
              dimmed={card.state === "RENTING_OUT"}
              footer={
                <div className="flex items-center justify-between gap-2">
                  <StateIndicator state={card.state} />
                  <span className="font-mono text-[10px] text-muted tabular-nums">
                    #{card.serialNumber}
                  </span>
                </div>
              }
            />
          );
        })}
      </div>
    </section>
  );
}

// ── Collection summary ─────────────────────────────────────────────────────────

interface CollectionSummaryProps {
  cards: PortfolioCard[];
}

function CollectionSummary({ cards }: CollectionSummaryProps) {
  const byTier = cards.reduce<Record<number, number>>((acc, c) => {
    acc[c.tier] = (acc[c.tier] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <Panel variant="ink" className="px-6 py-5">
      <div className="grid grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-3 lg:grid-cols-5">
        <Stat value={cards.length} label="Total cards" tone="on-panel" />
        {TIER_ORDER.map((tid) => (
          <Stat
            key={tid}
            value={byTier[tid] ?? 0}
            label={TIER_META[tid].name}
            tone="on-panel"
          />
        ))}
      </div>
    </Panel>
  );
}

// ── State filter bar ───────────────────────────────────────────────────────────

const ALL_STATES: CardState[] = ["OWN", "RENTING_IN", "RENTING_OUT", "LOCKED"];

interface FilterBarProps {
  active: CardState | null;
  counts: Record<CardState, number>;
  onChange: (s: CardState | null) => void;
}

function FilterBar({ active, counts, onChange }: FilterBarProps) {
  return (
    <div role="group" aria-label="Filter by card status" className="flex flex-wrap gap-2">
      <button
        onClick={() => onChange(null)}
        className={cx(
          buttonClasses(active === null ? "primary" : "secondary", "sm"),
          "text-xs",
        )}
        aria-pressed={active === null}
      >
        All
      </button>
      {ALL_STATES.filter((s) => counts[s] > 0).map((s) => (
        <button
          key={s}
          onClick={() => onChange(s)}
          className={cx(
            buttonClasses(active === s ? "primary" : "secondary", "sm"),
            "gap-1.5 text-xs",
          )}
          aria-pressed={active === s}
        >
          {STATE_LABEL[s]}
          <span
            className={cx(
              "inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] tabular-nums",
              active === s
                ? "bg-on-panel/20 text-on-panel"
                : "bg-paper-3 text-ink-2",
            )}
          >
            {counts[s]}
          </span>
        </button>
      ))}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function PortfolioPage() {
  const { wallets } = useWallets();
  const address = wallets[0]?.address as Address | undefined;

  const [cards, setCards] = useState<PortfolioCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<CardState | null>(null);

  useEffect(() => {
    if (!address) return;
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/portfolio?wallet=${address}`);
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(body.error ?? `HTTP ${res.status}`);
        }
        const data = (await res.json()) as { cards: PortfolioCard[] };
        if (!cancelled) setCards(data.cards);
      } catch (err) {
        if (!cancelled)
          setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [address]);

  // Build per-tier and per-state grouped views
  const stateCounts: Record<CardState, number> = {
    OWN: 0,
    RENTING_IN: 0,
    RENTING_OUT: 0,
    LOCKED: 0,
  };
  for (const card of cards) {
    stateCounts[card.state]++;
  }

  const visibleCards =
    activeFilter === null ? cards : cards.filter((c) => c.state === activeFilter);

  const byTier: Record<TierId, PortfolioCard[]> = { 0: [], 1: [], 2: [], 3: [] };
  for (const card of visibleCards) {
    const tid = tierIdFromNumber(card.tier);
    byTier[tid].push(card);
  }

  return (
    <main className="flex flex-col gap-10 py-2">
      {/* ── Page header ──────────────────────────────────────────────────── */}
      <header className="flex flex-col gap-1">
        <SectionHeading
          kicker="Collection"
          title="My Squad"
          action={
            <Link href="/market" className={buttonClasses("secondary", "sm")}>
              Browse market
            </Link>
          }
        />
        <p className="mt-1 max-w-[55ch] text-sm text-ink-2">
          All PANENKA cards associated with your wallet: owned, on loan, and locked
          in your active lineup.
        </p>
      </header>

      {/* ── No wallet ────────────────────────────────────────────────────── */}
      {!address && (
        <EmptyState
          icon="👤"
          title="Wallet not connected"
          hint="Connect your wallet to see your card collection."
        />
      )}

      {/* ── Loading state ─────────────────────────────────────────────────── */}
      {loading && (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex flex-col gap-2">
                <Skeleton className="h-9 w-16" />
                <Skeleton className="h-3 w-12" />
              </div>
            ))}
          </div>
          <CardGridSkeleton />
        </>
      )}

      {/* ── Error state ───────────────────────────────────────────────────── */}
      {!loading && error && (
        <Panel variant="sunken" className="flex items-start gap-3 px-5 py-4">
          <Pill tone="danger">Error</Pill>
          <p className="text-sm text-ink-2">
            Could not load cards: {error}
          </p>
        </Panel>
      )}

      {/* ── Loaded + has cards ────────────────────────────────────────────── */}
      {!loading && !error && address && cards.length > 0 && (
        <>
          <CollectionSummary cards={cards} />

          <section className="flex flex-col gap-6" aria-label="Card collection">
            <FilterBar
              active={activeFilter}
              counts={stateCounts}
              onChange={setActiveFilter}
            />

            {visibleCards.length === 0 ? (
              <Panel variant="sunken" className="px-5 py-8 text-center">
                <p className="text-sm text-muted">
                  No {activeFilter ? STATE_LABEL[activeFilter].toLowerCase() : ""} cards.
                </p>
              </Panel>
            ) : (
              <div className="flex flex-col gap-8">
                {TIER_ORDER.map((tid) => (
                  <TierGroup key={tid} tier={tid} cards={byTier[tid]} />
                ))}
              </div>
            )}
          </section>
        </>
      )}

      {/* ── Loaded + empty ────────────────────────────────────────────────── */}
      {!loading && !error && address && cards.length === 0 && (
        <EmptyState
          icon="🃏"
          title="No cards yet"
          hint="Open a pack or claim your starter squad to begin your collection."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Link href="/packs" className={buttonClasses("cta", "md")}>
                Open a pack
              </Link>
              <Link href="/play" className={buttonClasses("secondary", "md")}>
                Claim starter squad
              </Link>
            </div>
          }
        />
      )}

      {/* ── Career stats ──────────────────────────────────────────────────── */}
      {address && !loading && <CareerStatsSection address={address} />}
    </main>
  );
}
