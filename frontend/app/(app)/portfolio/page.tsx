"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useWallets } from "@privy-io/react-auth";
import type { Address } from "viem";
import type { PortfolioCard, CardState } from "@/app/api/portfolio/route";
import { PLAYER_BY_ID } from "@/lib/data/players";

// ── Module-scope sub-components ───────────────────────────────────────────────

interface StateBadgeProps {
  state: CardState;
}

function StateBadge({ state }: StateBadgeProps) {
  const styles: Record<CardState, string> = {
    OWN: "bg-emerald-100 text-emerald-800",
    RENTING_OUT: "bg-blue-100 text-blue-800",
    RENTING_IN: "bg-amber-100 text-amber-800",
    LOCKED: "bg-rose-100 text-rose-800",
  };
  const labels: Record<CardState, string> = {
    OWN: "OWN",
    RENTING_OUT: "RENTING OUT",
    RENTING_IN: "RENTING IN",
    LOCKED: "LOCKED IN LINEUP",
  };
  return (
    <span
      className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${styles[state]}`}
    >
      {labels[state]}
    </span>
  );
}

const TIER_LABEL = ["Common", "Rare", "Super Rare", "Unique"] as const;
const TIER_COLOR = [
  "text-zinc-600",
  "text-sky-600",
  "text-purple-600",
  "text-amber-600",
] as const;

interface CardRowProps {
  card: PortfolioCard;
}

function CardRow({ card }: CardRowProps) {
  const player = PLAYER_BY_ID.get(card.playerId as `0x${string}`);
  const tierLabel = TIER_LABEL[card.tier] ?? `Tier ${card.tier}`;
  const tierColor = TIER_COLOR[card.tier] ?? "text-zinc-600";

  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-zinc-200 bg-white px-4 py-3">
      <div className="flex flex-col gap-0.5">
        <p className="text-sm font-semibold text-zinc-900">
          {player ? player.name : `Player ${card.playerId.slice(0, 10)}…`}
        </p>
        <p className="text-xs text-zinc-500">
          {player ? (
            <>
              <span>{player.nation}</span>
              <span className="mx-1 opacity-40">·</span>
              <span>{player.position}</span>
            </>
          ) : null}
          <span className="mx-1 opacity-40">·</span>
          <span className={`font-medium ${tierColor}`}>{tierLabel}</span>
          <span className="mx-1 opacity-40">·</span>
          <span>#{card.serialNumber}</span>
        </p>
      </div>
      <div className="flex flex-shrink-0 items-center gap-2">
        <StateBadge state={card.state} />
      </div>
    </div>
  );
}

interface StateGroupProps {
  state: CardState;
  cards: PortfolioCard[];
}

function StateGroup({ state, cards }: StateGroupProps) {
  if (cards.length === 0) return null;
  const headingLabel: Record<CardState, string> = {
    OWN: "Owned",
    RENTING_OUT: "Renting Out",
    RENTING_IN: "Renting In",
    LOCKED: "Locked in Lineup",
  };
  return (
    <section className="flex flex-col gap-2">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-700">
        {headingLabel[state]}
        <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-500">
          {cards.length}
        </span>
      </h2>
      <div className="flex flex-col gap-2">
        {cards.map((c) => (
          <CardRow key={c.tokenId} card={c} />
        ))}
      </div>
    </section>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function PortfolioPage() {
  const { wallets } = useWallets();
  const address = wallets[0]?.address as Address | undefined;

  const [cards, setCards] = useState<PortfolioCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  // Group cards by state
  const grouped: Record<CardState, PortfolioCard[]> = {
    OWN: [],
    RENTING_OUT: [],
    RENTING_IN: [],
    LOCKED: [],
  };
  for (const card of cards) {
    grouped[card.state].push(card);
  }

  const STATE_ORDER: CardState[] = ["OWN", "RENTING_OUT", "RENTING_IN", "LOCKED"];

  return (
    <main className="flex max-w-2xl flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold">My Portfolio</h1>
        <p className="text-sm opacity-70">
          All ManagerCup cards associated with your wallet.
        </p>
      </header>

      {!address && (
        <p className="rounded border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Connect your wallet to view your portfolio.
        </p>
      )}

      {loading && (
        <p className="text-sm opacity-60">Loading your cards…</p>
      )}

      {error && (
        <p className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Could not load cards: {error}
        </p>
      )}

      {/* Summary chips */}
      {!loading && !error && address && cards.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {STATE_ORDER.map((s) =>
            grouped[s].length > 0 ? (
              <span
                key={s}
                className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-medium text-zinc-600"
              >
                {s.replace("_", " ")}: {grouped[s].length}
              </span>
            ) : null
          )}
        </div>
      )}

      {/* Card groups */}
      {!loading && address && cards.length === 0 && !error && (
        <div className="rounded border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-sm text-amber-800">
            You don&apos;t own or rent any cards yet.
          </p>
          <Link
            href="/packs"
            className="mt-2 inline-block text-sm font-medium text-amber-900 underline"
          >
            Buy a pack to get started →
          </Link>
        </div>
      )}

      {!loading && cards.length > 0 && (
        <div className="flex flex-col gap-6">
          {STATE_ORDER.map((s) => (
            <StateGroup key={s} state={s} cards={grouped[s]} />
          ))}
        </div>
      )}

      {/* Career stats placeholder */}
      {!loading && address && cards.length > 0 && (
        <section className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-4">
          <h2 className="text-sm font-semibold text-zinc-700">Career Stats</h2>
          <p className="mt-1 text-xs text-zinc-500">
            Season statistics will appear here once the first matchday is
            finalized.
          </p>
        </section>
      )}
    </main>
  );
}
