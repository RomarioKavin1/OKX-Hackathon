"use client";

import { ReactNode } from "react";
import { PrivyProvider } from "@privy-io/react-auth";
import { xLayerTestnet } from "@/lib/contracts/chain";

const APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? "";

export function Providers({ children }: { children: ReactNode }) {
  if (!APP_ID) return <>{children}</>; // no app id configured — render without wallet context
  return (
    <PrivyProvider
      appId={APP_ID}
      config={{
        defaultChain: xLayerTestnet,
        supportedChains: [xLayerTestnet],
        embeddedWallets: { ethereum: { createOnLogin: "users-without-wallets" } },
        appearance: { walletChainType: "ethereum-only" },
      }}
    >
      {children}
    </PrivyProvider>
  );
}
