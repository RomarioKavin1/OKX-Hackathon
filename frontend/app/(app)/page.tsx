"use client";

import { useAccount, useReadContract } from "wagmi";
import { ADDRESSES } from "@/lib/contracts/addresses";
import { MockUSDCAbi } from "@/lib/abis";
import { fmtUsdc } from "@/lib/business/format";
import { WalletButton } from "@/components/WalletButton";

export default function Home() {
  const { address, isConnected } = useAccount();

  const { data: balance } = useReadContract({
    address: ADDRESSES.MockUSDC,
    abi: MockUSDCAbi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address) },
  });

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-3xl font-bold">ManagerCup</h1>
        <p className="text-sm opacity-70">
          World Cup fantasy football on X Layer (testnet)
        </p>
      </header>

      {isConnected && address ? (
        <section className="rounded-lg border border-foreground/20 p-4">
          <p className="font-mono text-sm break-all text-foreground/80">
            {address}
          </p>
          <p className="mt-2 text-lg">
            USDC:{" "}
            <strong>{balance != null ? fmtUsdc(balance) : "…"}</strong>
          </p>
        </section>
      ) : (
        <div className="flex flex-col gap-4">
          <p className="text-sm opacity-70">
            Connect your wallet to get started.
          </p>
          <WalletButton />
        </div>
      )}

      <p className="text-xs opacity-60">
        Contract layer in <code>lib/</code>: ABIs, typed clients, business
        logic, and call wrappers. Runnable scripts in <code>scripts/</code>.
      </p>
    </div>
  );
}
