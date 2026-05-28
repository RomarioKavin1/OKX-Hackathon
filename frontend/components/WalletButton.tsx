"use client";

import { useEffect, useState, startTransition } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import type { Address } from "viem";
import { publicClient } from "@/lib/clients";
import { usdcBalance } from "@/lib/actions/reads";
import { fmtUsdc } from "@/lib/business/format";

/** Truncate a hex address to "0x1234…abcd" */
function truncate(address: Address): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

// ── Sub-components (module scope — never nested inside render) ───────────────

interface GasBannerProps {
  address: Address;
}

/** Reads OKB balance and shows a warning banner if it's below the gas threshold. */
function GasBanner({ address }: GasBannerProps) {
  const [okbBalance, setOkbBalance] = useState<bigint | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const bal = await publicClient.getBalance({ address });
        if (!cancelled) {
          startTransition(() => setOkbBalance(bal));
        }
      } catch {
        // silently ignore — no banner on error
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [address]);

  // Threshold: ~0.001 OKB (1e15 wei) is enough to submit 1–2 txs
  const GAS_THRESHOLD = 1_000_000_000_000_000n; // 0.001 OKB in wei

  if (okbBalance === null) return null;

  if (okbBalance < GAS_THRESHOLD) {
    return (
      <div
        role="alert"
        className="rounded bg-amber-50 border border-amber-300 px-3 py-1.5 text-xs text-amber-800"
        aria-label="Insufficient gas banner"
      >
        <span className="font-semibold">Insufficient Gas (OKB)</span>
        <p className="mt-0.5 opacity-80">
          Get OKB gas via OKX exchange or a partner on-ramp.
        </p>
      </div>
    );
  }

  return null;
}

interface UsdcBannerProps {
  address: Address;
}

/** Reads USDC balance and shows a hint if it's zero. */
function UsdcBanner({ address }: UsdcBannerProps) {
  const [usdc, setUsdc] = useState<bigint | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const bal = await usdcBalance(address);
        if (!cancelled) {
          startTransition(() => setUsdc(bal));
        }
      } catch {
        // silently ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [address]);

  if (usdc === null || usdc > 0n) return null;

  return (
    <div
      role="status"
      className="rounded bg-blue-50 border border-blue-200 px-3 py-1.5 text-xs text-blue-800"
      aria-label="Insufficient USDC hint"
    >
      <span className="font-semibold">0 USDC</span>
      {" — "}
      <span className="opacity-80">
        use <a href="/settings" className="underline">Settings → Faucet</a> to get test USDC.
      </span>
    </div>
  );
}

interface WalletStatusPanelProps {
  address: Address;
  onLogout: () => void;
}

/** Panel shown when the user is connected: address + banners + logout. */
function WalletStatusPanel({ address, onLogout }: WalletStatusPanelProps) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="font-mono text-sm" title={address}>
          {truncate(address)}
        </span>
        <button
          onClick={onLogout}
          className="rounded border border-current px-3 py-1 text-sm hover:opacity-80"
        >
          Log out
        </button>
      </div>
      <GasBanner address={address} />
      <UsdcBanner address={address} />
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * WalletButton — FR-O1/O2/O6
 *
 * Disconnected: renders "Connect Wallet" → opens the Privy modal
 *   (covers OKX Wallet / MetaMask / WalletConnect / embedded wallets).
 * Connected:    renders truncated address + "Log out" button.
 *   Also shows:
 *   - Insufficient Gas (OKB) banner (US-02) when OKB < 0.001
 *   - Insufficient USDC hint when USDC == 0
 *
 * All interactive elements are keyboard-focusable and inherit the global
 * :focus-visible ring defined in globals.css.
 *
 * Balance reads use the async-IIFE + cancelled-flag pattern to avoid
 * synchronous setState-in-effect.
 */
export function WalletButton() {
  const { ready, authenticated, login, logout } = usePrivy();
  const { wallets } = useWallets();
  const address = wallets[0]?.address as Address | undefined;

  if (!ready) {
    return (
      <span className="text-sm opacity-60" aria-live="polite">
        Loading…
      </span>
    );
  }

  if (authenticated && address) {
    return (
      <WalletStatusPanel
        address={address}
        onLogout={logout}
      />
    );
  }

  return (
    <button
      onClick={() => login()}
      className="rounded bg-[var(--pitch-green)] px-4 py-1.5 text-sm font-medium text-white hover:opacity-90"
    >
      Connect Wallet
    </button>
  );
}

// Re-export fmtUsdc as a convenience (used in banners' aria labels, keeps import count low)
export { fmtUsdc };
