# Football Card + Fantasy League Game on X Layer — Design Spec

> Working title: **ManagerCup** (rename TBD — see Open Decisions §12)
> Status: Design approved through six sections. Ready for implementation planning.
> Target chain: OKX **X Layer** (EVM, Polygon CDK ZK L2)
> Target audience: World Cup 2026 fans + crypto-native fantasy players

---

## 0. TL;DR

A daily-cadence fantasy football game built on persistent NFT cards with an on-chain rental market and real strategic gameplay (formations, traits, captains, chips, stamina). Hybrid economy: a free leaderboard track for mass adoption + paid tier-gated USDC contests for depth. Settled trustlessly on X Layer via a multi-sig oracle that posts Merkle roots of matchday scores.

**Why on-chain (the real reason):**
1. Cards are programmable, rentable property — ERC-4907 delegations make atomic per-matchday card leases possible
2. Trustless prize pools — entry fees + payouts settled by smart contracts, no operator custody risk
3. DNP insurance is a parametric, oracle-settled on-chain primitive — impossible to ship credibly off-chain
4. Open card economy — cards retain value beyond the Cup, are tradeable, composable, can integrate with other apps

**Core differentiator vs Sorare/FPL:**
- Sorare = NFTs + fantasy but shallow gameplay (no formations, traits, stamina, chips)
- FPL = deep strategic gameplay but no real ownership or open economy
- **ManagerCup = both**

---

## 1. Player Personas & Journey

### 1.1 Personas

**The Collector ("whale / set-builder")**
- Buys NFT cards (pre-Cup packs, secondary market, auctions)
- May not play daily; earns from rentals + appreciation
- Values scarcity, aesthetics, floor price, royalty fees

**The Manager ("competitor")**
- Doesn't own full roster; rents what they need each matchday
- Plays daily contests (free + paid)
- Values gameplay depth, prize pools, leaderboard rank, skill expression

**The Hybrid (most users)**
- Owns a small core of favorites + rents the rest
- Plays free daily, occasionally splurges on paid contests

### 1.2 Daily player journey (the core experience)

```
T-24h    Pack sales, marketplace, rentals all active
T-12h    Lineup window opens — pick formation, 11 cards, captain, chips
T-10m    Lineup lock — no further edits
T+0      Matches kick off; oracle ingests live events
T+0..10h Live score ticker (websocket UI)
T+~12h   Oracle multi-sig posts Merkle root of all final scores
T+12h+   Users claim payouts via Merkle proof
T+24h    Cycle resets
```

### 1.3 Onboarding (free starter squad)

- New user signs up → 5 deterministic Common cards minted to their wallet
- 5 owned Commons + cheap Common rentals (~$0.20/matchday) → full 11 lineup for under $5
- Enters free contest immediately, no card spend required

---

## 2. Card Economy

### 2.1 Player coverage

- 48 national teams × 26 players ≈ **1,248 unique footballers**
- ~50 manager cards (one per team manager)
- Total catalog: ~1,300 cards × 4 tier supplies

### 2.2 Rarity tier ladder

| Tier | Supply per player | Total | Pack pull rate | Stat bonus | Audience |
|---|---|---|---|---|---|
| Common | unlimited | ∞ | ~85% | +0% | mass market |
| Rare | 1,000 | ~1.3M | ~12% | +5% | mid-tier |
| Super Rare | 100 | ~130K | ~2.8% | +12% | committed |
| Unique | 1 | ~1,300 | ~0.2% / auction | +20% | whales |

**Higher tier = better stats**, not just rarer. Stats deterministic per (player, tier) — no per-card RNG inside a tier. No P2W stat-upgrading. No burn-for-upgrade.

### 2.3 Distribution mechanisms

1. **Pre-Cup pack sales (~80% of supply)**
   - Bronze / Silver / Gold packs, each 5 cards, weighted pulls per tier
   - VRF-based randomness (Chainlink VRF or local commit-reveal fallback)
   - Diamond pack guarantees one Unique
2. **Unique auctions (~1,300 one-time events)**
   - 24-hour English auctions with anti-snipe
   - Proceeds: 70% treasury / 30% federation/charity (PR play)
3. **In-Cup performance drops (~5–10% reserved supply)**
   - Moment cards minted post-match for standout performances
   - Awarded to top finishers in previous day's contests

### 2.4 Marketplace

- Fixed price + English auction
- 5% royalty per resale → 4% platform + 1% original first-buyer (novel)
- Native X Layer settlement in USDC

### 2.5 Card metadata schema

```solidity
struct Card {
  uint256 tokenId;
  bytes32 playerId;        // e.g. keccak256("FRA-10-Mbappe")
  uint8   tier;            // 0=Common, 1=Rare, 2=SR, 3=Unique
  uint32  serialNumber;    // within tier, e.g. "Rare #847 of 1000"
  Stats   baseStats;       // pace, shooting, passing, defense, physicality
  string  cosmeticURI;     // IPFS/Arweave art
  uint32  mintBatch;       // pre-Cup vs matchday-N drop
}
```

---

## 3. Rental Market

### 3.1 Core model — delegation (ERC-4907)

NFT does not move during rental. A delegation entry records:

> "For matchday N, tokenId Z grants lineup rights to address Y, until timestamp T."

Game contract checks delegation before accepting lineup commit. Custody stays with owner; gas minimal; auto-expires.

### 3.2 Lease unit

**One matchday only** in MVP. Multi-matchday leases deferred.

### 3.3 Exclusivity rule

**One card NFT = one lineup per matchday.** Enforced by game contract:
```solidity
require(cardLineupOfMatchday[N][tokenId] == address(0), "card already used");
```
This makes the rental market liquid — managers actively shop for un-lineup'd cards.

### 3.4 Pricing — owner picks one of three modes

1. **Fixed price** — "X USDC/matchday"
2. **Floor-pegged** — "2% of current market floor"
3. **Suggested + override** — algo proposes, owner accepts or ±X%

### 3.5 Fee split (per successful rental)

```
Renter pays:   12.00 USDC
  ├── 88% → Owner            (10.56)
  ├── 10% → Platform treasury  (1.20)
  │         ├── 4% prize pool injection
  │         ├── 4% ops + oracle
  │         └── 2% LM rewards
  └──  2% → Original pack-buyer royalty (0.24)
```

### 3.6 DNP Insurance (opt-in, on-chain)

- Renter ticks "Insure this rental" → pays +20% premium
- Oracle confirms player got 0 minutes → 100% rental refund + 50% premium back
- Premium pool socializes risk; surplus → treasury

### 3.7 Edge cases

- **Match postponed/cancelled** → 100% refund to renter, nothing to owner
- **Renter cancels pre-lock** → 90% refund, 10% fee to owner
- **Owner transfers card during active rental** → blocked by contract
- **Stamina inheritance** → rented cards carry owner's stamina state (fatigued cards rent cheaper)

---

## 4. Gameplay (Manager Mode)

### 4.1 Lineup structure

- **11 cards required**; no subs in MVP
- 6 formations available: 4-3-3, 4-4-2, 3-5-2, 4-2-3-1, 3-4-3, 5-3-2
- Cards have a primary position; playing out of position → −15% on all event points

### 4.2 Player traits

Each card has 1 primary + 1 secondary trait. Deterministic per player (Mbappe is always Inside Forward + Winger).

| Position | Sample traits | Event modifier |
|---|---|---|
| GK | Shot-Stopper, Sweeper-Keeper, Penalty Specialist | +20% saves / +10% key passes / +50% penalty saves |
| DEF | Wall, Ball-Playing, Aggressor, Wingback | +15% CS / +25% key passes / +10% tackles / +20% assists |
| MID | Playmaker, Box-to-Box, Ball-Winner, Creator, Anchor | +25% assists / +10% all / +20% tackles / +30% key passes / +15% CS |
| FWD | Poacher, Target Man, Winger, Inside Forward, False 9 | +25% goals / +20% headed / +20% assists / +15% G+A / +15% all attacking |

### 4.3 Formation synergies

| Synergy | Trigger | Bonus |
|---|---|---|
| Wide Play | 2+ Wingers/Wingbacks in 4-3-3 or 3-4-3 | +5% to assists & key passes |
| Iron Wall | 3+ Wall traits in 5-3-2 or 5-4-1 | +10% clean-sheet bonus |
| Tiki-Taka | 3+ Playmakers/Creators in 4-3-3 or 3-5-2 | +8% to midfielder points |
| Counter-Attack | 2+ Poachers + 2+ Ball-Winners | +12% to goal points |
| Brick Defense | 5+ Wall/Sweeper | +15% CS, −5% attacking |

### 4.4 Captain & Vice-Captain

- Captain ×2.0 multiplier on all events
- Vice-Captain ×1.0 (backup) — promotes to ×2.0 only if captain DNPs

### 4.5 Country synergy

| Same-nation cards | Bonus |
|---|---|
| 3 | +5% |
| 5 | +12% |
| 7+ | +20% |

Big ceiling, big risk if that country has a bad day.

### 4.6 Chips (one-use boosters)

Each user gets **4 baseline chips per Cup**, usable once each:
1. **Triple Captain** — captain becomes ×3.0
2. **Doubler** — doubles clean-sheet bonus for all DEF/GK
3. **Wildcard** — fully resets stamina on all your cards
4. **Free Hit** — today's lineup doesn't consume stamina

Extra chips **earnable** from in-Cup performance drops. Tradeable as NFTs but not purchasable from platform (no P2W).

### 4.7 Stamina

- Max 100 per card; lineup costs −30; daily regen +50 when not used
- Above 70 at lineup → "Fresh Legs" +5%
- Below 30 → "Fatigued" −20%
- Drives forced rotation and fuels rental demand

### 4.8 Scoring formula

**Base events:**

| Event | FWD | MID | DEF | GK |
|---|---|---|---|---|
| Goal | +5 | +6 | +8 | +10 |
| Assist | +3 | +3 | +3 | +3 |
| Clean sheet (60+ min) | — | +1 | +4 | +4 |
| Tackle (each, cap +4) | +0.5 | +0.5 | +0.5 | — |
| Key pass (each, cap +3) | +0.3 | +0.3 | +0.3 | — |
| Save (each, cap +5) | — | — | — | +0.5 |
| Penalty saved | — | — | — | +5 |
| Man of the Match | +3 | +3 | +3 | +3 |
| Played 60+ min | +1 | +1 | +1 | +1 |

**Negatives:**
| Yellow | −1 | Red | −3 | Own goal | −2 | Pen missed | −2 | Goal conceded (DEF/GK, per 2) | −1 | DNP | 0 |

### 4.9 Multiplier stacking order

```
raw_event_points
  × tier_bonus           (1.00 / 1.05 / 1.12 / 1.20)
  × trait_modifier       (event-specific)
  × out_of_position      (0.85 if applicable)
  × stamina_modifier     (0.80 / 1.00 / 1.05)
  × captain_multiplier   (1.00 / 2.00 / 3.00)
  × country_synergy      (1.00 / 1.05 / 1.12 / 1.20)
  × formation_synergy    (1.00 / 1.05–1.15)
  × chip_modifier        (varies)
= card_score

lineup_total = Σ card_score for 11 cards
```

### 4.10 Day-after analytics (retention hook)

Post-matchday report per user:
- Your lineup vs the counterfactual "best possible lineup"
- Captain pick vs best possible captain
- Chip-use efficiency rating
- Trait-synergy heatmap
- Global decile rank + within-tier rank

---

## 5. Contest Structure

### 5.1 Free track

- Common-tier-only lineups
- Free entry
- Prize source: 4% rental fees + 5% pack revenue + 10% marketplace fees + optional sponsor injection
- Rewards: USDC + Chip NFTs + (top 0.1%) Rare card drops

### 5.2 Paid track

Tier-gated daily contests:

| Contest | Entry | Eligible cards |
|---|---|---|
| Common Open | $1 | Common+ |
| Rare+ Open | $10 | Rare+ |
| Super Rare+ Open | $50 | SR+ |
| Whale Pool | $250 | Unique-only |

Pool math:
```
1000 entries × $10 = $10,000 pool
  − 8% rake ($800 platform)
  = $9,200 → top 25% of finishers
```

Prize curve:
- 1st: 15% / 2nd: 8% / 3rd: 5% / 4–10: 2.5% each / 11–50: 0.5% each / 51–250: 0.15% each

Rake split (8%):
- 4% ops + oracle
- 2% season pool
- 2% LM rewards

### 5.3 Contest formats (MVP)

1. **Daily Public Leaderboard** (free + paid versions)
2. **Private Leagues** — 6-char invite code, friends-only — (v1.5)
3. **Season-Long Leaderboard** — aggregated all 28 days

### 5.4 Season-long leaderboard

- Aggregates every matchday score from Day 1 → Final
- Top 100 paid from 2% rake accumulation pool
- #1 receives a 1-of-1 ceremonial Unique NFT ("World Cup Manager 2026")

### 5.5 Anti-Sybil guardrails

- 1 entry per wallet per contest
- Paid contests: wallet must have non-trivial on-chain history OR have paid $X gas on X Layer
- Captcha + signed message at signup
- Same-lineup detection across wallets flags for review

---

## 6. On-chain Architecture & Tech Stack

### 6.1 What's on X Layer vs off-chain

| Layer | On X Layer | Off-chain |
|---|---|---|
| Card NFTs (ERC-721 + 4907) | ✓ | |
| Pack sales + VRF | ✓ | |
| Marketplace | ✓ | |
| Rental delegations | ✓ | |
| Lineup commits | ✓ | |
| Stamina state | ✓ | |
| Chip allocation & usage | ✓ | |
| Contest entry escrow | ✓ | |
| Insurance pool | ✓ | |
| Score Merkle root | ✓ | |
| Payout claims | ✓ | |
| Card art | | ✓ IPFS/Arweave |
| Match data ingest | | ✓ |
| Score computation | | ✓ deterministic |
| Live scoring | | ✓ websocket |
| Leaderboards UI | | ✓ indexer |

### 6.2 Smart contracts (10 total)

```
CardNFT.sol            — ERC-721 + ERC-4907
ChipNFT.sol            — ERC-1155 chip allocations & burns
PackSale.sol           — VRF mints, tier pulls
Marketplace.sol        — fixed-price + auctions
RentalMarket.sol       — 4907 delegations + insurance opt-in
GameRegistry.sol       — lineup commits, captain, stamina, chip use
InsurancePool.sol      — DNP premiums + refunds
ContestEscrow.sol      — entry fees + Merkle-proof payouts
ScoreOracle.sol        — multi-sig signers + Merkle root commits
SeasonLeaderboard.sol  — aggregates daily roots, end-of-Cup payout
```

### 6.3 Score commitment pattern

1. Oracle off-chain: ingests match data, computes scores per lineup
2. Builds Merkle tree of (wallet → score → payout)
3. Multi-sig posts Merkle ROOT on-chain
4. Users claim by submitting their leaf + proof
5. Unclaimed funds after N days → next pool

Standard Uniswap/Optimism-style pattern. Replicable: anyone re-runs the formula to verify root.

### 6.4 Oracle architecture

**MVP:** 3-of-5 multi-sig (2 project, 2 ecosystem partners, 1 community-elected post-launch)

**v2:** migrate to Chainlink Functions pulling from Opta/StatsPerform + optimistic challenge window

### 6.5 Data feed

- Primary: **API-Football** (real WC 2026 stats, reasonable pricing)
- Backup: SportRadar trial / FotMob scraping
- Long-term: Opta or StatsPerform partnership

### 6.6 Tech stack

**Frontend**
- Next.js (App Router) + TypeScript
- Tailwind + shadcn/ui
- Framer Motion (card animations, lineup builder)
- React Query
- wagmi + viem
- OKX Wallet first-class, plus MetaMask / WalletConnect

**Backend**
- Bun + Hono
- PostgreSQL (game state, leaderboards, match data)
- Redis (live scoring, sessions)
- Custom event indexer for X Layer (ponder/envio-style)
- WebSocket layer for live updates
- Cron workers for matchday lifecycle

**Smart contracts**
- Solidity ≥ 0.8.24
- Foundry for tests + deploy
- OpenZeppelin libraries
- ERC-4907 reference implementation

**Off-chain workers**
- Match-data ingester (API-Football poll)
- Score computation engine
- Oracle signer service (one per signer)
- Insurance resolver

### 6.7 X Layer / OKX-specific integrations

- **OnchainOS `okx-dex-swap`** — accept entry fees in any token, auto-swap to USDC
- **OnchainOS `okx-security`** — pre-trade risk scan on marketplace (wash-trade warnings)
- **OnchainOS `okx-agentic-wallet`** — AI agents can rent + play autonomously (Build X agent track angle)

### 6.8 Network info

- Mainnet — chain ID `196` (0xC4), RPC `https://rpc.xlayer.tech`
- Testnet — chain ID `1952` (0x7A0), RPC `https://testrpc.xlayer.tech`
- Gas token: OKB

---

## 7. MVP Scope

### 7.1 v1 (must-ship)

1. CardNFT contract + 4 tiers + supply caps
2. PackSale (Bronze, Silver, Gold; Diamond + Unique deferred)
3. Marketplace (fixed-price only)
4. RentalMarket with 4907 + fixed/floor-pegged pricing
5. GameRegistry (lineup, captain, stamina, baseline chip use)
6. ScoreOracle (multi-sig + Merkle)
7. ContestEscrow (free + 1 paid tier — Common Open $1)
8. SeasonLeaderboard (aggregation, end-of-Cup payout)
9. Frontend: marketplace browse, rental browse, lineup builder, contest entry, live scoring, day-after report
10. Backend: data ingest, score engine, oracle signer, indexer

### 7.2 v1.5 (post-launch additions)

- DNP insurance product
- Auction-based marketplace
- Diamond + Unique pack tiers
- Private leagues
- Earned chip drops
- Additional paid tier contests (Rare+, SR+, Whale Pool)

### 7.3 v2 (post-Cup / next season)

- 4-card bench + Bench Boost chip
- Head-to-Head duels
- Country / Faction pools
- Moment cards (in-Cup NFT drops)
- Native mobile app
- Cross-game card composability

---

## 8. Risk Register

| Risk | Severity | Mitigation |
|---|---|---|
| Oracle inaccuracy | High | Multi-source validation, dispute window pre-payout, transparent re-compute |
| VRF availability on X Layer | Medium | Fallback to 2-block commit-reveal |
| Indexer infra | Medium | Custom ponder-style if The Graph unavailable |
| Live scoring latency | Medium | Edge-cached websocket, polling fallback |
| Onboarding friction | High | Free Starter Squad + low X Layer gas + meta-tx if needed |
| Regulatory (DFS classification) | High | Geofence high-risk jurisdictions in MVP; legal review pre paid-tier launch |
| Match postponements | Low | Automatic refund flow |
| Whale dominance | Medium | Tier-gated contests + entry caps |
| Card art production cost | Medium | Stylized template vs photo-rights — early decision needed |

---

## 9. Project Roadmap & Task Breakdown

Work is grouped into 7 streams. Streams can be parallelized once foundations are laid. Each task is sized for a working session (a few hours to a few days).

### Stream A — Foundations

- [ ] **A1.** Set up monorepo (pnpm workspaces): `apps/web`, `apps/api`, `apps/oracle`, `apps/indexer`, `packages/contracts`, `packages/shared-types`
- [ ] **A2.** Initialize Foundry project in `packages/contracts`, install OpenZeppelin + ERC-4907 reference
- [ ] **A3.** Initialize Next.js app with TypeScript, Tailwind, shadcn/ui
- [ ] **A4.** Wire wagmi + viem with X Layer testnet config (chain ID 1952)
- [ ] **A5.** Set up CI: lint, typecheck, contract tests, unit tests per workspace
- [ ] **A6.** Provision Postgres + Redis for local dev (docker-compose)
- [ ] **A7.** Decide on a project name + register domain + create X account tagging @XLayerOfficial
- [ ] **A8.** Design system: pick a visual direction (stylized vs photo-based card art) and produce 5-10 sample cards as a style guide

### Stream B — Smart Contracts

Tasks tagged `[v1]` ship in the initial launch; `[v1.5]` ship in the post-launch update; `[v2]` is the second season.

**v1 contracts:**
- [ ] **B1.** `[v1]` `CardNFT.sol` — ERC-721 + ERC-4907, metadata struct, mint with tier + supply cap enforcement
- [ ] **B2.** `[v1]` `CardNFT` test suite — minting, transfers, supply caps, 4907 delegation flows
- [ ] **B3.** `[v1]` `ChipNFT.sol` — ERC-1155, baseline chip allocation + burn-on-use logic (earned drops are v1.5)
- [ ] **B4.** `[v1]` `PackSale.sol` — Bronze/Silver/Gold pack tiers only, VRF integration (or commit-reveal fallback), reveal flow
- [ ] **B5.** `[v1]` `PackSale` test suite — pack purchase, randomness, tier distribution
- [ ] **B6.** `[v1]` `Marketplace.sol` — fixed-price listings only, buy, royalty enforcement (4% platform / 1% original buyer)
- [ ] **B7.** `[v1]` `RentalMarket.sol` — list-for-rent (3 pricing modes), rent (escrow USDC, set 4907), settle, refund flows. **No insurance hook in v1** — that's v1.5.
- [ ] **B8.** `[v1]` `RentalMarket` test suite — full lifecycle, edge cases (cancel, postpone, conflict)
- [ ] **B9.** `[v1]` `GameRegistry.sol` — lineup commit, captain/VC, chip use, stamina state per (cardId)
- [ ] **B10.** `[v1]` `GameRegistry` test suite — exclusivity enforcement, stamina math, chip burns
- [ ] **B11.** `[v1]` `ScoreOracle.sol` — multi-sig posting of Merkle roots, signer rotation
- [ ] **B12.** `[v1]` `ContestEscrow.sol` — entry fee escrow, Merkle-proof payout claim, rake split. Initially configured for Free + Common Open ($1) only.
- [ ] **B14.** `[v1]` `SeasonLeaderboard.sol` — root aggregation, end-of-Cup payout flow

**v1.5 contracts (additions/extensions):**
- [ ] **B13.** `[v1.5]` `InsurancePool.sol` — DNP premium collection, refund on oracle attestation
- [ ] **B6a.** `[v1.5]` `Marketplace.sol` extension — English auction listings + anti-snipe
- [ ] **B4a.** `[v1.5]` `PackSale.sol` extension — Diamond pack tier with guaranteed Unique
- [ ] **B12a.** `[v1.5]` `ContestEscrow.sol` config — enable Rare+ Open, Super Rare+ Open, Whale Pool tiers
- [ ] **B3a.** `[v1.5]` `ChipNFT.sol` extension — in-Cup performance drop minting hooks

**Deployment & audit (apply to whichever version is shipping):**
- [ ] **B15.** Full integration test suite — matchday end-to-end flow on local fork (covering v1 surface)
- [ ] **B16.** Deploy v1 contracts to X Layer testnet
- [ ] **B17.** Pre-mainnet security audit — provider chosen per Open Decisions §11 #9
- [ ] **B18.** Deploy v1 contracts to X Layer mainnet
- [ ] **B19.** `[v1.5]` Audit + deploy v1.5 contracts/extensions to testnet → mainnet

### Stream C — Off-chain Services

- [ ] **C1.** `[v1]` Match-data ingester service — polls API-Football, normalizes to internal event schema, writes to Postgres
- [ ] **C2.** `[v1]` Score-computation engine — deterministic formula implementation (Section 4.9), unit tests against fixture matches
- [ ] **C3.** `[v1]` Replicable score-verification tool — CLI for anyone to re-run the formula given inputs
- [ ] **C4.** `[v1]` Oracle signer service — one per signer; reads scores, computes Merkle tree, signs root, submits to multi-sig
- [ ] **C5.** `[v1.5]` Insurance resolver — checks DNP from oracle data, triggers refund attestations
- [ ] **C6.** `[v1]` Indexer service — listens to X Layer events (transfers, mints, listings, rentals, lineups), writes to Postgres
- [ ] **C7.** `[v1]` Live-scoring websocket server — pushes running scores during matches
- [ ] **C8.** `[v1]` Matchday lifecycle cron — opens window, locks lineups, triggers oracle post, opens claim window

### Stream D — Frontend

- [ ] **D1.** Wallet connect flow (OKX Wallet primary, MetaMask + WalletConnect fallback)
- [ ] **D2.** Signup + onboarding — claim Starter Squad airdrop
- [ ] **D3.** Card detail page — stats, traits, tier, rental availability, listing
- [ ] **D4.** Marketplace browse — filter by player, country, tier, position, price
- [ ] **D5.** Rental browse — same filters + stamina + availability for next matchday
- [ ] **D6.** Pack purchase + reveal animation
- [ ] **D7.** Lineup builder — drag-drop formation picker, captain selection, chip use, stamina display, validation
- [ ] **D8.** `[v1]` Contest selector — free + paid tier (Common Open). `[v1.5]` extend with additional paid tiers + private-league join flow.
- [ ] **D9.** Live scoring screen — running points per card, leaderboard movement, websocket-fed
- [ ] **D10.** Day-after report — counterfactuals, decile rank, chip efficiency
- [ ] **D11.** Profile / portfolio — owned cards, active rentals (in + out), career stats
- [ ] **D12.** Season leaderboard
- [ ] **D13.** Settings, gas estimator, claim payouts flow

### Stream E — Content & Data

- [ ] **E1.** Player taxonomy — finalize trait assignments for all ~1,300 players (data file in repo)
- [ ] **E2.** Base stats table per player (initial values; can be updated pre-Cup)
- [ ] **E3.** Card art production — pipeline to generate 1,300 × 4 tier variants (decide stylized vs photo)
- [ ] **E4.** Country / team metadata — flags, kits, federation contacts (for charity-split angle)
- [ ] **E5.** Fixture data — full WC 2026 match schedule loaded into game DB
- [ ] **E6.** Static landing page + brand collateral

### Stream F — Compliance & Trust

- [ ] **F1.** Legal review on DFS classification — list jurisdictions to geofence
- [ ] **F2.** Geofencing implementation (paid contest gating by IP + wallet checks)
- [ ] **F3.** ToS / Privacy Policy / fair-play rules drafting
- [ ] **F4.** Oracle signer agreements — written commitments from each external partner signer
- [ ] **F5.** Bug bounty program setup (post-audit)
- [ ] **F6.** Incident response playbook (oracle disagreement, data outage, contract pause)

### Stream G — Launch & Operations

- [ ] **G1.** Marketing site
- [ ] **G2.** Community: Discord + X account ops, Build X Telegram presence
- [ ] **G3.** Closed beta (testnet) with feedback loop
- [ ] **G4.** Pre-Cup pack sale launch
- [ ] **G5.** Monitoring + alerting (Grafana, Sentry, on-call rotation)
- [ ] **G6.** Daily ops checklist during Cup (oracle sanity, claim window, support)

### 9.1 Dependency order (critical path)

```
A (foundations)
  ├── B (contracts, sequential within stream)
  │     └── B16 testnet deploy → C, D can integrate
  ├── C (services) ──┐
  ├── D (frontend) ──┼── all converge for closed beta (G3)
  ├── E (content) ───┘
  └── F (compliance, parallel)
                          ↓
                          v1 launch
```

---

## 10. Resources

### 10.1 Official OKX / X Layer

- Build X Hackathon home: https://web3.okx.com/xlayer/build-x-hackathon
- xCup track page: https://web3.okx.com/xlayer/build-x-hackathon/xcup
- X Layer Developer Docs: https://web3.okx.com/xlayer/docs/developer/
- X Layer Network Info: https://web3.okx.com/xlayer/docs/developer/build-on-xlayer/network-information
- X Layer RPC endpoints: https://web3.okx.com/xlayer/docs/developer/rpc-endpoints/rpc-endpoints
- X Layer block explorer: https://www.oklink.com/xlayer
- Exchange OS overview: https://www.okx.com/en-us/learn/exchange-os

### 10.2 OKX developer skills (for AI-assisted development & integrations)

- `okx/onchainos-skills` (wallet, DEX swap, market data, security): https://github.com/okx/onchainos-skills
- `okx/agent-skills` (CEX-side skills, optional): https://github.com/okx/agent-skills
- Hackathon agent track plugin: https://web3.okx.com/onchainos/plugins/detail/okx-buildx-hackathon-agent-track
- Moltbook (agent-native social): https://moltbook.com

### 10.3 Smart contract standards & libraries

- ERC-721: https://eips.ethereum.org/EIPS/eip-721
- ERC-4907 (rentable NFTs): https://eips.ethereum.org/EIPS/eip-4907
- ERC-1155: https://eips.ethereum.org/EIPS/eip-1155
- OpenZeppelin Contracts: https://github.com/OpenZeppelin/openzeppelin-contracts
- Foundry: https://book.getfoundry.sh/
- Chainlink VRF (if available on X Layer): https://docs.chain.link/vrf/v2/introduction

### 10.4 Football data sources

- API-Football (primary candidate, freemium): https://www.api-football.com/
- SportRadar: https://sportradar.com/
- StatsPerform / Opta (gold standard, enterprise): https://www.statsperform.com/
- FotMob (unofficial fallback): https://www.fotmob.com/

### 10.5 Frontend stack

- Next.js: https://nextjs.org/
- wagmi: https://wagmi.sh/
- viem: https://viem.sh/
- shadcn/ui: https://ui.shadcn.com/
- Tailwind CSS: https://tailwindcss.com/
- Framer Motion: https://www.framer.com/motion/

### 10.6 Backend / infra

- Bun: https://bun.sh/
- Hono: https://hono.dev/
- ponder (indexer): https://ponder.sh/
- envio (indexer alt): https://envio.dev/
- The Graph: https://thegraph.com/

### 10.7 Reference projects (for design inspiration, not code copying)

- Sorare: https://sorare.com/ — NFT football cards, fantasy with weekly scoring
- Fantasy Premier League: https://fantasy.premierleague.com/ — gold-standard fantasy mechanics (chips, captain, transfers)
- DraftKings DFS: https://www.draftkings.com/ — DFS contest UX, salary-cap drafts
- NBA Top Shot: https://nbatopshot.com/ — Moment NFTs, tiered scarcity
- Axie Infinity scholarships: https://axieinfinity.com/ — rental/lease primitives that inspired ERC-4907

### 10.8 Project memory & spec location

- Memory: `~/.claude/projects/-Users-romariokavin-Documents-PersonalProjects-OkX-hackathon/memory/`
- This spec: `docs/superpowers/specs/2026-05-28-football-card-fantasy-design.md`
- Hackathon context reference: `HACKATHON_CONTEXT.md` (project root)

---

## 11. Open Decisions

Things to lock in before serious coding:

1. **Project name** — placeholder "ManagerCup"; need a final brand
2. **Card art direction** — stylized illustration (defensible, brand-distinctive, slower) vs photo-based (faster, photo rights-heavy)
3. **Player likeness rights** — direct partnerships, FIFPro license, or stylized renderings that sidestep rights issues
4. **Oracle external signers** — identify the 2 ecosystem partners willing to run a signer
5. **Sponsor / brand partnerships** — OKX ecosystem grant? Brand sponsors funding the free prize pool?
6. **Federation/charity split for Unique auctions** — pick partner federations or a single charity org
7. **Geofencing list** — which jurisdictions to exclude from paid tier (US states, EU member states with specific rules)
8. **VRF source on X Layer** — confirm Chainlink VRF availability; if not, commit-reveal design parameters
9. **Audit firm** — pre-mainnet audit budget + provider
10. **Pack pricing** — exact prices for Bronze/Silver/Gold/Diamond packs

---

## 12. Success Criteria

What "done" looks like for v1:

- 1,300+ unique cards live on X Layer mainnet across 4 tiers
- Paid contests operating without disputes for one full Cup matchday
- Rental market shows ≥30% of lineup'd cards are rentals (proving the on-chain primitive is used in practice)
- Oracle multi-sig posts Merkle roots within 90 minutes of last whistle every matchday
- Sub-30-second wallet → first lineup commit for a new user
- Zero security incidents through Cup duration

---

*End of design spec. Next step: hand to writing-plans skill to produce a detailed, step-by-step implementation plan starting from Stream A.*
