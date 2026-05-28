"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useWallets } from "@privy-io/react-auth";
import type { Address } from "viem";
import { TxButton } from "@/components/TxButton";
import { ADDRESSES, ABIS } from "@/lib/contracts";
import { cardMeta, cardStats, marketListing, rentalListing } from "@/lib/actions/reads";
import { TIER_NAME, Tier } from "@/lib/types";
import { fmtUsdc } from "@/lib/business/format";
import { toUsdc } from "@/lib/business/format";
import { PLAYER_BY_ID } from "@/lib/data/players";
import { traitsOf } from "@/lib/data";
import type { Stats } from "@/lib/types";
import { PlayerCard } from "@/components/PlayerCard";
import {
  Button,
  buttonClasses,
  Panel,
  Pill,
  TierBadge,
  Skeleton,
  cx,
} from "@/components/ui";
import type { TierId } from "@/components/ui";
import type { Nation } from "@/lib/data/nations";
import type { Position } from "@/lib/types";

// ── Types ────────────────────────────────────────────────────────────────────

interface OnChainData {
  playerId: `0x${string}`;
  tier: Tier;
  serial: number;
  mintBatch: number;
  stats: Stats;
  seller: Address;
  price: bigint;
  isListed: boolean;
  rentalActive: boolean;
}

// ── Sub-components ───────────────────────────────────────────────────────────

interface StatRowProps {
  label: string;
  value: number;
}

function StatRow({ label, value }: StatRowProps) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-20 text-xs font-semibold uppercase tracking-[0.12em] text-muted">
        {label}
      </span>
      <div
        className="h-1.5 flex-1 overflow-hidden rounded-full bg-paper-3"
        role="meter"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={99}
        aria-label={`${label}: ${value}`}
      >
        <div
          className="h-full rounded-full bg-cobalt transition-[width] duration-500 [transition-timing-function:var(--ease-out-expo)]"
          style={{ width: `${Math.min(100, value)}%` }}
        />
      </div>
      <span className="w-8 text-right font-mono text-xs text-ink-2 tabular-nums">{value}</span>
    </div>
  );
}

interface ListSectionProps {
  tokenId: bigint;
  onSuccess: () => void;
}

function ListSection({ tokenId, onSuccess }: ListSectionProps) {
  const [priceInput, setPriceInput] = useState("");
  const [step, setStep] = useState<"approve" | "list">("approve");

  const priceUsdc: bigint | null = (() => {
    const n = parseFloat(priceInput);
    if (!isNaN(n) && n > 0) return toUsdc(priceInput);
    return null;
  })();

  const approveRequest = {
    address: ADDRESSES.CardNFT,
    abi: ABIS.CardNFT,
    functionName: "approve",
    args: [ADDRESSES.Marketplace, tokenId] as const,
  } as const;

  const listRequest = priceUsdc !== null
    ? {
        address: ADDRESSES.Marketplace,
        abi: ABIS.Marketplace,
        functionName: "list",
        args: [tokenId, priceUsdc] as const,
      } as const
    : null;

  return (
    <Panel variant="paper" className="flex flex-col gap-5 p-5">
      <div className="flex items-center gap-2">
        <span className="display text-lg text-ink">List for sale</span>
        <Pill tone="neutral">
          Step {step === "approve" ? "1" : "2"} of 2
        </Pill>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
          Price (USDC)
        </span>
        <input
          id="list-price"
          type="number"
          min="0.01"
          step="0.01"
          placeholder="e.g. 50.00"
          value={priceInput}
          onChange={(e) => setPriceInput(e.target.value)}
          className={cx(
            "w-44 rounded-sm border border-line-2 bg-paper-3 px-3 py-2 text-sm text-ink",
            "placeholder:text-muted focus:border-cobalt focus:outline-none focus:ring-2 focus:ring-cobalt/25",
            "transition-[border-color,box-shadow] duration-150",
          )}
        />
      </label>

      {step === "approve" ? (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-muted">
            Approve the Marketplace contract to transfer your card.
          </p>
          <TxButton
            request={approveRequest}
            label="Approve card"
            onSuccess={() => setStep("list")}
          />
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-muted">
            Create the listing on-chain at your requested price.
          </p>
          {listRequest !== null ? (
            <TxButton
              request={listRequest}
              label="List for sale"
              onSuccess={onSuccess}
            />
          ) : (
            <Pill tone="warn" className="self-start">Enter a valid price above before listing</Pill>
          )}
          <button
            type="button"
            onClick={() => setStep("approve")}
            className={buttonClasses("ghost", "sm")}
          >
            Back to approve
          </button>
        </div>
      )}
    </Panel>
  );
}

interface BuySectionProps {
  tokenId: bigint;
  price: bigint;
  onSuccess: () => void;
}

function BuySection({ tokenId, price, onSuccess }: BuySectionProps) {
  const [step, setStep] = useState<"approve" | "buy">("approve");

  const approveUsdcRequest = {
    address: ADDRESSES.MockUSDC,
    abi: ABIS.MockUSDC,
    functionName: "approve",
    args: [ADDRESSES.Marketplace, price] as const,
  } as const;

  const buyRequest = {
    address: ADDRESSES.Marketplace,
    abi: ABIS.Marketplace,
    functionName: "buy",
    args: [tokenId] as const,
  } as const;

  return (
    <Panel variant="ink" className="flex flex-col gap-5 p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-on-panel-muted">
            Listed price
          </p>
          <div className="display mt-0.5 text-3xl tabular-nums text-on-panel">
            {fmtUsdc(price)}
            <span className="ml-1 font-sans text-base font-semibold text-on-panel-muted">USDC</span>
          </div>
        </div>
        <Pill tone="neutral">
          Step {step === "approve" ? "1" : "2"} of 2
        </Pill>
      </div>

      <p className="text-xs text-on-panel-muted">
        4% platform fee + 1% to original first buyer applies on every sale (FR-M3).
      </p>

      {step === "approve" ? (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-on-panel-muted">
            Approve USDC spend so the Marketplace can take payment.
          </p>
          <TxButton
            request={approveUsdcRequest}
            label="Approve USDC"
            onSuccess={() => setStep("buy")}
          />
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-on-panel-muted">Complete the purchase on-chain.</p>
          <TxButton
            request={buyRequest}
            label="Buy card"
            onSuccess={onSuccess}
          />
          <button
            type="button"
            onClick={() => setStep("approve")}
            className={cx(buttonClasses("ghost", "sm"), "text-on-panel-muted hover:text-on-panel")}
          >
            Back to approve
          </button>
        </div>
      )}
    </Panel>
  );
}

interface CancelSectionProps {
  tokenId: bigint;
  onSuccess: () => void;
}

function CancelSection({ tokenId, onSuccess }: CancelSectionProps) {
  const cancelRequest = {
    address: ADDRESSES.Marketplace,
    abi: ABIS.Marketplace,
    functionName: "cancel",
    args: [tokenId] as const,
  } as const;

  return (
    <Panel variant="outline" className="flex flex-col gap-3 border-danger/35 p-5">
      <div>
        <p className="display text-lg text-danger">Cancel listing</p>
        <p className="mt-1 text-xs text-muted">
          Remove this card from the marketplace. It returns to your wallet.
        </p>
      </div>
      <TxButton
        request={cancelRequest}
        label="Cancel listing"
        onSuccess={onSuccess}
      />
    </Panel>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function MarketDetailPage({
  params,
}: {
  params: Promise<{ tokenId: string }>;
}) {
  // Next 16 — async params for client components via React.use()
  const { tokenId: tokenIdStr } = use(params);
  const tokenId = BigInt(tokenIdStr);

  const { wallets } = useWallets();
  const address = wallets[0]?.address as Address | undefined;

  const [data, setData] = useState<OnChainData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const [meta, stats, listing, rental] = await Promise.all([
          cardMeta(tokenId),
          cardStats(tokenId),
          marketListing(tokenId),
          rentalListing(tokenId).catch(() => null),
        ]);
        if (cancelled) return;
        const isListed = listing.price > 0n;
        setData({
          playerId: meta.playerId,
          tier: meta.tier,
          serial: meta.serial,
          mintBatch: meta.mintBatch,
          stats,
          seller: listing.seller as Address,
          price: listing.price,
          isListed,
          rentalActive: rental?.active ?? false,
        });
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [tokenIdStr, refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRefresh = () => setRefreshKey((k) => k + 1);

  // ── Loading state ────────────────────────────────────────────────────────
  if (loading) {
    return (
      <main className="flex max-w-3xl flex-col gap-8">
        <Link
          href="/market"
          className={cx(buttonClasses("ghost", "sm"), "self-start")}
        >
          ← Marketplace
        </Link>
        <div className="grid gap-8 sm:grid-cols-[auto_1fr]">
          <Skeleton className="h-64 w-48 rounded-card" />
          <div className="flex flex-col gap-4">
            <Skeleton className="h-8 w-48 rounded-sm" />
            <Skeleton className="h-4 w-64 rounded-sm" />
            <Skeleton className="h-32 w-full rounded-card" />
            <Skeleton className="h-24 w-full rounded-card" />
          </div>
        </div>
      </main>
    );
  }

  // ── Error state ──────────────────────────────────────────────────────────
  if (error) {
    return (
      <main className="flex max-w-3xl flex-col gap-6">
        <Link
          href="/market"
          className={cx(buttonClasses("ghost", "sm"), "self-start")}
        >
          ← Marketplace
        </Link>
        <div
          role="alert"
          className="flex items-start gap-3 rounded-card border border-danger/30 bg-danger/8 px-4 py-3 text-sm text-danger"
        >
          <span aria-hidden className="mt-0.5 shrink-0">!</span>
          {error}
        </div>
      </main>
    );
  }

  if (!data) return null;

  const player = PLAYER_BY_ID.get(data.playerId);
  const name = player?.name ?? `Player ${data.playerId.slice(0, 10)}…`;
  const tierLabel = TIER_NAME[data.tier];
  const traits = traitsOf(data.playerId);
  const tierId = data.tier as TierId;

  // Map nation/position to PlayerCard props
  const nation = (player?.nation ?? "FRA") as Nation;
  const position = (player?.position ?? "MID") as Position;

  const isOwner = address != null && address.toLowerCase() === data.seller.toLowerCase();
  const isBuyer = address != null && !isOwner;

  return (
    <main className="flex max-w-3xl flex-col gap-8">
      <Link
        href="/market"
        className={cx(buttonClasses("ghost", "sm"), "self-start")}
      >
        ← Marketplace
      </Link>

      {/* ── Two-column layout: card + detail panel ── */}
      <div className="grid gap-8 sm:grid-cols-[auto_1fr]">
        {/* Large card */}
        <div className="flex flex-col items-start gap-3">
          <PlayerCard
            name={name}
            nation={nation}
            position={position}
            tier={tierId}
            stats={data.stats}
            className="w-52"
          />
          {traits.length > 0 && (
            <div className="flex flex-wrap gap-1.5" aria-label="Player traits">
              {traits.map((t) => (
                <Pill key={t} tone="cobalt">{t}</Pill>
              ))}
            </div>
          )}
        </div>

        {/* Detail panel */}
        <div className="flex flex-col gap-5">
          {/* Identity row */}
          <div className="flex flex-wrap items-start gap-3">
            <div className="flex-1 min-w-0">
              <h1 className="display text-3xl text-ink">{name}</h1>
              <p className="mt-1 font-mono text-xs text-muted">
                Token #{tokenIdStr} · Serial {data.serial} · Batch {data.mintBatch}
              </p>
            </div>
            <TierBadge tier={tierId} />
          </div>

          {/* Stats */}
          <Panel variant="sunken" className="flex flex-col gap-3 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
              Attributes
            </p>
            <div className="flex flex-col gap-2.5">
              <StatRow label="Pace" value={data.stats.pace} />
              <StatRow label="Shooting" value={data.stats.shooting} />
              <StatRow label="Passing" value={data.stats.passing} />
              <StatRow label="Defense" value={data.stats.defense} />
              <StatRow label="Physical" value={data.stats.physical} />
            </div>
          </Panel>

          {/* On-chain metadata */}
          <Panel variant="paper" className="p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-muted">
              On-chain info
            </p>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
              <div>
                <dt className="text-muted">Seller</dt>
                <dd className="mt-0.5 truncate font-mono text-ink-2" title={data.seller}>
                  {data.seller.slice(0, 6)}…{data.seller.slice(-4)}
                </dd>
              </div>
              <div>
                <dt className="text-muted">Rental</dt>
                <dd className="mt-0.5">
                  {data.rentalActive ? (
                    <Pill tone="warn">Active rental</Pill>
                  ) : (
                    <span className="text-muted">Not listed</span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-muted">Listing status</dt>
                <dd className="mt-0.5">
                  {data.isListed ? (
                    <Pill tone="ok">Listed</Pill>
                  ) : (
                    <Pill tone="neutral">Unlisted</Pill>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-muted">Tier</dt>
                <dd className="mt-0.5 text-ink-2">{tierLabel}</dd>
              </div>
            </dl>
          </Panel>

          {/* ── Actions ── */}

          {/* Not connected: price info + prompt */}
          {!address && data.isListed && (
            <Panel variant="paper" className="flex items-center justify-between gap-4 p-4">
              <div>
                <p className="text-xs text-muted">Listed at</p>
                <p className="display text-2xl tabular-nums text-ink">
                  {fmtUsdc(data.price)}
                  <span className="ml-1 font-sans text-sm font-semibold text-muted">USDC</span>
                </p>
              </div>
              <p className="text-sm text-muted">Connect your wallet to buy.</p>
            </Panel>
          )}

          {!address && (
            <div
              role="status"
              className="rounded-card border border-warn/35 bg-warn/10 px-4 py-3 text-sm text-ink-2"
            >
              Connect your wallet to buy or list this card.
            </div>
          )}

          {/* Owner, not listed: show list form */}
          {address && !data.isListed && isOwner && (
            <ListSection tokenId={tokenId} onSuccess={handleRefresh} />
          )}

          {/* Owner, listed: show cancel */}
          {address && data.isListed && isOwner && (
            <CancelSection tokenId={tokenId} onSuccess={handleRefresh} />
          )}

          {/* Buyer: show buy flow */}
          {address && data.isListed && isBuyer && (
            <BuySection
              tokenId={tokenId}
              price={data.price}
              onSuccess={handleRefresh}
            />
          )}
        </div>
      </div>
    </main>
  );
}
