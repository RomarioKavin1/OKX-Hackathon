"use client";

import { useEffect, useState, startTransition } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import type { Address } from "viem";
import { publicClient } from "@/lib/clients";
import { usdcBalance } from "@/lib/actions/reads";
import { fmtUsdc } from "@/lib/business/format";
import { buttonClasses, cx, Pill } from "@/components/ui";

/** Truncate a hex address to "0x1234…abcd" */
function truncate(address: Address): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

// ~0.001 OKB (1e15 wei) is enough to submit 1-2 txs.
const GAS_THRESHOLD = 1_000_000_000_000_000n;

/**
 * Connected wallet control: a compact chip with a status indicator dot, opening
 * a dropdown with balances, low-gas / faucet hints, and log out. The dot turns
 * amber when something needs attention (low OKB gas or zero USDC).
 */
function WalletMenu({ address, onLogout }: { address: Address; onLogout: () => void }) {
  const [open, setOpen] = useState(false);
  const [okb, setOkb] = useState<bigint | null>(null);
  const [usdc, setUsdc] = useState<bigint | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const b = await publicClient.getBalance({ address });
        if (!cancelled) startTransition(() => setOkb(b));
      } catch {
        /* ignore */
      }
    })();
    (async () => {
      try {
        const b = await usdcBalance(address);
        if (!cancelled) startTransition(() => setUsdc(b));
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [address]);

  const lowGas = okb !== null && okb < GAS_THRESHOLD;
  const noUsdc = usdc !== null && usdc === 0n;
  const attention = lowGas || noUsdc;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Wallet ${truncate(address)}${attention ? " — needs attention" : ""}`}
        className="flex items-center gap-2 rounded-full border border-line bg-paper-2 py-1 pl-2.5 pr-2.5 shadow-sticker transition-colors hover:border-line-2"
      >
        <span className="relative flex size-2.5" aria-hidden>
          {attention && (
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-warn opacity-60" />
          )}
          <span className={cx("relative inline-flex size-2.5 rounded-full", attention ? "bg-warn" : "bg-ok")} />
        </span>
        <span className="font-mono text-xs text-ink">{truncate(address)}</span>
        <svg viewBox="0 0 12 12" className={cx("size-3 text-muted transition-transform duration-200", open && "rotate-180")} aria-hidden>
          <path d="M3 4.5L6 7.5L9 4.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <>
          {/* click-away */}
          <button
            aria-hidden
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 cursor-default"
          />
          <div
            role="menu"
            aria-label="Wallet menu"
            className="absolute right-0 top-full z-50 mt-2 w-72 overflow-hidden rounded-card border border-line bg-paper-2 shadow-lift"
          >
            <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
              <span className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Wallet</span>
              <Pill tone="cobalt">X Layer Testnet</Pill>
            </div>

            <div className="px-4 py-3">
              <p className="break-all font-mono text-xs text-ink-2" title={address}>{address}</p>
            </div>

            <dl className="border-t border-line px-4 py-3 text-sm">
              <div className="flex items-center justify-between py-1">
                <dt className="text-muted">USDC</dt>
                <dd className="font-mono tabular-nums text-ink">{usdc != null ? fmtUsdc(usdc) : "…"}</dd>
              </div>
              <div className="flex items-center justify-between py-1">
                <dt className="text-muted">Gas (OKB)</dt>
                <dd>
                  {okb == null ? (
                    <span className="text-muted">…</span>
                  ) : lowGas ? (
                    <Pill tone="warn">Low</Pill>
                  ) : (
                    <Pill tone="ok">OK</Pill>
                  )}
                </dd>
              </div>
            </dl>

            {attention && (
              <div className="border-t border-line bg-paper-3 px-4 py-3 text-xs text-ink-2">
                {lowGas && (
                  <p className="mb-1">
                    <span className="font-semibold text-ink">Low gas.</span> Top up OKB via OKX or a partner on-ramp.
                  </p>
                )}
                {noUsdc && (
                  <p>
                    <span className="font-semibold text-ink">0 USDC.</span> Get test funds in{" "}
                    <a href="/settings" className="text-cobalt-ink underline underline-offset-2" onClick={() => setOpen(false)}>
                      Settings → Faucet
                    </a>
                    .
                  </p>
                )}
              </div>
            )}

            <div className="border-t border-line p-2">
              <button
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  onLogout();
                }}
                className={cx(buttonClasses("secondary", "sm"), "w-full")}
              >
                Log out
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * WalletButton — FR-O1/O2/O6
 *
 * Disconnected: "Connect wallet" opens the Privy modal (OKX Wallet / MetaMask /
 * WalletConnect / embedded). Connected: a status chip + dropdown (balances,
 * low-gas / faucet hints, log out), with an attention dot on the chip.
 */
export function WalletButton() {
  const { ready, authenticated, login, logout } = usePrivy();
  const { wallets } = useWallets();
  const address = wallets[0]?.address as Address | undefined;

  if (!ready) {
    return (
      <span className="text-sm text-muted" aria-live="polite">
        Loading…
      </span>
    );
  }

  if (authenticated && address) {
    return <WalletMenu address={address} onLogout={logout} />;
  }

  return (
    <button onClick={() => login()} className={buttonClasses("primary", "md")}>
      Connect wallet
    </button>
  );
}

// Re-export fmtUsdc as a convenience (used elsewhere; keeps import count low)
export { fmtUsdc };
