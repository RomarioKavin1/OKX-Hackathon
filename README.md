# PANENKA

> Daily fantasy football for the **2026 FIFA World Cup**, on **X Layer**. Own your player cards, build a lineup every matchday, win real USDC, and rent star cards for a single match so a $5 budget can compete with the whales.

Built for the **OKX Build X Hackathon, xCup track**. Deployed on **X Layer testnet (chain `1952`)**.

**▶ [Live app](https://panenka-blond.vercel.app/) · [Demo video](https://canva.link/puap3vcc1i46rqn)**

| | |
|---|---|
| **Live app** | [panenka-blond.vercel.app](https://panenka-blond.vercel.app/) |
| **Demo video** | [watch the walkthrough](https://canva.link/puap3vcc1i46rqn) |
| **Track** | OKX Build X, xCup (World Cup theme) |
| **Chain** | X Layer testnet, `1952` (Polygon CDK ZK L2, gas token OKB) |
| **Category** | GameFi, NFT, Social |
| **Stack** | Next.js 16, React 19, Solidity/Foundry, wagmi + viem, Privy, Supabase |
| **Status** | 11 contracts deployed and wired, full frontend, 55 contract + 398 frontend tests passing |

---

## What it is

A fantasy World Cup game where every player is an **NFT card you actually own**. Pick a formation, name a captain, play a chip, and your XI scores against real match data. Prizes settle in **USDC, on-chain**.

The mechanic that makes it on-chain-native is a **per-matchday rental market**. You don't need to buy a Mbappé card to field him this Saturday. You rent him for one matchday, USDC upfront, via **ERC-4907**. After the match the lease auto-expires and the card returns to its owner.

## Why it matters

Football fans get two bad options today:

- **Web2 fantasy (FPL, DraftKings):** deep gameplay, but you own nothing, the operator holds your money, and your team dies at season end.
- **Web3 fantasy (Sorare):** real ownership, but shallow gameplay behind a high price wall.

Neither fixes the **affordability gap** for the casual fan who wants to play *now*, during the World Cup, with stars they can't justify buying. PANENKA delivers all three at once: real ownership, real strategic depth, and a rental market that turns a small budget into a competitive XI.

---

## How it works

Money and ownership live on-chain. Game logic that doesn't need to be trustless (scoring math, synergies, analytics) runs off-chain, then its results are committed on-chain as **Merkle roots** anyone can verify.

```
   Player (OKX Wallet)              Off-chain                  X Layer (1952)
  ┌──────────────────┐    ┌────────────────────┐    ┌──────────────────────┐
  │  Next.js + Privy │───▶│   Score engine     │    │  CardNFT (721 + 4907) │
  │  pick · rent ·   │    │   (real match data)│    │  RentalMarket         │
  │  commit · claim  │    │   Merkle builder   │─▶  │  GameRegistry         │
  └──────────────────┘    └────────────────────┘    │  ContestEscrow        │
            │              N-of-M oracle             │  ScoreOracle          │
            └────────── reads / writes ────────────▶ │  Marketplace · Packs  │
                                                     └──────────────────────┘
```

- **CardNFT** — ERC-721 + ERC-4907 player cards. Supply-capped across 4 tiers (Common, Rare, Super Rare, Unique); transfer-locked while rented.
- **RentalMarket** — per-matchday leases in USDC. Owner / platform / original-buyer split (88 / 10 / 2) enforced on-chain.
- **GameRegistry** — matchday clock, lineup commit, one-card-one-lineup exclusivity, stamina.
- **ScoreOracle** — N-of-M signers vote the score, payout, and season Merkle roots. Nothing pays out until they agree.
- **ContestEscrow / Marketplace / PackSale** — entry escrow with Merkle-proof payouts, fixed-price resale, commit-reveal pack opening.
- **InsurancePool** — opt-in DNP (did-not-play) insurance with an on-chain solvency reserve guard.

Scoring is deterministic and public. Any user can re-run the formula and verify a payout against the on-chain root with the MIT-licensed verifier CLI. No operator custody, no trust-me settlement.

---

## Deployed contracts (X Layer testnet, chain `1952`)

Explorer: [oklink.com/xlayer-test](https://www.oklink.com/xlayer-test). Source of truth: [`contracts/deployments/xlayer-testnet.json`](contracts/deployments/xlayer-testnet.json).

| Contract | Address |
|---|---|
| CardNFT | [`0xa6188b7eCb3638A3b7Fbb855089cdCFc84dE36c9`](https://www.oklink.com/xlayer-test/address/0xa6188b7eCb3638A3b7Fbb855089cdCFc84dE36c9) |
| RentalMarket | [`0x7a809b6e51b5DeE675036F24F76Eeb149C0f266c`](https://www.oklink.com/xlayer-test/address/0x7a809b6e51b5DeE675036F24F76Eeb149C0f266c) |
| GameRegistry | [`0x53d6CBe6bcA72396Fe1E5AD8E2249a78Ec79D5fC`](https://www.oklink.com/xlayer-test/address/0x53d6CBe6bcA72396Fe1E5AD8E2249a78Ec79D5fC) |
| ScoreOracle | [`0x3470694dD5Afd5474F916B89C108bBB85d05A295`](https://www.oklink.com/xlayer-test/address/0x3470694dD5Afd5474F916B89C108bBB85d05A295) |
| ContestEscrow | [`0x00B08f0E928933422A7b623E475Dd84b2B98BaA4`](https://www.oklink.com/xlayer-test/address/0x00B08f0E928933422A7b623E475Dd84b2B98BaA4) |
| Marketplace | [`0x4b1c73E8d59FD4a0EB1525A1255d64FEE05aF7C8`](https://www.oklink.com/xlayer-test/address/0x4b1c73E8d59FD4a0EB1525A1255d64FEE05aF7C8) |
| PackSale | [`0x0136b193EE83BffC55262aAFC411efd578F9e8D5`](https://www.oklink.com/xlayer-test/address/0x0136b193EE83BffC55262aAFC411efd578F9e8D5) |
| InsurancePool | [`0xc6d3061ccEA1c25769962A9cBDcee293Aaf698fB`](https://www.oklink.com/xlayer-test/address/0xc6d3061ccEA1c25769962A9cBDcee293Aaf698fB) |
| SeasonLeaderboard | [`0x9D696CBB6BD4DcfA322C14Ff74B662560aa5C2d8`](https://www.oklink.com/xlayer-test/address/0x9D696CBB6BD4DcfA322C14Ff74B662560aa5C2d8) |
| ChipNFT | [`0x2991dF527c84823a16917f425E24e746EE31F314`](https://www.oklink.com/xlayer-test/address/0x2991dF527c84823a16917f425E24e746EE31F314) |
| MockUSDC | [`0x29A46d0376C41423FF2aa9425A13c44FC53a1850`](https://www.oklink.com/xlayer-test/address/0x29A46d0376C41423FF2aa9425A13c44FC53a1850) |

---

## Run it locally

**Prerequisites:** Node 20+, a wallet (OKX Wallet or MetaMask) on X Layer testnet. [Foundry](https://book.getfoundry.sh) only if you want to run or redeploy the contracts.

**1. Install**

```bash
cd frontend
npm install
```

**2. Configure env.** Create `frontend/.env.local` (Next.js reads this, not the repo-root `.env`):

```
NEXT_PUBLIC_SUPABASE_URL=<your-supabase-project-url>
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<supabase anon/publishable key>
NEXT_PUBLIC_PRIVY_APP_ID=<your Privy app id>
SUPABASE_SERVICE_ROLE_KEY=<supabase service-role key>   # server-only
API_FOOTBALL_KEY=<optional, for live match scoring>
PRIVATE_KEY=<deployer/oracle key, for the /demo lifecycle and onboarding airdrop>
```

**3. Create the database schema.** Open your Supabase project's SQL editor and run [`frontend/supabase/apply-all.sql`](frontend/supabase/apply-all.sql) (the two migrations bundled into one). PostgREST reloads its schema automatically.

**4. Start**

```bash
npm run dev      # http://localhost:3000
```

Connect your wallet, then use **Settings → Faucet** for test USDC. The pages read live Supabase + on-chain data; they populate as you transact (or run the demo below).

**5. See the full on-chain loop.** Open **`/demo`**: ten phases (onboard, packs, market, rental, lineup, settle, insure, season payout) that each fire a real testnet transaction.

**6. Verify a payout yourself.**

```bash
cd frontend && npm run verify -- <matchday>
```

Reproduces the score Merkle root from public match data and checks it against the on-chain root.

---

## How it grows X Layer

- **Onboards the biggest sports audience on earth.** A free 5-card starter squad plus sub-$0.30 rentals turns a casual fan's first on-chain action into near-zero friction, converting World Cup traffic into real X Layer wallets.
- **Drives daily activity for a month.** Contests are tied 1:1 to real matchdays for the whole tournament. Lineup commits, rentals, and claims are a reason to come back and transact every day, not a one-time mint.
- **Locks USDC at every layer:** pack sales, per-matchday rental escrow, contest pools, and the DNP insurance reserve. The rental + contest loop means the same cards generate repeat locked volume each matchday, and cards keep value after the Cup (collectible + composable), so liquidity stays on-chain.

---

## What's built

11 contracts (10 product + MockUSDC) deployed and wired on X Layer testnet. **55 contract tests and 398 frontend tests pass; zero typecheck errors.**

- **Core game** — pack sales, fixed-price marketplace, per-matchday ERC-4907 rentals (88/10/2 split), lineup commit with stamina + chips + captain, ScoreOracle N-of-M multi-sig routing payout and season roots, Merkle-proof contest payouts, DNP insurance with solvency guard, season-aggregate payout, MIT-licensed public verifier.
- **Frontend** — 18 routes: home, real **2026 World Cup schedule** (live draw + group fixtures), lineup builder, packs, marketplace, rentals, contests, squad/portfolio, season table, live ticker, day-after report, public profiles, transparency, settings, and an on-chain lifecycle demo. Supabase-backed indexer + read API underneath.
- **Trust & compliance** — deterministic public scoring + verifier, transparency page with the live oracle roster and contracts table, geofencing middleware, and draft Terms / Privacy / Fair-Play / Signer Agreement / Incident Playbook / Bug Bounty.

### Design

PANENKA uses a bespoke **"Panini collector"** design system: warm album-paper surfaces, ink scoreboards, foil treatment on rare cards, and a condensed display type, deliberately avoiding the green-pitch-and-gold World Cup cliché. Player cards render rarity (Common → Rare → Super Rare → Unique foil) at a glance. See [`DESIGN.md`](DESIGN.md) and [`PRODUCT.md`](PRODUCT.md).

---

## Repo map

```
contracts/        Solidity + Foundry: 10 product contracts, tests, deploy scripts
  deployments/    xlayer-testnet.json (addresses + wiring)
frontend/         Next.js 16 app
  app/            routes (app shell + /demo + /api)
  components/     UI primitives, PlayerCard, Nav, wallet, pitch, tx flow
  lib/data/       player catalog, nations, 2026 World Cup schedule
  services/       indexer, oracle (ingest/score/publish/season), livescore, lifecycle
  verifier/       public Merkle-root verifier CLI
  supabase/       migrations + apply-all.sql
CONTRACTS.md      function reference for all contracts
docs/             design spec, E2E lifecycle, compliance drafts
```

---

## Scope and honesty

- Player catalog ships four squads (France, Argentina, England, Brazil); full likeness rights and the complete 1,300-player set are an open product decision. Cards use kit-colored crests rather than photos.
- Live scoring runs against `API_FOOTBALL_KEY`; before the tournament kicks off on 11 June 2026 the demo replays a finished historical match.
- ScoreOracle is deployed 1-of-1 (the deployer) on testnet and is built to move to N-of-M once external signers are onboarded.
- Testnet build. A pre-mainnet security audit and legal sign-off on the compliance drafts are open items.

---

## License

MIT. See [`LICENSE`](LICENSE) where present; the verifier is MIT-licensed for independent payout verification.
