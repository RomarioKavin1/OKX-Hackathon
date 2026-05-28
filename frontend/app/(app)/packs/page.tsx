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
import {
  Panel,
  Pill,
  SectionHeading,
  Skeleton,
  cx,
} from "@/components/ui";

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

/** Rarity tone per tier — matches TIER_META in ui.tsx */
const TIER_PILL_TONE = {
  [Tier.Common]:    "neutral",
  [Tier.Rare]:      "cobalt",
  [Tier.SuperRare]: "violet",
  [Tier.Unique]:    "gold",
} as const;

/**
 * Visual identity per pack tier:
 * Bronze = warm/muted, Silver = cobalt, Gold = gold + foil accent
 */
const PACK_ACCENT = {
  0: { kicker: "BRONZE",  tone: "neutral" as const, foil: false },
  1: { kicker: "SILVER",  tone: "cobalt"  as const, foil: false },
  2: { kicker: "GOLD",    tone: "gold"    as const, foil: true  },
} as const;

// ── Module-scope sub-components ───────────────────────────────────────────────

interface OddsRowProps {
  tier: Tier;
  pct: number;
}

function OddsRow({ tier, pct }: OddsRowProps) {
  return (
    <div className="flex items-center gap-3">
      <Pill tone={TIER_PILL_TONE[tier]} className="w-24 justify-center shrink-0">
        {tier === Tier.Unique && <span aria-hidden>✦</span>}
        {TIER_NAME[tier]}
      </Pill>
      <div
        className="relative h-1.5 flex-1 rounded-full bg-paper-3 overflow-hidden"
        role="presentation"
      >
        <div
          className={cx(
            "absolute inset-y-0 left-0 rounded-full",
            tier === Tier.Unique
              ? "bg-gold"
              : tier === Tier.SuperRare
              ? "bg-violet"
              : tier === Tier.Rare
              ? "bg-cobalt"
              : "bg-muted",
          )}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
      <span
        className="w-12 text-right text-xs tabular-nums text-muted"
        aria-label={`${TIER_NAME[tier]} pull rate: ${pct.toFixed(2)} percent`}
      >
        {pct.toFixed(2)}%
      </span>
    </div>
  );
}

interface PackCardProps {
  packType: 0 | 1 | 2;
  price: bigint | null;
  address: Address | undefined;
  onBuySuccess: (hash: Hex, packType: number) => void;
}

function PackCard({ packType, price, address, onBuySuccess }: PackCardProps) {
  const packName = PACK_NAME[packType] ?? `Pack ${packType}`;
  const accent = PACK_ACCENT[packType];
  const rates = pullRates(packType);

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
    <Panel
      variant="paper"
      className={cx(
        "relative flex flex-col gap-5 overflow-hidden p-5 transition-[transform,box-shadow] duration-200 [transition-timing-function:var(--ease-out-expo)] hover:-translate-y-0.5 hover:shadow-lift",
        accent.foil && "foil-sheen",
      )}
    >
      {/* Gold pack: foil accent strip across the top edge */}
      {accent.foil && (
        <div aria-hidden className="foil absolute inset-x-0 top-0 h-1 opacity-80" />
      )}

      {/* Pack header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <p
            className={cx(
              "mb-1 text-xs font-semibold uppercase tracking-[0.18em]",
              accent.tone === "gold"
                ? "text-gold"
                : accent.tone === "cobalt"
                ? "text-cobalt-ink"
                : "text-muted",
            )}
          >
            {accent.kicker}
          </p>
          <h2
            className="display text-3xl text-ink"
            aria-label={`${packName} Pack`}
          >
            {packName}
          </h2>
        </div>

        {/* Price badge */}
        <div className="mt-1 shrink-0">
          {price != null ? (
            <span className="display text-xl text-ink tabular-nums">
              {fmtUsdc(price)}{" "}
              <span className="text-sm font-[var(--font-sans)] tracking-normal text-muted">USDC</span>
            </span>
          ) : (
            <Skeleton className="h-7 w-20" />
          )}
        </div>
      </div>

      {/* Pull-rate odds */}
      <section aria-label={`${packName} pack pull rates`}>
        <p className="mb-2.5 text-xs font-semibold uppercase tracking-[0.15em] text-muted">
          5-card pull rates
        </p>
        <div className="flex flex-col gap-2">
          {TIER_ORDER.map((tier) => {
            const pct = rates[tier];
            if (pct <= 0) return null;
            return <OddsRow key={tier} tier={tier} pct={pct} />;
          })}
        </div>
      </section>

      {/* Divider */}
      <hr className="border-line" />

      {/* Buy flow */}
      <div className="flex flex-col gap-2">
        {!address ? (
          <p className="text-xs text-warn">Connect a wallet to buy packs.</p>
        ) : price == null ? (
          <p className="text-xs text-muted">Loading price...</p>
        ) : (
          <>
            <p className="text-xs text-muted">
              Step 1 — Approve <strong className="text-ink">{fmtUsdc(price)} USDC</strong> for PackSale
            </p>
            {approveRequest && (
              <TxButton
                request={approveRequest}
                label={`Approve ${fmtUsdc(price)} USDC`}
              />
            )}
            <p className="text-xs text-muted">Step 2 — Buy pack</p>
            <TxButton
              request={buyRequest}
              label={`Buy ${packName} Pack`}
              onSuccess={handleBuy}
            />
          </>
        )}
      </div>
    </Panel>
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
    <Panel variant="ink" className="p-5">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-on-panel-muted">
            Pending reveal
          </p>
          <p className="display mt-1 text-xl text-on-panel">
            {PACK_NAME[commit.packType] ?? "Pack"} Pack
          </p>
          <p className="mt-0.5 font-mono text-xs text-on-panel-muted">
            Commit #{commit.commitId.toString()}
          </p>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="text-xs text-on-panel-muted underline underline-offset-2 hover:text-on-panel focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt"
          aria-label="Dismiss this pending commit"
        >
          dismiss
        </button>
      </div>

      {!canReveal ? (
        <p className="mb-4 text-sm text-on-panel-muted">
          {blocksLeft != null
            ? `Waiting for ${PACK_REVEAL_DELAY_BLOCKS}-block commit delay... ${blocksLeft} block${blocksLeft !== 1 ? "s" : ""} left`
            : "Checking block height..."}
        </p>
      ) : (
        <p className="mb-4 text-sm font-semibold text-ok">
          Commit block reached. Ready to reveal.
        </p>
      )}

      <TxButton
        request={revealRequest}
        label="Reveal Pack"
        disabled={!canReveal}
        onSuccess={handleReveal}
      />
    </Panel>
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

      <main className="flex max-w-4xl flex-col gap-8">
        {/* Page header */}
        <SectionHeading
          kicker="Collector shop"
          title="Packs"
        />

        {/* Subhead + context strip */}
        <Panel variant="sunken" className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-ink-2">
            Buy a pack, wait {PACK_REVEAL_DELAY_BLOCKS} blocks, then reveal 5 random cards.
          </p>
          {address && allowance != null && allowance > 0n && (
            <p className="text-xs text-muted">
              PackSale allowance: <span className="font-semibold text-ink">{fmtUsdc(allowance)} USDC</span>
            </p>
          )}
        </Panel>

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

        {/* Transparency footnote */}
        <p className="text-xs text-muted">
          Pull rates are derived from on-chain{" "}
          <code className="font-mono text-ink-2">tierCum</code> values stored in the PackSale
          contract and mirror the constants in <code className="font-mono text-ink-2">lib/constants.ts</code>.
          Randomness is committed at buy-time and resolved {PACK_REVEAL_DELAY_BLOCKS}{" "}
          blocks later using the block hash.
        </p>
      </main>
    </>
  );
}
