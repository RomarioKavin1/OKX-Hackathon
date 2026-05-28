# PANENKA — Frontend & Contract SDK

Next.js 16 (App Router, TypeScript, Tailwind) + a typed TypeScript SDK for the PANENKA
contracts on OKX **X Layer testnet** (chain `1952`).

## Layout

```
app/                     Next.js App Router
  layout.tsx             wraps the app in wagmi + react-query providers
  providers.tsx          WagmiProvider + QueryClientProvider (client component)
  page.tsx               demo: connect wallet (OKX/MetaMask) + read USDC balance
lib/
  abis/                  AUTO-GENERATED typed ABIs (scripts/gen-abis.mjs)
  contracts/             chain defs, deployed addresses, contract() bundle helper
  clients.ts             viem public client + browser/script wallet clients
  wagmi.ts               wagmi config (injected connector, X Layer testnet)
  types.ts               domain types (Tier, Card, Lineup, Contest, Rental, MatchEvents…)
  constants.ts           on-chain constants mirrored + scoring/formation tables
  business/              PURE business logic (no chain calls):
    fees, packs, stamina, scoring, pricing, lineup, merkle, format
  actions/               typed read/write wrappers over viem (reads.ts / writes.ts)
scripts/
  gen-abis.mjs           regenerate lib/abis from ../contracts/out
  read-state.ts          read-only sanity check
  demo-flow.ts           full on-chain flow (faucet→mint→rent→lineup→contest→claim)
```

## Setup

Secrets live in the **repo-root** `.env` (gitignored), shared with the contracts:

```
PRIVATE_KEY=0x...        # testnet deployer/admin/oracle key
RPC_URL=https://testrpc.xlayer.tech
```

```bash
npm install
npm run dev              # http://localhost:3000
```

## Regenerate ABIs after a contract change

```bash
cd ../contracts && forge build && cd ../frontend
node scripts/gen-abis.mjs
# then update lib/contracts/addresses.ts if you redeployed
```

## Scripts (run from `frontend/`)

```bash
npx tsx scripts/read-state.ts     # chain head, USDC balance, deployed addresses
npx tsx scripts/demo-flow.ts      # end-to-end write demo on testnet (uses PRIVATE_KEY)
```

## Using the SDK

Read (browser or script):

```ts
import { usdcBalance, cardController, contestInfo } from "@/lib/actions/reads";
const bal = await usdcBalance("0xabc...");
```

Write (script with local key):

```ts
import { getScriptWalletClient } from "@/lib/clients";
import * as W from "@/lib/actions/writes";
const wallet = getScriptWalletClient(process.env.PRIVATE_KEY as `0x${string}`);
const hash = await W.rentCard(wallet, tokenId, matchday);
await W.waitFor(hash);
```

Write (browser, wagmi): use `useWriteContract` with `contract("RentalMarket")` from `@/lib/contracts`,
or `getBrowserWalletClient()` + the `writes.ts` helpers passing `from: connectedAddress`.

Business logic (pure, unit-testable):

```ts
import { rentalSplit, scoreCard, buildPayoutTree, applyStamina } from "@/lib/business";
const { owner, platform, originalBuyer } = rentalSplit(12_000000n); // mirrors RentalMarket.settle
```

## Merkle payouts

`lib/business/merkle.ts` builds OpenZeppelin-compatible (commutative, sorted-pair) trees with the
exact leaf encodings the contracts verify:
- payout leaf = `keccak256(abi.encodePacked(address, uint256 amount))`
- DNP leaf = `keccak256(abi.encodePacked(uint256 tokenId))`

Build the tree off-chain, submit the root via `ScoreOracle.submitPayoutRoot` / `submitSeasonRoot`,
then claimants call `claim(amount, proof)`.
