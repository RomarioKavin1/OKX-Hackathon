"use client";

/**
 * /packs — Pack shop: Bronze / Silver / Gold
 *
 * Flow per pack type:
 *   1. Display on-chain price + pull rates (from PACK_TIER_CUM constants).
 *   2. "Approve USDC" <TxButton> → MockUSDC.approve(PackSale, price).
 *   3. "Buy" <TxButton> → PackSale.buy(packType).
 *      onSuccess: decode the PackBought log from the receipt to extract commitId.
 *   4. Block countdown: poll current block vs commit.targetBlock.
 *      Enable "Reveal" once currentBlock >= targetBlock.
 *   5. "Reveal" <TxButton> → PackSale.reveal(commitId).
 *   6. Decode PackRevealed log → render <PackReveal tokenIds={...} />.
 */

import { useEffect, useState, useCallback } from "react";
import { useWallets } from "@privy-io/react-auth";
import type { Address, Hex } from "viem";
import { decodeEventLog } from "viem";
import { TxButton } from "@/components/TxButton";
import { PackReveal } from "@/components/PackReveal";
import { ADDRESSES, ABIS } from "@/lib/contracts";
import { publicClient } from "@/lib/clients";
import { packCommit, usdcAllowance } from "@/lib/actions/reads";
import { fmtUsdc } from "@/lib/business/format";
import { PACK_NAME, PACK_TIER_CUM, PACK_REVEAL_DELAY_BLOCKS } from "@/lib/constants";
import { Tier, TIER_NAME } from "@/lib/types";

// ── Types ─────────────────────────────────────────────────────────────────────

interface PendingCommit {
  commitId: bigint;
  targetBlock: bigint;
  packType: number;
}

interface RevealResult {
  tokenIds: bigint[];
}

// ── Constants ──────────────────────────────────────────────────────────────────

const PACK_TYPES = [0, 1, 2] as const;

/** Derive pull rates from cumulative thresholds (out of 10000). */
function pullRates(packType: number): Record<Tier, number> {
  const cum = PACK_TIER_CUM[packType];
  if (!cum) return { [Tier.Common]: 100, [Tier.Rare]: 0, [Tier.SuperRare]: 0, [Tier.Unique]: 0 };
  const [c, r, sr, u] = cum;
  return {
    [Tier.Common]:    c / 100,
    [Tier.Rare]:      (r - c) / 100,
    [Tier.SuperRare]: (sr - r) / 100,
    [Tier.Unique]:    (u - sr) / 100,
  };
}

const TIER_ORDER = [Tier.Common, Tier.Rare, Tier.SuperRare, Tier.Unique] as const;

// ── Module-scope sub-components ───────────────────────────────────────────────

interface PullRateBarProps {
  packType: number;
}

function PullRateBar({ packType }: PullRateBarProps) {
  const rates = pullRates(packType);
  return (
    <div className="mt-2 flex flex-col gap-1">
      {TIER_ORDER.map((tier) => {
        const pct = rates[tier];
        if (pct <= 0) return null;
        return (
          <div key={tier} className="flex items-center gap-2 text-xs">
            {/* Label + pattern (color-blind safe: uses label + width, not hue alone) */}
            <span className="w-20 text-right font-medium text-zinc-400">
              {TIER_NAME[tier]}
            </span>
            <div className="flex-1 rounded bg-zinc-700" aria-label={`${TIER_NAME[tier]} ${pct.toFixed(2)}%`}>
              <div
                className="h-2 rounded bg-emerald-500"
                style={{ width: `${Math.min(pct, 100)}%` }}
              />
            </div>
            <span className="w-14 text-zinc-300">{pct.toFixed(2)}%</span>
          </div>
        );
      })}
    </div>
  );
}

interface PackCardProps {
  packType: number;
  price: bigint | null;
  address: Address | undefined;
  onBuySuccess: (hash: Hex, packType: number) => void;
}

function PackCard({ packType, price, address, onBuySuccess }: PackCardProps) {
  const packName = PACK_NAME[packType] ?? `Pack ${packType}`;

  const approveRequest = price != null ? {
    address: ADDRESSES.MockUSDC,
    abi: ABIS.MockUSDC,
    functionName: "approve",
    args: [ADDRESSES.PackSale, price] as const,
  } as const : null;

  const buyRequest = {
    address: ADDRESSES.PackSale,
    abi: ABIS.PackSale,
    functionName: "buy",
    args: [packType] as const,
  } as const;

  const handleBuy = useCallback((hash: Hex) => {
    onBuySuccess(hash, packType);
  }, [onBuySuccess, packType]);

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">{packName} Pack</h2>
        <span className="rounded-full bg-zinc-100 px-3 py-0.5 text-sm font-medium text-zinc-700">
          {price != null ? `${fmtUsdc(price)} USDC` : "…"}
        </span>
      </div>

      {/* Pull rates */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
          Pull rates (5 cards)
        </p>
        <PullRateBar packType={packType} />
      </div>

      {/* Buy flow */}
      {!address ? (
        <p className="text-xs text-amber-700">Connect a wallet to buy packs.</p>
      ) : price == null ? (
        <p className="text-xs text-zinc-400">Loading price…</p>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-zinc-500">
            Step 1 — Approve <strong>{fmtUsdc(price)} USDC</strong> for PackSale
          </p>
          {approveRequest && (
            <TxButton
              request={approveRequest}
              label={`Approve ${fmtUsdc(price)} USDC`}
            />
          )}
          <p className="text-xs text-zinc-500">Step 2 — Buy pack</p>
          <TxButton
            request={buyRequest}
            label={`Buy ${packName} Pack`}
            onSuccess={handleBuy}
          />
        </div>
      )}
    </div>
  );
}

interface RevealSectionProps {
  commit: PendingCommit;
  onRevealSuccess: (hash: Hex) => void;
  onDismiss: () => void;
}

function RevealSection({ commit, onRevealSuccess, onDismiss }: RevealSectionProps) {
  const [currentBlock, setCurrentBlock] = useState<bigint | null>(null);

  // Poll current block every 3 s to drive countdown
  useEffect(() => {
    let cancelled = false;
    async function tick() {
      try {
        const n = await publicClient.getBlockNumber();
        if (!cancelled) setCurrentBlock(n);
      } catch {
        // ignore transient RPC errors
      }
    }
    void tick();
    const id = setInterval(() => void tick(), 3000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const blocksLeft =
    currentBlock != null
      ? Number(commit.targetBlock) - Number(currentBlock)
      : null;
  const canReveal = blocksLeft != null && blocksLeft <= 0;

  const revealRequest = {
    address: ADDRESSES.PackSale,
    abi: ABIS.PackSale,
    functionName: "reveal",
    args: [commit.commitId] as const,
  } as const;

  const handleReveal = useCallback(
    (hash: Hex) => onRevealSuccess(hash),
    [onRevealSuccess],
  );

  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5">
      <div className="mb-3 flex items-start justify-between gap-4">
        <div>
          <p className="font-semibold text-emerald-800">
            {PACK_NAME[commit.packType] ?? "Pack"} pack pending reveal
          </p>
          <p className="text-xs text-emerald-700 font-mono">
            Commit #{commit.commitId.toString()}
          </p>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="text-xs text-zinc-400 underline hover:text-zinc-600"
          aria-label="Dismiss this pending commit"
        >
          dismiss
        </button>
      </div>

      {!canReveal ? (
        <p className="mb-3 text-sm text-emerald-700">
          {blocksLeft != null
            ? `Waiting for ${PACK_REVEAL_DELAY_BLOCKS}-block commit delay… ${blocksLeft} block${blocksLeft !== 1 ? "s" : ""} left`
            : "Checking block height…"}
        </p>
      ) : (
        <p className="mb-3 text-sm font-medium text-emerald-800">
          Ready to reveal! Commit block reached.
        </p>
      )}

      <TxButton
        request={revealRequest}
        label="Reveal Pack"
        disabled={!canReveal}
        onSuccess={handleReveal}
      />
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Decode a `PackBought` event from a transaction receipt.
 * Returns the commitId emitted in the log, or null if not found.
 */
async function extractCommitIdFromHash(hash: Hex): Promise<bigint | null> {
  try {
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    for (const log of receipt.logs) {
      try {
        const decoded = decodeEventLog({
          abi: ABIS.PackSale,
          data: log.data,
          topics: log.topics,
          eventName: "PackBought",
        });
        return decoded.args.commitId as bigint;
      } catch {
        // not a PackBought log — continue
      }
    }
  } catch {
    // receipt fetch failed
  }
  return null;
}

/**
 * Decode a `PackRevealed` event from a transaction receipt.
 * Returns the tokenIds array, or null if not found.
 */
async function extractTokenIdsFromHash(hash: Hex): Promise<bigint[] | null> {
  try {
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    for (const log of receipt.logs) {
      try {
        const decoded = decodeEventLog({
          abi: ABIS.PackSale,
          data: log.data,
          topics: log.topics,
          eventName: "PackRevealed",
        });
        return decoded.args.tokenIds as bigint[];
      } catch {
        // not a PackRevealed log — continue
      }
    }
  } catch {
    // receipt fetch failed
  }
  return null;
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function PacksPage() {
  const { wallets } = useWallets();
  const address = wallets[0]?.address as Address | undefined;

  // On-chain prices per pack type
  const [prices, setPrices] = useState<Record<number, bigint | null>>({
    0: null, 1: null, 2: null,
  });

  // Active pending commit (after buy, before reveal)
  const [pendingCommit, setPendingCommit] = useState<PendingCommit | null>(null);

  // Reveal result (after reveal tx)
  const [revealResult, setRevealResult] = useState<RevealResult | null>(null);

  // Allowance (for informational display)
  const [allowance, setAllowance] = useState<bigint | null>(null);

  // ── Load on-chain prices ────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    async function loadPrices() {
      const results = await Promise.allSettled(
        PACK_TYPES.map((packType) =>
          publicClient.readContract({
            address: ADDRESSES.PackSale,
            abi: ABIS.PackSale,
            functionName: "packPrice",
            args: [packType],
          }),
        ),
      );
      if (cancelled) return;
      setPrices({
        0: results[0].status === "fulfilled" ? (results[0].value as bigint) : null,
        1: results[1].status === "fulfilled" ? (results[1].value as bigint) : null,
        2: results[2].status === "fulfilled" ? (results[2].value as bigint) : null,
      });
    }
    void loadPrices();
    return () => { cancelled = true; };
  }, []);

  // ── Load allowance whenever address changes ─────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!address) {
        if (!cancelled) setAllowance(null);
        return;
      }
      try {
        const v = await usdcAllowance(address, ADDRESSES.PackSale);
        if (!cancelled) setAllowance(v);
      } catch {
        // ignore transient RPC errors
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [address]);

  // ── Buy success: decode commitId from receipt, load targetBlock ─────────────
  const handleBuySuccess = useCallback(async (hash: Hex, packType: number) => {
    const commitId = await extractCommitIdFromHash(hash);
    if (!commitId) return; // should not happen
    try {
      const { targetBlock } = await packCommit(commitId);
      setPendingCommit({ commitId, targetBlock, packType });
    } catch {
      // fallback: set targetBlock = commitId's block + delay (best-effort)
      const receipt = await publicClient.waitForTransactionReceipt({ hash }).catch(() => null);
      const buyBlock = receipt?.blockNumber ?? 0n;
      setPendingCommit({
        commitId,
        targetBlock: buyBlock + BigInt(PACK_REVEAL_DELAY_BLOCKS),
        packType,
      });
    }
  }, []);

  // ── Reveal success: decode tokenIds, show PackReveal overlay ───────────────
  const handleRevealSuccess = useCallback(async (hash: Hex) => {
    const tokenIds = await extractTokenIdsFromHash(hash);
    if (tokenIds) {
      setRevealResult({ tokenIds });
    }
    setPendingCommit(null);
  }, []);

  const handleDismissReveal = useCallback(() => {
    setRevealResult(null);
  }, []);

  const handleDismissCommit = useCallback(() => {
    setPendingCommit(null);
  }, []);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      {/* PackReveal overlay */}
      {revealResult && (
        <PackReveal
          tokenIds={revealResult.tokenIds}
          onDismiss={handleDismissReveal}
        />
      )}

      <main className="flex max-w-4xl flex-col gap-6">
        <header>
          <h1 className="text-2xl font-bold">Packs</h1>
          <p className="text-sm opacity-70">
            Buy a pack, wait {PACK_REVEAL_DELAY_BLOCKS} blocks, then reveal 5 random cards.
          </p>
        </header>

        {/* USDC allowance info */}
        {address && allowance != null && allowance > 0n && (
          <p className="text-xs text-zinc-500">
            Current PackSale allowance: <strong>{fmtUsdc(allowance)} USDC</strong>
          </p>
        )}

        {/* Pending reveal section */}
        {pendingCommit && (
          <RevealSection
            commit={pendingCommit}
            onRevealSuccess={handleRevealSuccess}
            onDismiss={handleDismissCommit}
          />
        )}

        {/* Pack cards grid */}
        <section
          className="grid grid-cols-1 gap-5 sm:grid-cols-3"
          aria-label="Available packs"
        >
          {PACK_TYPES.map((packType) => (
            <PackCard
              key={packType}
              packType={packType}
              price={prices[packType]}
              address={address}
              onBuySuccess={handleBuySuccess}
            />
          ))}
        </section>

        {/* Transparency note */}
        <p className="text-xs text-zinc-400">
          Pull rates are derived from on-chain{" "}
          <code className="font-mono">tierCum</code> values stored in the PackSale
          contract and mirror the constants in <code>lib/constants.ts</code>.
          Randomness is committed at buy-time and resolved {PACK_REVEAL_DELAY_BLOCKS}{" "}
          blocks later using the block hash.
        </p>
      </main>
    </>
  );
}
