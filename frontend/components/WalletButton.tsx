"use client";

import { usePrivy, useWallets } from "@privy-io/react-auth";
import type { Address } from "viem";

/** Truncate a hex address to "0x1234…abcd" */
function truncate(address: Address): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/**
 * WalletButton — FR-O1/O2
 *
 * Disconnected: renders "Connect Wallet" → opens the Privy modal
 *   (covers OKX Wallet / MetaMask / WalletConnect / embedded wallets).
 * Connected:    renders truncated address + "Log out" button.
 *
 * All interactive elements are keyboard-focusable and inherit the global
 * :focus-visible ring defined in globals.css.
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
      <div className="flex items-center gap-2">
        <span className="font-mono text-sm" title={address}>
          {truncate(address)}
        </span>
        <button
          onClick={() => logout()}
          className="rounded border border-current px-3 py-1 text-sm hover:opacity-80"
        >
          Log out
        </button>
      </div>
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
