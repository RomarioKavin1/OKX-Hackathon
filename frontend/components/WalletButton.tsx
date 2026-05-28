"use client";

import { useAccount, useConnect, useDisconnect } from "wagmi";

/** Returns a short display label for a connector. */
function connectorLabel(name: string): string {
  const lower = name.toLowerCase();
  // The injected connector covers OKX Wallet (window.okxwallet) and MetaMask.
  if (lower === "injected" || lower === "browser wallet") {
    return "Connect OKX Wallet / MetaMask";
  }
  if (lower.includes("walletconnect")) {
    return "WalletConnect";
  }
  return name;
}

/** Truncate a 0x address for display: 0x1234…abcd */
function shortAddress(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function WalletButton() {
  const { address, isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();

  if (isConnected && address) {
    return (
      <div className="flex items-center gap-3">
        <span className="font-mono text-sm text-foreground/80">
          {shortAddress(address)}
        </span>
        <button
          type="button"
          onClick={() => disconnect()}
          className="rounded-md border border-foreground/30 px-3 py-1 text-sm transition-colors hover:bg-foreground/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pitch-green"
        >
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {connectors.map((connector) => {
        const label = connectorLabel(connector.name);
        // Primary CTA is the first connector (injected → OKX / MetaMask)
        const isPrimary =
          connector.name.toLowerCase() === "injected" ||
          connector.name.toLowerCase() === "browser wallet";
        return (
          <button
            key={connector.uid}
            type="button"
            onClick={() => connect({ connector })}
            className={
              isPrimary
                ? "rounded-md bg-pitch-green px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-pitch-green/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pitch-green focus-visible:ring-offset-2"
                : "rounded-md border border-foreground/30 px-3 py-2 text-sm transition-colors hover:bg-foreground/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pitch-green focus-visible:ring-offset-2"
            }
          >
            {isPrimary ? "Connect OKX Wallet" : label}
          </button>
        );
      })}
    </div>
  );
}
