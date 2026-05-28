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

// ── Module-scope sub-components ───────────────────────────────────────────────

interface StatRowProps {
  label: string;
  value: number;
}

function StatRow({ label, value }: StatRowProps) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-20 text-xs font-medium text-zinc-500">{label}</span>
      <div className="flex-1 rounded-full bg-zinc-100">
        <div
          className="h-2 rounded-full bg-emerald-500"
          style={{ width: `${Math.min(100, value)}%` }}
        />
      </div>
      <span className="w-8 text-right text-xs font-mono text-zinc-700">{value}</span>
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
    <div className="flex flex-col gap-4 rounded-lg border border-zinc-200 bg-zinc-50 p-4">
      <h3 className="font-semibold text-zinc-800">List for sale</h3>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-zinc-600" htmlFor="list-price">
          Price (USDC)
        </label>
        <input
          id="list-price"
          type="number"
          min="0.01"
          step="0.01"
          placeholder="e.g. 50.00"
          value={priceInput}
          onChange={(e) => setPriceInput(e.target.value)}
          className="w-40 rounded border border-zinc-300 bg-white px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400"
        />
      </div>

      {/* Step 1: approve card */}
      {step === "approve" && (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-zinc-500">
            Step 1 of 2 — Approve the Marketplace to transfer your card.
          </p>
          <TxButton
            request={approveRequest}
            label="Approve card"
            onSuccess={() => setStep("list")}
          />
        </div>
      )}

      {/* Step 2: list */}
      {step === "list" && (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-zinc-500">
            Step 2 of 2 — Create the listing on-chain.
          </p>
          {listRequest !== null ? (
            <TxButton
              request={listRequest}
              label="List for sale"
              onSuccess={onSuccess}
            />
          ) : (
            <p className="text-xs text-amber-700">Enter a valid price above before listing.</p>
          )}
          <button
            type="button"
            onClick={() => setStep("approve")}
            className="w-fit text-xs underline opacity-60 hover:opacity-80"
          >
            ← Back to approve
          </button>
        </div>
      )}
    </div>
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
    <div className="flex flex-col gap-4 rounded-lg border border-zinc-200 bg-zinc-50 p-4">
      <h3 className="font-semibold text-zinc-800">Buy this card</h3>
      <p className="text-sm">
        Price: <strong className="text-emerald-700">{fmtUsdc(price)} USDC</strong>
      </p>

      <p className="text-xs text-zinc-500">
        Royalty note (FR-M3): 4% platform fee + 1% to the original first buyer applies on every
        sale.
      </p>

      {step === "approve" && (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-zinc-500">
            Step 1 of 2 — Approve USDC spend for the Marketplace.
          </p>
          <TxButton
            request={approveUsdcRequest}
            label="Approve USDC"
            onSuccess={() => setStep("buy")}
          />
        </div>
      )}

      {step === "buy" && (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-zinc-500">Step 2 of 2 — Complete the purchase on-chain.</p>
          <TxButton
            request={buyRequest}
            label="Buy card"
            onSuccess={onSuccess}
          />
          <button
            type="button"
            onClick={() => setStep("approve")}
            className="w-fit text-xs underline opacity-60 hover:opacity-80"
          >
            ← Back to approve
          </button>
        </div>
      )}
    </div>
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
    <div className="flex flex-col gap-2 rounded-lg border border-red-100 bg-red-50 p-4">
      <h3 className="font-semibold text-red-800">Cancel listing</h3>
      <p className="text-xs text-red-700">Remove this card from the marketplace. The card returns to your wallet.</p>
      <TxButton
        request={cancelRequest}
        label="Cancel listing"
        onSuccess={onSuccess}
      />
    </div>
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

  if (loading) {
    return (
      <main className="flex max-w-xl flex-col gap-4">
        <p className="opacity-60">Loading card data…</p>
      </main>
    );
  }

  if (error) {
    return (
      <main className="flex max-w-xl flex-col gap-4">
        <Link href="/market" className="text-sm underline opacity-70">
          ← Back to marketplace
        </Link>
        <p className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      </main>
    );
  }

  if (!data) return null;

  const player = PLAYER_BY_ID.get(data.playerId);
  const name = player?.name ?? `Player ${data.playerId.slice(0, 10)}…`;
  const tierLabel = TIER_NAME[data.tier];
  const traits = traitsOf(data.playerId);

  const isOwner = address != null && address.toLowerCase() === data.seller.toLowerCase();
  const isBuyer = address != null && !isOwner;

  return (
    <main className="flex max-w-2xl flex-col gap-6">
      <Link href="/market" className="text-sm underline opacity-70">
        ← Back to marketplace
      </Link>

      {/* Card header */}
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">{name}</h1>
          <p className="text-sm text-zinc-500">
            Token #{tokenIdStr} · Serial {data.serial} · Batch {data.mintBatch}
          </p>
        </div>
        <span className="rounded bg-zinc-100 px-3 py-1 text-sm font-semibold text-zinc-700">
          {tierLabel}
        </span>
      </header>

      {/* Stats */}
      <section className="rounded-lg border border-zinc-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-zinc-700">Stats</h2>
        <div className="flex flex-col gap-2">
          <StatRow label="Pace" value={data.stats.pace} />
          <StatRow label="Shooting" value={data.stats.shooting} />
          <StatRow label="Passing" value={data.stats.passing} />
          <StatRow label="Defense" value={data.stats.defense} />
          <StatRow label="Physical" value={data.stats.physical} />
        </div>
      </section>

      {/* Traits */}
      {traits.length > 0 && (
        <section className="flex gap-2">
          {traits.map((t) => (
            <span
              key={t}
              className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-800"
            >
              {t}
            </span>
          ))}
        </section>
      )}

      {/* Rental availability */}
      <section className="rounded-lg border border-zinc-200 bg-white p-4">
        <h2 className="mb-1 text-sm font-semibold text-zinc-700">Rental status</h2>
        {data.rentalActive ? (
          <p className="text-sm text-amber-700">
            This card is currently listed for rent on the rental market.
          </p>
        ) : (
          <p className="text-sm text-zinc-500">Not available for rent.</p>
        )}
      </section>

      {/* Listing / buy actions */}
      {!address && (
        <p className="rounded border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Connect your wallet to buy or list this card.
        </p>
      )}

      {address && !data.isListed && isOwner && (
        <ListSection tokenId={tokenId} onSuccess={handleRefresh} />
      )}

      {address && data.isListed && isOwner && (
        <CancelSection tokenId={tokenId} onSuccess={handleRefresh} />
      )}

      {address && data.isListed && isBuyer && (
        <BuySection
          tokenId={tokenId}
          price={data.price}
          onSuccess={handleRefresh}
        />
      )}

      {data.isListed && !address && (
        <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4">
          <p className="text-sm">
            Listed for{" "}
            <strong className="text-emerald-700">{fmtUsdc(data.price)} USDC</strong>
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            Royalty note (FR-M3): 4% platform fee + 1% to original first buyer on every sale.
          </p>
        </div>
      )}
    </main>
  );
}
