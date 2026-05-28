"use client";

import { useState } from "react";
import { useWallets } from "@privy-io/react-auth";
import type { Abi, Address, Hex } from "viem";
import { ACTIVE_CHAIN } from "@/lib/contracts/chain";
import { publicClient } from "@/lib/clients";
import { walletClientFromPrivy } from "@/lib/privyWallet";
import { preflight } from "@/lib/business/preflight";
import type { PreflightResult } from "@/lib/business/preflight";
import { waitFor } from "@/lib/actions/writes";
import { Button, Spinner, Pill, cx } from "@/components/ui";

// ── Props ────────────────────────────────────────────────────────────────────

export interface TxRequest {
  address: Address;
  abi: Abi;
  functionName: string;
  args?: readonly unknown[];
  value?: bigint;
}

export interface TxButtonProps {
  request: TxRequest;
  /** Label shown on the primary simulate button */
  label: string;
  /** Called with the transaction hash once mined */
  onSuccess?: (hash: Hex) => void;
  disabled?: boolean;
}

// ── Internal state machine ───────────────────────────────────────────────────

type Phase =
  | { tag: "idle" }
  | { tag: "simulating" }
  | { tag: "simulated"; result: PreflightResult }
  | { tag: "sending" }
  | { tag: "mining" }
  | { tag: "done"; hash: Hex }
  | { tag: "error"; message: string };

// ── Component ────────────────────────────────────────────────────────────────

/**
 * TxButton — reusable write-button with preflight simulation.
 *
 * Flow:
 *   1. User clicks the label button → simulate via publicClient.
 *   2. Badge shows simulation outcome (gas estimate OR revert reason).
 *   3. "Confirm" button appears only when simulation succeeded.
 *   4. On confirm → build WalletClient from Privy → writeContract → waitFor.
 *   5. onSuccess(hash) called when mined.
 */
export function TxButton({ request, label, onSuccess, disabled = false }: TxButtonProps) {
  const { wallets } = useWallets();
  const wallet = wallets[0];
  const address = wallet?.address as Address | undefined;

  const [phase, setPhase] = useState<Phase>({ tag: "idle" });

  // ── Step 1: Simulate ───────────────────────────────────────────────────────
  async function handleSimulate() {
    if (!wallet || !address) {
      setPhase({ tag: "error", message: "No wallet connected — please connect first." });
      return;
    }

    setPhase({ tag: "simulating" });
    try {
      const result = await preflight(publicClient, { ...request, account: address });
      setPhase({ tag: "simulated", result });
    } catch (err) {
      setPhase({
        tag: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // ── Step 2: Confirm & send ─────────────────────────────────────────────────
  async function handleConfirm() {
    if (!wallet || !address) return;

    setPhase({ tag: "sending" });
    try {
      const walletClient = await walletClientFromPrivy(wallet);

      const hash = await walletClient.writeContract({
        ...request,
        account: address,
        chain: ACTIVE_CHAIN,
      });

      setPhase({ tag: "mining" });
      await waitFor(hash);
      setPhase({ tag: "done", hash });
      onSuccess?.(hash);
    } catch (err) {
      setPhase({
        tag: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // ── Status badge ───────────────────────────────────────────────────────────
  function renderBadge() {
    switch (phase.tag) {
      case "idle":
        return null;
      case "simulating":
        return <TxStatusBadge tone="neutral" icon={<Spinner className="size-3" />} text="Simulating" />;
      case "simulated": {
        const r = phase.result;
        if (r.willRevert) {
          return <TxStatusBadge tone="danger" icon="✗" text={`Will revert: ${r.reason ?? "unknown reason"}`} />;
        }
        const gasStr = r.gas !== undefined ? `~${r.gas.toLocaleString()} gas` : "gas unknown";
        const gweiStr = r.gasPriceGwei !== undefined ? ` @ ${r.gasPriceGwei} gwei` : "";
        return <TxStatusBadge tone="ok" icon="✓" text={`Will succeed · ${gasStr}${gweiStr}`} />;
      }
      case "sending":
        return <TxStatusBadge tone="cobalt" icon={<Spinner className="size-3" />} text="Sending transaction" />;
      case "mining":
        return <TxStatusBadge tone="cobalt" icon={<Spinner className="size-3" />} text="Waiting for confirmation" />;
      case "done":
        return (
          <TxStatusBadge
            tone="ok"
            icon="✓"
            text={`Mined: ${phase.hash.slice(0, 10)}…`}
          />
        );
      case "error":
        return <TxStatusBadge tone="danger" icon="✗" text={`Error: ${phase.message}`} />;
    }
  }

  // ── No wallet ──────────────────────────────────────────────────────────────
  if (!wallet) {
    return (
      <div className="flex flex-col gap-1">
        <Pill tone="warn">Connect a wallet to send transactions.</Pill>
      </div>
    );
  }

  const isBusy =
    phase.tag === "simulating" ||
    phase.tag === "sending" ||
    phase.tag === "mining";

  const showConfirm =
    phase.tag === "simulated" && !phase.result.willRevert;

  const isDone = phase.tag === "done";
  const isError = phase.tag === "error";

  return (
    <div className="flex flex-col gap-2">
      {/* Primary simulate button — primary=cobalt, shows spinner when simulating */}
      <Button
        type="button"
        variant="primary"
        disabled={disabled || isBusy}
        loading={phase.tag === "simulating"}
        onClick={handleSimulate}
      >
        {phase.tag === "simulating" ? "Simulating" : label}
      </Button>

      {/* Simulation result badge */}
      {renderBadge()}

      {/* Confirm button — only when simulation succeeded; success=ok green */}
      {showConfirm && (
        <Button
          type="button"
          variant="cta"
          disabled={isBusy}
          loading={isBusy}
          onClick={handleConfirm}
        >
          Confirm &amp; Send
        </Button>
      )}

      {/* Reset link after terminal states */}
      {(isDone || isError) && (
        <button
          type="button"
          onClick={() => setPhase({ tag: "idle" })}
          className={cx(
            "w-fit text-xs text-muted underline underline-offset-2 opacity-60",
            "hover:opacity-100 hover:text-ink",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt",
            "transition-opacity duration-150",
          )}
        >
          reset
        </button>
      )}
    </div>
  );
}

// ── Tiny internal status badge ──────────────────────────────────────────────

import type { ReactNode } from "react";

function TxStatusBadge({
  tone,
  icon,
  text,
}: {
  tone: "ok" | "danger" | "cobalt" | "neutral";
  icon: ReactNode;
  text: string;
}) {
  const surface =
    tone === "ok"
      ? "bg-ok/10 border-ok/30 text-ok"
      : tone === "danger"
        ? "bg-danger/10 border-danger/30 text-danger"
        : tone === "cobalt"
          ? "bg-cobalt/10 border-cobalt/30 text-cobalt-ink"
          : "bg-paper-3 border-line-2 text-ink-2";

  return (
    <p
      className={cx(
        "flex items-center gap-1.5 rounded-sm border px-3 py-1.5 text-xs font-mono",
        surface,
      )}
      role="status"
      aria-live="polite"
    >
      <span aria-hidden className="shrink-0 flex items-center">{icon}</span>
      <span className="break-all">{text}</span>
    </p>
  );
}
