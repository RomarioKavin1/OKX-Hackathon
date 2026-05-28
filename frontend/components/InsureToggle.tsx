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
 *   2. insure(matchday, tokenId, rentalCost)    ← pool pulls premium internally
 *
 * Payout formula (mirrors InsurancePool):
 *   premium = rentalCost * 20% (premiumBps=2000)
 *   payout  = rentalCost + premium * 50%  (premiumReturnBps=5000)
 */

import { useCallback, useState } from "react";
import type { Hex } from "viem";
import { TxButton } from "@/components/TxButton";
import { ADDRESSES, ABIS } from "@/lib/contracts";
import { insurancePremium, insurancePayout } from "@/lib/business/fees";
import { fmtUsdc } from "@/lib/business/format";

// ── Shared section wrapper ────────────────────────────────────────────────────

interface SectionProps {
  title: string;
  children: React.ReactNode;
}

function InsureSection({ title, children }: SectionProps) {
  return (
    <div className="rounded border border-blue-100 bg-blue-50 p-4">
      <h3 className="mb-3 text-sm font-semibold text-blue-800">{title}</h3>
      {children}
    </div>
  );
}

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
      {/* Toggle */}
      <label className="flex cursor-pointer items-center gap-2">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="h-4 w-4 accent-blue-600"
        />
        <span className="text-sm font-medium text-zinc-700">
          Insure this rental{" "}
          <span className="text-blue-700">(+{fmtUsdc(premium)} USDC premium)</span>
        </span>
      </label>

      {/* Expanded insurance details + actions */}
      {enabled && (
        <InsureSection title="DNP Insurance">
          <div className="flex flex-col gap-3">
            <p className="text-xs text-blue-700">
              If your player did not play (0 minutes), you can claim a refund of{" "}
              <span className="font-semibold">{fmtUsdc(expectedPayout)} USDC</span>{" "}
              (rental + 50% of premium back).
            </p>

            <div className="flex flex-col gap-1">
              <p className="text-xs font-medium text-zinc-500">
                Step 1 — Approve {fmtUsdc(premium)} USDC to Insurance Pool
              </p>
              <TxButton
                request={approveRequest}
                label={`Approve ${fmtUsdc(premium)} USDC`}
                onSuccess={() => undefined}
              />
            </div>

            <div className="flex flex-col gap-1">
              <p className="text-xs font-medium text-zinc-500">
                Step 2 — Insure rental for Matchday {matchday}
              </p>
              <TxButton
                request={insureRequest}
                label="Add Insurance"
                onSuccess={onSuccess}
              />
            </div>
          </div>
        </InsureSection>
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
    <InsureSection title="Claim DNP Refund">
      <div className="flex flex-col gap-3">
        <p className="text-xs text-blue-700">
          If your player got 0 minutes this matchday, claim{" "}
          <span className="font-semibold">{fmtUsdc(payout)} USDC</span> back
          (rental + 50% of premium).
        </p>

        {proofState.tag === "idle" && (
          <button
            type="button"
            onClick={fetchProof}
            className="self-start rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500"
          >
            Check DNP eligibility
          </button>
        )}

        {proofState.tag === "loading" && (
          <p className="text-xs text-zinc-500">Checking DNP status…</p>
        )}

        {proofState.tag === "not-eligible" && (
          <p className="rounded bg-zinc-100 px-3 py-2 text-xs text-zinc-600">
            This player is not eligible for a DNP refund (played or no root posted yet).
          </p>
        )}

        {proofState.tag === "error" && (
          <p className="rounded bg-red-50 px-3 py-2 text-xs text-red-700">
            Error fetching proof: {proofState.message}
            <button
              type="button"
              onClick={fetchProof}
              className="ml-2 underline"
            >
              Retry
            </button>
          </p>
        )}

        {proofState.tag === "ready" && claimRequest && (
          <TxButton
            request={claimRequest}
            label={`Claim DNP Refund — ${fmtUsdc(payout)} USDC`}
            onSuccess={onSuccess}
          />
        )}
      </div>
    </InsureSection>
  );
}
