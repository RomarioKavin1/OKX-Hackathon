"use client";

/**
 * RentalActions — per-card action buttons for the /rentals page.
 *
 * Exported components (all module-scope, no inline component creation):
 *   ListForRentPanel   — owner lists a card (3 modes: Fixed / FloorPegged / Suggested)
 *   AutoListPanel      — owner toggles FloorPegged auto-listing + setFloorPrice control
 *   RentPanel          — renter approves USDC then rents for a matchday
 *   SettlePanel        — owner settles post-lock
 *   CancelPanel        — renter cancels pre-lock (shows 90% refund)
 *   PostponeRefundPanel — renter claims refund when a matchday is postponed
 *
 * All write interactions go through TxButton (preflight → confirm → mine).
 */

import { useState } from "react";
import type { Hex } from "viem";
import { TxButton } from "@/components/TxButton";
import { ADDRESSES, ABIS } from "@/lib/contracts";
import { RENTAL_SPLIT, BPS_DENOMINATOR } from "@/lib/constants";
import { PricingMode } from "@/lib/types";
import { toUsdc, fmtUsdc } from "@/lib/business/format";

// ── Shared label helpers ──────────────────────────────────────────────────────

const MODE_LABELS: Record<number, string> = {
  [PricingMode.Fixed]: "Fixed Fee",
  [PricingMode.FloorPegged]: "Floor-Pegged (bps)",
  [PricingMode.Suggested]: "Suggested",
};

// ── Section wrapper ───────────────────────────────────────────────────────────

interface SectionProps {
  title: string;
  children: React.ReactNode;
}

function Section({ title, children }: SectionProps) {
  return (
    <div className="rounded border border-zinc-200 bg-zinc-50 p-4">
      <h3 className="mb-3 text-sm font-semibold text-zinc-700">{title}</h3>
      {children}
    </div>
  );
}

// ── Inline field ─────────────────────────────────────────────────────────────

interface FieldProps {
  label: string;
  children: React.ReactNode;
}

function Field({ label, children }: FieldProps) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-zinc-500">{label}</span>
      {children}
    </label>
  );
}

// ── ListForRentPanel ──────────────────────────────────────────────────────────

export interface ListForRentPanelProps {
  tokenId: bigint;
  onSuccess?: (hash: Hex) => void;
}

export function ListForRentPanel({ tokenId, onSuccess }: ListForRentPanelProps) {
  const [mode, setMode] = useState<number>(PricingMode.Fixed);
  // For Fixed/Suggested: human USDC string; for FloorPegged: basis-points string
  const [priceInput, setPriceInput] = useState<string>("1");

  // Derive the on-chain priceValue from the inputs
  function buildPriceValue(): bigint | null {
    const trimmed = priceInput.trim();
    if (!trimmed || !/^\d+(\.\d+)?$/.test(trimmed)) return null;
    if (mode === PricingMode.FloorPegged) {
      // priceValue is bps (integer)
      const bps = parseInt(trimmed, 10);
      if (isNaN(bps) || bps <= 0 || bps > 10000) return null;
      return BigInt(bps);
    }
    // Fixed / Suggested: priceValue is USDC with 6 dp
    try {
      return toUsdc(trimmed);
    } catch {
      return null;
    }
  }

  const priceValue = buildPriceValue();
  const isValid = priceValue !== null;

  const request = isValid
    ? {
        address: ADDRESSES.RentalMarket,
        abi: ABIS.RentalMarket,
        functionName: "listForRent",
        // args: [tokenId (uint256), mode (uint8), priceValue (uint256)]
        args: [tokenId, mode, priceValue] as const,
      }
    : null;

  return (
    <Section title="List for Rent">
      <div className="flex flex-col gap-3">
        <Field label="Pricing mode">
          <select
            className="rounded border border-zinc-300 bg-white px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400"
            value={mode}
            onChange={(e) => {
              setMode(Number(e.target.value));
              setPriceInput(
                Number(e.target.value) === PricingMode.FloorPegged ? "10000" : "1"
              );
            }}
          >
            {Object.entries(MODE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Field>

        <Field
          label={
            mode === PricingMode.FloorPegged
              ? "Basis points of floor (e.g. 10000 = 100%)"
              : "Price (USDC)"
          }
        >
          <input
            type="number"
            min={mode === PricingMode.FloorPegged ? "1" : "0"}
            max={mode === PricingMode.FloorPegged ? "10000" : undefined}
            step={mode === PricingMode.FloorPegged ? "1" : "0.01"}
            className="rounded border border-zinc-300 bg-white px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400"
            value={priceInput}
            onChange={(e) => setPriceInput(e.target.value)}
          />
        </Field>

        {!isValid && (
          <p className="text-xs text-red-600">Enter a valid price to enable simulation.</p>
        )}

        {request && (
          <TxButton
            request={request}
            label="List for Rent"
            disabled={!isValid}
            onSuccess={onSuccess}
          />
        )}
      </div>
    </Section>
  );
}

// ── AutoListPanel (FR-R5) ─────────────────────────────────────────────────────

export interface AutoListPanelProps {
  tokenId: bigint;
  playerId: Hex;
  tier: number;
  /** Whether a FloorPegged listing is currently active */
  isAutoListed: boolean;
  onSuccess?: (hash: Hex) => void;
}

export function AutoListPanel({
  tokenId,
  playerId,
  tier,
  isAutoListed,
  onSuccess,
}: AutoListPanelProps) {
  const [floorInput, setFloorInput] = useState<string>("1");

  function buildFloor(): bigint | null {
    const trimmed = floorInput.trim();
    if (!trimmed || !/^\d+(\.\d+)?$/.test(trimmed)) return null;
    try {
      return toUsdc(trimmed);
    } catch {
      return null;
    }
  }

  const floorPrice = buildFloor();
  const floorValid = floorPrice !== null;

  // setFloorPrice(player bytes32, tier uint8, price uint256)
  const setFloorRequest = floorValid
    ? {
        address: ADDRESSES.RentalMarket,
        abi: ABIS.RentalMarket,
        functionName: "setFloorPrice",
        args: [playerId, tier, floorPrice] as const,
      }
    : null;

  // listForRent with FloorPegged at 10000 bps (= 100% of floor) to enable auto-listing
  const autoListRequest = {
    address: ADDRESSES.RentalMarket,
    abi: ABIS.RentalMarket,
    functionName: "listForRent",
    // mode 1 = FloorPegged; priceValue = 10000 bps = 100% of floor
    args: [tokenId, PricingMode.FloorPegged, 10000n] as const,
  };

  // delistRental stops auto-listing
  const delistRequest = {
    address: ADDRESSES.RentalMarket,
    abi: ABIS.RentalMarket,
    functionName: "delist",
    args: [tokenId] as const,
  };

  return (
    <Section title="Auto-list at Floor (FR-R5)">
      <div className="flex flex-col gap-3">
        <p className="text-xs text-zinc-500">
          A FloorPegged listing at 100% automatically prices to the on-chain floor. Update the
          floor price below or stop auto-listing at any time.
        </p>

        {/* Set floor price */}
        <Field label="Floor price (USDC)">
          <input
            type="number"
            min="0"
            step="0.01"
            className="rounded border border-zinc-300 bg-white px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400"
            value={floorInput}
            onChange={(e) => setFloorInput(e.target.value)}
          />
        </Field>

        {!floorValid && (
          <p className="text-xs text-red-600">Enter a valid floor price to update.</p>
        )}

        {setFloorRequest && (
          <TxButton
            request={setFloorRequest}
            label="Set Floor Price"
            disabled={!floorValid}
            onSuccess={onSuccess}
          />
        )}

        {/* Enable / disable auto-listing */}
        {!isAutoListed ? (
          <TxButton
            request={autoListRequest}
            label="Enable Auto-list at Floor"
            onSuccess={onSuccess}
          />
        ) : (
          <TxButton
            request={delistRequest}
            label="Stop Auto-listing"
            onSuccess={onSuccess}
          />
        )}
      </div>
    </Section>
  );
}

// ── RentPanel ─────────────────────────────────────────────────────────────────

export interface RentPanelProps {
  tokenId: bigint;
  /** Resolved USDC price (6dp) */
  resolvedPrice: bigint;
  onSuccess?: (hash: Hex) => void;
}

export function RentPanel({ tokenId, resolvedPrice, onSuccess }: RentPanelProps) {
  const [matchday, setMatchday] = useState<number>(1);

  // Step 1: approve USDC for RentalMarket to pull
  const approveRequest = {
    address: ADDRESSES.MockUSDC,
    abi: ABIS.MockUSDC,
    functionName: "approve",
    args: [ADDRESSES.RentalMarket, resolvedPrice] as const,
  };

  // Step 2: rent(tokenId, matchday) — note: matchday is BigInt in the ABI
  const rentRequest = {
    address: ADDRESSES.RentalMarket,
    abi: ABIS.RentalMarket,
    functionName: "rent",
    args: [tokenId, BigInt(matchday)] as const,
  };

  return (
    <Section title="Rent this Card">
      <div className="flex flex-col gap-3">
        <p className="text-sm">
          Rental cost:{" "}
          <span className="font-medium">{fmtUsdc(resolvedPrice)} USDC</span>
        </p>

        <Field label="Matchday">
          <select
            className="rounded border border-zinc-300 bg-white px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400"
            value={matchday}
            onChange={(e) => setMatchday(Number(e.target.value))}
          >
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((d) => (
              <option key={d} value={d}>
                Matchday {d}
              </option>
            ))}
          </select>
        </Field>

        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium text-zinc-500">Step 1 — Approve USDC</p>
          <TxButton
            request={approveRequest}
            label={`Approve ${fmtUsdc(resolvedPrice)} USDC`}
            onSuccess={() => undefined}
          />
        </div>

        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium text-zinc-500">Step 2 — Rent Card</p>
          <TxButton
            request={rentRequest}
            label={`Rent for Matchday ${matchday}`}
            onSuccess={onSuccess}
          />
        </div>
      </div>
    </Section>
  );
}

// ── SettlePanel ───────────────────────────────────────────────────────────────

export interface SettlePanelProps {
  tokenId: bigint;
  /** The paid amount (6dp USDC) so we can show the split */
  paid: bigint;
  onSuccess?: (hash: Hex) => void;
}

export function SettlePanel({ tokenId, paid, onSuccess }: SettlePanelProps) {
  const [matchday, setMatchday] = useState<number>(1);

  const ownerShare = (paid * RENTAL_SPLIT.ownerBps) / BPS_DENOMINATOR;
  const platformShare = (paid * RENTAL_SPLIT.platformBps) / BPS_DENOMINATOR;
  const originalBuyerShare = (paid * RENTAL_SPLIT.originalBuyerBps) / BPS_DENOMINATOR;

  const settleRequest = {
    address: ADDRESSES.RentalMarket,
    abi: ABIS.RentalMarket,
    functionName: "settle",
    args: [tokenId, BigInt(matchday)] as const,
  };

  return (
    <Section title="Settle Rental">
      <div className="flex flex-col gap-3">
        <p className="text-xs text-zinc-500">
          88 / 10 / 2 split: owner{" "}
          <span className="font-medium">{fmtUsdc(ownerShare)}</span> / platform{" "}
          <span className="font-medium">{fmtUsdc(platformShare)}</span> / original buyer{" "}
          <span className="font-medium">{fmtUsdc(originalBuyerShare)}</span> USDC
        </p>

        <Field label="Matchday">
          <select
            className="rounded border border-zinc-300 bg-white px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400"
            value={matchday}
            onChange={(e) => setMatchday(Number(e.target.value))}
          >
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((d) => (
              <option key={d} value={d}>
                Matchday {d}
              </option>
            ))}
          </select>
        </Field>

        <TxButton
          request={settleRequest}
          label={`Settle — Matchday ${matchday}`}
          onSuccess={onSuccess}
        />
      </div>
    </Section>
  );
}

// ── CancelPanel ───────────────────────────────────────────────────────────────

export interface CancelPanelProps {
  tokenId: bigint;
  paid: bigint;
  onSuccess?: (hash: Hex) => void;
}

export function CancelPanel({ tokenId, paid, onSuccess }: CancelPanelProps) {
  const [matchday, setMatchday] = useState<number>(1);

  const refundAmount = (paid * RENTAL_SPLIT.cancelRefundBps) / BPS_DENOMINATOR;

  const cancelRequest = {
    address: ADDRESSES.RentalMarket,
    abi: ABIS.RentalMarket,
    functionName: "cancel",
    args: [tokenId, BigInt(matchday)] as const,
  };

  return (
    <Section title="Cancel Rental (Pre-lock)">
      <div className="flex flex-col gap-3">
        <p className="text-xs text-zinc-500">
          You will receive a 90% refund:{" "}
          <span className="font-medium">{fmtUsdc(refundAmount)} USDC</span>
        </p>

        <Field label="Matchday">
          <select
            className="rounded border border-zinc-300 bg-white px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400"
            value={matchday}
            onChange={(e) => setMatchday(Number(e.target.value))}
          >
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((d) => (
              <option key={d} value={d}>
                Matchday {d}
              </option>
            ))}
          </select>
        </Field>

        <TxButton
          request={cancelRequest}
          label={`Cancel — Matchday ${matchday}`}
          onSuccess={onSuccess}
        />
      </div>
    </Section>
  );
}

// ── PostponeRefundPanel (FR-R7) ───────────────────────────────────────────────

export interface PostponeRefundPanelProps {
  tokenId: bigint;
  onSuccess?: (hash: Hex) => void;
}

export function PostponeRefundPanel({ tokenId, onSuccess }: PostponeRefundPanelProps) {
  const [matchday, setMatchday] = useState<number>(1);

  // refundPostponed(tokenId uint256, matchday uint256)
  const refundRequest = {
    address: ADDRESSES.RentalMarket,
    abi: ABIS.RentalMarket,
    functionName: "refundPostponed",
    args: [tokenId, BigInt(matchday)] as const,
  };

  return (
    <Section title="Refund (Match Postponed — FR-R7)">
      <div className="flex flex-col gap-3">
        <p className="text-xs text-zinc-500">
          If the matchday was officially postponed, claim a full rental refund.
        </p>

        <Field label="Matchday">
          <select
            className="rounded border border-zinc-300 bg-white px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400"
            value={matchday}
            onChange={(e) => setMatchday(Number(e.target.value))}
          >
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((d) => (
              <option key={d} value={d}>
                Matchday {d}
              </option>
            ))}
          </select>
        </Field>

        <TxButton
          request={refundRequest}
          label={`Refund — Matchday ${matchday}`}
          onSuccess={onSuccess}
        />
      </div>
    </Section>
  );
}
