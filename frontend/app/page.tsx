"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { publicClient } from "@/lib/clients";
import { usdcBalance } from "@/lib/actions/reads";
import { fmtUsdc } from "@/lib/business/format";
import type { Address } from "viem";

export default function Home() {
  const { ready, authenticated, login, logout } = usePrivy();
  const { wallets } = useWallets();
  const address = wallets[0]?.address as Address | undefined;
  const [balance, setBalance] = useState<bigint | null>(null);

  useEffect(() => {
    if (!address) { setBalance(null); return; }
    usdcBalance(address).then(setBalance).catch(() => setBalance(null));
  }, [address]);

  return (
    <main className="mx-auto flex max-w-xl flex-1 flex-col gap-6 p-8">
      <header>
        <h1 className="text-3xl font-bold">ManagerCup</h1>
        <p className="text-sm opacity-70">World Cup fantasy football on X Layer (testnet)</p>
      </header>

      {!ready ? (
        <p className="opacity-60">Loading…</p>
      ) : authenticated && address ? (
        <section className="rounded-lg border p-4">
          <p className="font-mono text-sm break-all">{address}</p>
          <p className="mt-2 text-lg">
            USDC: <strong>{balance != null ? fmtUsdc(balance) : "…"}</strong>
          </p>
          <button className="mt-3 rounded bg-black px-4 py-2 text-white" onClick={() => logout()}>
            Log out
          </button>
        </section>
      ) : (
        <button className="w-fit rounded bg-black px-4 py-2 text-white" onClick={() => login()}>
          Connect with Privy
        </button>
      )}

      <Link href="/demo" className="text-sm underline opacity-80">
        → Open the full on-chain lifecycle demo
      </Link>

      <p className="text-xs opacity-60">
        Wallets via a single Privy context. Contract layer in <code>lib/</code>; runnable
        scripts in <code>scripts/</code>.
      </p>
    </main>
  );
}
