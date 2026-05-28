import { createConfig, http } from "wagmi";
import { injected, walletConnect } from "wagmi/connectors";
import { xLayerTestnet } from "./contracts/chain";

// OKX Wallet is an EIP-1193 injected provider; `injected` picks it up (and MetaMask).
// WalletConnect is included only when a project id is present — an empty id would crash the app.
const wcProjectId = process.env.NEXT_PUBLIC_WC_PROJECT_ID;

export const wagmiConfig = createConfig({
  chains: [xLayerTestnet],
  connectors: [
    injected(),
    ...(wcProjectId ? [walletConnect({ projectId: wcProjectId })] : []),
  ],
  transports: {
    [xLayerTestnet.id]: http(),
  },
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
