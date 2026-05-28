"use client";

/**
 * InsureToggle — DNP insurance UI for the rental flow (Task 7.3)
 *
 * Exported components (all module-scope):
 *   InsureToggle   — "Insure this rental (+20% premium)" toggle shown in the rent flow.
 *                    Computes premium via insurancePremium(); renders approve-USDC + insure
 *                    TxButton pair.  After the DNP root is posted, if the player got 0
 *                    minutes, renders "Claim DNP refund" → claimDnp() TxButton.
 *   ClaimDnpPanel  — Standalone claim panel (used by rentals page when policy is
 *                    already resolved or when the renter needs to claim post-root).
 *
 * Contract arg order (from writes.ts):
 *   insureRental(wallet, matchday: number, tokenId: bigint, rentalCost: bigint)
 *   claimDnp(wallet, matchday: number, tokenId: bigint, rentalCost: bigint, proof: Hex[])
 *
 * The premium is charged via USDC approve before insure:
 *   1. approve(InsurancePool, premium)
 *   2. insure(matchday, tokenId, rentalCost)    <- pool pulls premium internally
 *
 * Payout formula (mirrors InsurancePool):
 *   premium = rentalCost * 20% (premiumBps=2000)
 *   payout  = rentalCost + premium * 50%  (premiumReturnBps=5000)
 */

import { useCallback, useState } from "react";
import type { Hex } from "viem";
import { TxButton } from "@/components/TxButton";
import { Panel, Pill, Button, cx } from "@/components/ui";
import { ADDRESSES, ABIS } from "@/lib/contracts";
import { insurancePremium, insurancePayout } from "@/lib/business/fees";
import { fmtUsdc } from "@/lib/business/format";

// ── Shared form-control class ─────────────────────────────────────────────────

const FORM_CONTROL =
  "rounded-sm border border-line-2 bg-paper-2 text-ink px-3 h-10 text-sm " +
  "focus-visible:outline-2 focus-visible:outline-cobalt w-full";

// ── InsureToggle ──────────────────────────────────────────────────────────────

export interface InsureToggleProps {
  /** The matchday this rental covers */
  matchday: number;
  /** Token ID of the rented card */
  tokenId: bigint;
  /** Resolved rental cost (6dp USDC) — used to compute the premium */
  rentalCost: bigint;
  /** Called with the tx hash when insure is successfully mined */
  onSuccess?: (hash: Hex) => void;
}

/**
 * InsureToggle
 *
 * Shows a checkbox toggle labelled "Insure this rental (+20% premium)".
 * When ticked, shows the premium amount and the two-step insure flow:
 *   Step 1 — Approve premium USDC to InsurancePool
 *   Step 2 — Call insure(matchday, tokenId, rentalCost)
 */
export function InsureToggle({
  matchday,
  tokenId,
  rentalCost,
  onSuccess,
}: InsureToggleProps) {
  const [enabled, setEnabled] = useState(false);

  const premium = insurancePremium(rentalCost);
  const expectedPayout = insurancePayout(rentalCost);

  const approveRequest = {
    address: ADDRESSES.MockUSDC,
    abi: ABIS.MockUSDC,
    functionName: "approve",
    args: [ADDRESSES.InsurancePool, premium] as const,
  };

  const insureRequest = {
    address: ADDRESSES.InsurancePool,
    abi: ABIS.InsurancePool,
    functionName: "insure",
    // args: [matchday uint256, tokenId uint256, rentalCost uint256]
    args: [BigInt(matchday), tokenId, rentalCost] as const,
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Toggle row */}
      <label className={cx(
        "flex cursor-pointer items-center justify-between gap-3 rounded-sm",
        "border px-3 py-2.5 transition-colors duration-150",
        enabled
          ? "border-cobalt/40 bg-cobalt/8"
          : "border-line-2 bg-paper-2 hover:bg-paper-3",
      )}>
        <div className="flex items-center gap-2.5 min-w-0">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className={cx(
              "h-4 w-4 shrink-0 rounded-xs border border-line-2",
              "accent-[color:var(--cobalt)]",
            )}
          />
          <span className="text-sm font-medium text-ink leading-tight">
            Insure this rental
          </span>
        </div>
        <Pill tone={enabled ? "cobalt" : "neutral"}>
          +{fmtUsdc(premium)} USDC
        </Pill>
      </label>

      {/* Expanded insurance details + actions */}
      {enabled && (
        <Panel variant="sunken" className="p-4">
          <div className="flex flex-col gap-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted mb-1">
                  DNP Insurance
                </p>
                <p className="text-xs text-ink-2 max-w-[36ch]">
                  If your player did not play (0 minutes), claim a refund of{" "}
                  <span className="font-semibold text-ink">{fmtUsdc(expectedPayout)} USDC</span>{" "}
                  (rental cost + 50% of premium returned).
                </p>
              </div>
              <Pill tone="violet">DNP cover</Pill>
            </div>

            <div className="flex flex-col gap-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
                Step 1 — Approve {fmtUsdc(premium)} USDC to Insurance Pool
              </p>
              <TxButton
                request={approveRequest}
                label={`Approve ${fmtUsdc(premium)} USDC`}
                onSuccess={() => undefined}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
                Step 2 — Insure rental for Matchday {matchday}
              </p>
              <TxButton
                request={insureRequest}
                label="Add Insurance"
                onSuccess={onSuccess}
              />
            </div>
          </div>
        </Panel>
      )}
    </div>
  );
}

// ── ClaimDnpPanel ─────────────────────────────────────────────────────────────

export interface ClaimDnpPanelProps {
  /** The matchday for which insurance was purchased */
  matchday: number;
  /** Token ID of the insured card */
  tokenId: bigint;
  /** The original rental cost (6dp USDC) stored in the policy */
  rentalCost: bigint;
  /** Called with the tx hash when claimDnp is successfully mined */
  onSuccess?: (hash: Hex) => void;
}

/**
 * ClaimDnpPanel
 *
 * Shown after the DNP root is posted for the matchday.  Fetches the Merkle
 * proof from /api/dnp-proof, then renders a TxButton to call claimDnp().
 * If the token was not DNP'd, shows an informational message instead.
 */
export function ClaimDnpPanel({
  matchday,
  tokenId,
  rentalCost,
  onSuccess,
}: ClaimDnpPanelProps) {
  type ProofState =
    | { tag: "idle" }
    | { tag: "loading" }
    | { tag: "not-eligible" }
    | { tag: "ready"; proof: Hex[] }
    | { tag: "error"; message: string };

  const [proofState, setProofState] = useState<ProofState>({ tag: "idle" });

  const fetchProof = useCallback(() => {
    setProofState({ tag: "loading" });
    const params = new URLSearchParams({
      matchday: String(matchday),
      tokenId: tokenId.toString(),
    });
    fetch(`/api/dnp-proof?${params.toString()}`)
      .then(async (res) => {
        const data = (await res.json()) as
          | { eligible: false }
          | { proof: string[] }
          | { error: string };
        if (!res.ok) {
          const errData = data as { error?: string };
          throw new Error(errData.error ?? `HTTP ${res.status}`);
        }
        if ("eligible" in data && data.eligible === false) {
          setProofState({ tag: "not-eligible" });
        } else {
          const proofData = data as { proof: string[] };
          setProofState({ tag: "ready", proof: proofData.proof as Hex[] });
        }
      })
      .catch((err: unknown) => {
        setProofState({
          tag: "error",
          message: err instanceof Error ? err.message : String(err),
        });
      });
  }, [matchday, tokenId]);

  const payout = insurancePayout(rentalCost);

  // Build claimDnp request only when we have a proof
  const claimRequest =
    proofState.tag === "ready"
      ? {
          address: ADDRESSES.InsurancePool,
          abi: ABIS.InsurancePool,
          functionName: "claimDnp",
          // args: [matchday uint256, tokenId uint256, rentalCost uint256, proof bytes32[]]
          args: [BigInt(matchday), tokenId, rentalCost, proofState.proof] as const,
        }
      : null;

  return (
    <Panel variant="sunken" className="p-4">
      <div className="flex items-center justify-between border-b border-line pb-3 mb-4">
        <div>
          <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
            Insurance claim
          </p>
          <h3 className="text-sm font-semibold text-ink">Claim DNP Refund</h3>
        </div>
        <Pill tone="violet">DNP</Pill>
      </div>

      <div className="flex flex-col gap-3">
        <p className="text-xs text-ink-2">
          If your player got 0 minutes this matchday, claim{" "}
          <span className="font-semibold text-ink">{fmtUsdc(payout)} USDC</span> back
          (rental + 50% of premium).
        </p>

        {proofState.tag === "idle" && (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={fetchProof}
          >
            Check DNP eligibility
          </Button>
        )}

        {proofState.tag === "loading" && (
          <p className="text-xs text-muted">Checking DNP status...</p>
        )}

        {proofState.tag === "not-eligible" && (
          <div className="rounded-sm bg-paper-3 border border-line-2 px-3 py-2">
            <p className="text-xs text-muted">
              This player is not eligible for a DNP refund (played or no root posted yet).
            </p>
          </div>
        )}

        {proofState.tag === "error" && (
          <div className="rounded-sm bg-danger/8 border border-danger/25 px-3 py-2 flex items-center justify-between gap-2">
            <p className="text-xs text-danger">
              Error fetching proof: {proofState.message}
            </p>
            <button
              type="button"
              onClick={fetchProof}
              className={cx(
                "shrink-0 text-xs font-medium text-danger underline underline-offset-2",
                "hover:text-ink focus-visible:outline-2 focus-visible:outline-cobalt",
              )}
            >
              Retry
            </button>
          </div>
        )}

        {proofState.tag === "ready" && claimRequest && (
          <TxButton
            request={claimRequest}
            label={`Claim DNP Refund — ${fmtUsdc(payout)} USDC`}
            onSuccess={onSuccess}
          />
        )}
      </div>
    </Panel>
  );
}
