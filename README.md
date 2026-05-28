# ManagerCup

> Daily fantasy football for the **2026 FIFA World Cup**, on **X Layer**. Own your player cards, build lineups, win real USDC — and rent star cards for a single matchday so a $5 budget can compete with whales.

Built for the **OKX Build X Hackathon — xCup track**.

---

## What it is

A fantasy World Cup game where every player card is an NFT you actually own. Pick a formation, set a captain, play a chip, and your lineup scores against real match data. Prizes pay out in USDC, settled on-chain.

The twist that makes it on-chain-native: a **per-matchday rental market**. You don't need to buy a Mbappé card to play him this Saturday — you rent him for one matchday, USDC upfront, via ERC-4907. After the match the lease auto-expires and the card returns to its owner.

## Why it's needed

Football fans get two bad options:

- **Web2 fantasy (FPL, DraftKings):** deep gameplay, but you own nothing, the operator holds your money, and assets die at season end.
- **Web3 fantasy (Sorare):** real ownership, but shallow gameplay and a high price wall — you need expensive cards just to compete.

Neither fixes the **affordability gap** for the casual fan who wants to play *now*, during the World Cup, with stars they can't justify buying.

ManagerCup gives all three at once: **real ownership, real strategic depth, and a rental market that turns a $5 budget into a competitive lineup.**

---

## Architecture

Money and ownership live on-chain. Game logic that doesn't need to be trustless (scoring math, synergies, analytics) runs off-chain — then its results are committed on-chain as **Merkle roots** that anyone can verify.

```
   Player (OKX Wallet)                 Off-chain                    X Layer
  ┌──────────────────┐        ┌────────────────────┐        ┌──────────────────────┐
  │  Next.js + Privy │───────▶│   Score engine     │        │  CardNFT  (721+4907)  │
  │  pick · rent ·   │        │   (real match data)│        │  RentalMarket         │
  │  commit · claim  │        │   Merkle builder   │─roots─▶ │  GameRegistry         │
  └──────────────────┘        └────────────────────┘        │  ContestEscrow        │
            │                  multi-sig oracle              │  ScoreOracle          │
            └─────────────── reads / writes ───────────────▶ │  Marketplace · Packs  │
                                                             └──────────────────────┘
```

- **CardNFT** — ERC-721 + ERC-4907 player cards. Supply-capped across 4 tiers; transfer-locked while rented.
- **RentalMarket** — per-matchday leases in USDC. Owner / platform / original-buyer split enforced on-chain.
- **GameRegistry** — matchday clock, lineup commit, one-card-one-lineup exclusivity.
- **ScoreOracle** — multi-sig signers vote the score + payout Merkle roots; nothing pays out until they agree.
- **ContestEscrow / Marketplace / PackSale** — entry escrow + Merkle-proof payouts, fixed-price resale, commit-reveal pack opening.

Scoring is deterministic and public: any user can re-run the formula and verify their payout against the on-chain root. No operator custody, no trust-me settlement.

---

## How it grows X Layer

**Brings users on-chain.** The World Cup is the single biggest sports audience on earth. A free 5-card Starter Squad + sub-$0.30 rentals onboards casual fans into their first on-chain transaction with near-zero friction — exactly the traffic the xCup track is built to capture, converted into real X Layer wallets.

**Drives daily activity.** Contests are tied 1:1 to real matchdays for the full tournament. That's a built-in reason to come back and transact every single day for a month — lineup commits, rentals, claims — not a one-time mint.

**Increases TVL.** Every active layer locks USDC on X Layer:

- **Pack sales** — pre-Cup card supply bought in USDC.
- **Rental escrow** — every matchday, renters lock USDC that settles to owners on-chain.
- **Contest pools** — entry fees escrowed until oracle settlement.
- **Insurance reserve** — DNP-insurance premiums held as collateralized reserve.

The rental + contest loop means the same cards generate repeat locked volume every matchday, not a single sale. Cards keep value after the Cup (collectible + composable), so liquidity stays on the chain.

---

## Tech

- **Contracts:** Solidity / Foundry — ERC-721 + ERC-4907 + ERC-1155, OpenZeppelin-compatible Merkle proofs. **Deployed to X Layer testnet (chain `1952`).**
- **Frontend:** Next.js 16, React 19, TypeScript, Tailwind — Privy auth, wagmi + viem, OKX Wallet first-class.
- **Off-chain:** score engine, Merkle builder, and fee math that mirror the on-chain splits exactly.

Deployed addresses: [`contracts/deployments/xlayer-testnet.json`](contracts/deployments/xlayer-testnet.json) · contract reference: [`CONTRACTS.md`](CONTRACTS.md) · end-to-end flow: [`docs/E2E-LIFECYCLE.md`](docs/E2E-LIFECYCLE.md) · product spec: [`PRD.md`](PRD.md)
