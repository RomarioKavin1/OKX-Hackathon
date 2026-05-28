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
import { Panel, Pill, cx } from "@/components/ui";
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

// ── Shared form-control class ─────────────────────────────────────────────────

const FORM_CONTROL =
  "rounded-sm border border-line-2 bg-paper-2 text-ink px-3 h-10 text-sm " +
  "focus-visible:outline-2 focus-visible:outline-cobalt w-full";

// ── Shared field label ────────────────────────────────────────────────────────

interface FieldProps {
  label: string;
  children: React.ReactNode;
  hint?: string;
}

function Field({ label, children, hint }: FieldProps) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
        {label}
      </span>
      {children}
      {hint && (
        <span className="text-xs text-muted">{hint}</span>
      )}
    </label>
  );
}

// ── Matchday selector ─────────────────────────────────────────────────────────

interface MatchdaySelectorProps {
  value: number;
  onChange: (v: number) => void;
  id?: string;
}

function MatchdaySelector({ value, onChange, id }: MatchdaySelectorProps) {
  return (
    <select
      id={id}
      className={FORM_CONTROL}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
    >
      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((d) => (
        <option key={d} value={d}>
          Matchday {d}
        </option>
      ))}
    </select>
  );
}

// ── Panel header ──────────────────────────────────────────────────────────────

interface PanelHeaderProps {
  title: string;
  kicker?: string;
}

function PanelHeader({ title, kicker }: PanelHeaderProps) {
  return (
    <div className="border-b border-line pb-3 mb-4">
      {kicker && (
        <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
          {kicker}
        </p>
      )}
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
    </div>
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
    <Panel variant="paper" className="p-4">
      <PanelHeader kicker="Owner action" title="List for Rent" />
      <div className="flex flex-col gap-4">
        <Field label="Pricing mode">
          <select
            className={FORM_CONTROL}
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
              ? "Basis points of floor"
              : "Price (USDC)"
          }
          hint={
            mode === PricingMode.FloorPegged
              ? "Integer bps, e.g. 10000 = 100% of floor price"
              : undefined
          }
        >
          <input
            type="number"
            min={mode === PricingMode.FloorPegged ? "1" : "0"}
            max={mode === PricingMode.FloorPegged ? "10000" : undefined}
            step={mode === PricingMode.FloorPegged ? "1" : "0.01"}
            className={FORM_CONTROL}
            value={priceInput}
            onChange={(e) => setPriceInput(e.target.value)}
          />
        </Field>

        {!isValid && (
          <Pill tone="danger">Enter a valid price to enable simulation.</Pill>
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
    </Panel>
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
    <Panel variant="paper" className="p-4">
      <div className="flex items-center justify-between border-b border-line pb-3 mb-4">
        <div>
          <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
            Owner action
          </p>
          <h3 className="text-sm font-semibold text-ink">Auto-list at Floor</h3>
        </div>
        <Pill tone={isAutoListed ? "ok" : "neutral"}>
          {isAutoListed ? "Active" : "Inactive"}
        </Pill>
      </div>

      <div className="flex flex-col gap-4">
        <p className="text-xs text-muted">
          A FloorPegged listing at 100% automatically prices to the on-chain floor. Update the
          floor price below or stop auto-listing at any time.
        </p>

        <Field label="Floor price (USDC)">
          <input
            type="number"
            min="0"
            step="0.01"
            className={FORM_CONTROL}
            value={floorInput}
            onChange={(e) => setFloorInput(e.target.value)}
          />
        </Field>

        {!floorValid && (
          <Pill tone="danger">Enter a valid floor price to update.</Pill>
        )}

        {setFloorRequest && (
          <TxButton
            request={setFloorRequest}
            label="Set Floor Price"
            disabled={!floorValid}
            onSuccess={onSuccess}
          />
        )}

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
    </Panel>
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
    <Panel variant="ink" className="p-4">
      <PanelHeader kicker="Rent this card" title="Field a star for one matchday" />

      <div className="flex flex-col gap-4">
        <div className="flex items-baseline gap-2">
          <span className="display text-2xl text-on-panel tabular-nums">
            {fmtUsdc(resolvedPrice)}
          </span>
          <span className="text-xs font-semibold text-on-panel-muted">USDC / matchday</span>
        </div>

        <Field label="Matchday">
          <MatchdaySelector value={matchday} onChange={setMatchday} />
        </Field>

        <div className="flex flex-col gap-1.5 rounded-sm bg-panel-2 p-3">
          <p className={cx(
            "text-xs font-semibold uppercase tracking-[0.14em]",
            "text-on-panel-muted"
          )}>
            Step 1 — Approve USDC
          </p>
          <TxButton
            request={approveRequest}
            label={`Approve ${fmtUsdc(resolvedPrice)} USDC`}
            onSuccess={() => undefined}
          />
        </div>

        <div className="flex flex-col gap-1.5 rounded-sm bg-panel-2 p-3">
          <p className={cx(
            "text-xs font-semibold uppercase tracking-[0.14em]",
            "text-on-panel-muted"
          )}>
            Step 2 — Rent Card
          </p>
          <TxButton
            request={rentRequest}
            label={`Rent for Matchday ${matchday}`}
            onSuccess={onSuccess}
          />
        </div>
      </div>
    </Panel>
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
    <Panel variant="paper" className="p-4">
      <PanelHeader kicker="Owner action" title="Settle Rental" />
      <div className="flex flex-col gap-4">
        <dl className="grid grid-cols-3 gap-2 rounded-sm bg-paper-3 p-3">
          <div className="flex flex-col gap-0.5">
            <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted">Owner</dt>
            <dd className="text-sm font-semibold text-ink tabular-nums">{fmtUsdc(ownerShare)}</dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted">Platform</dt>
            <dd className="text-sm font-semibold text-ink tabular-nums">{fmtUsdc(platformShare)}</dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted">Original buyer</dt>
            <dd className="text-sm font-semibold text-ink tabular-nums">{fmtUsdc(originalBuyerShare)}</dd>
          </div>
        </dl>

        <Field label="Matchday">
          <MatchdaySelector value={matchday} onChange={setMatchday} />
        </Field>

        <TxButton
          request={settleRequest}
          label={`Settle — Matchday ${matchday}`}
          onSuccess={onSuccess}
        />
      </div>
    </Panel>
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
    <Panel variant="paper" className="p-4">
      <PanelHeader kicker="Renter action" title="Cancel Rental" />
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2 rounded-sm bg-warn/10 border border-warn/25 px-3 py-2">
          <span aria-hidden className="text-warn text-sm">!</span>
          <p className="text-xs text-ink-2">
            Pre-lock cancellation returns a 90% refund:{" "}
            <span className="font-semibold text-ink">{fmtUsdc(refundAmount)} USDC</span>
          </p>
        </div>

        <Field label="Matchday">
          <MatchdaySelector value={matchday} onChange={setMatchday} />
        </Field>

        <TxButton
          request={cancelRequest}
          label={`Cancel — Matchday ${matchday}`}
          onSuccess={onSuccess}
        />
      </div>
    </Panel>
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
    <Panel variant="paper" className="p-4">
      <div className="flex items-center justify-between border-b border-line pb-3 mb-4">
        <div>
          <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
            Match postponed
          </p>
          <h3 className="text-sm font-semibold text-ink">Claim Postponement Refund</h3>
        </div>
        <Pill tone="warn">FR-R7</Pill>
      </div>

      <div className="flex flex-col gap-4">
        <p className="text-xs text-muted">
          If the matchday was officially postponed, claim a full rental refund.
        </p>

        <Field label="Matchday">
          <MatchdaySelector value={matchday} onChange={setMatchday} />
        </Field>

        <TxButton
          request={refundRequest}
          label={`Refund — Matchday ${matchday}`}
          onSuccess={onSuccess}
        />
      </div>
    </Panel>
  );
}
