# Product Requirements Document

> **Product:** ManagerCup (working title) — World Cup fantasy football card game on X Layer
> **Status:** Draft v1 — pending stakeholder review
> **Owner:** Romario Kavin
> **Companion docs:** Design spec at `docs/superpowers/specs/2026-05-28-football-card-fantasy-design.md`; hackathon framing at `HACKATHON_CONTEXT.md`

---

## 1. Vision

A daily-cadence fantasy football game for the 2026 FIFA World Cup that combines the **strategic depth of Fantasy Premier League**, the **collectible economy of Sorare**, and a **native on-chain rental market** that no off-chain product can replicate. Built on OKX's X Layer with real USDC stakes, programmable card leases, and trustless oracle-settled scoring.

The product wins by giving football fans something neither web2 nor existing web3 fantasy products give them: real ownership of cards, real strategic gameplay, real prize money, and a marketplace that lets non-whales participate by renting stars for one matchday at a time.

---

## 2. Problem Statement

Football fans have two unsatisfying choices today:

**Web2 fantasy (FPL, DraftKings DFS)** has deep gameplay but no ownership: cards aren't real, you can't trade them, the operator holds your money in custody, and there's no after-life for assets when a season ends.

**Web3 fantasy (Sorare and clones)** has ownership but shallow gameplay: pick the best card, captain it, watch scores. No formations, no traits, no chips, no stamina, no skill ceiling. Plus high entry cost — to be competitive you need to own valuable cards.

Neither solves the **affordability gap** for the casual fan during the World Cup window: a player wants to play *now*, against their friends, with stars they don't own and can't justify buying outright.

We solve all three at once: real ownership, real gameplay depth, and a rental market that turns a $5 budget into a competitive lineup.

---

## 3. Goals & Non-Goals

### 3.1 Product Goals

| # | Goal | How we know we succeeded |
|---|---|---|
| G1 | Make a fantasy game with **enough strategic depth** that skilled players consistently beat unskilled ones | Skill correlation: top 5% of season leaderboard contains <1% of one-time-lucky users |
| G2 | Give cards a **real on-chain reason to exist** | ≥30% of cards in daily lineups are rentals, not owned (proves the rental primitive is used) |
| G3 | **Open the door** to non-whale players via free starter squad + cheap rentals | Median spend-to-first-lineup ≤ $5 |
| G4 | **Real-money stakes** with **trustless** settlement | Zero operator-custody disputes; 100% of payouts resolved on-chain via Merkle proofs |
| G5 | **World Cup–native engagement** — daily contests tied 1:1 to real matchdays | Daily active rate during Cup ≥40% of registered users |
| G6 | **Cards retain value beyond the Cup** | Active secondary marketplace 90 days after Cup final |

### 3.2 Non-Goals (v1)

- ❌ Not a casino / sportsbook — no direct match-outcome betting
- ❌ Not a generic fantasy platform — World Cup focus only in v1 (other competitions are post-Cup roadmap)
- ❌ Not a mobile-first product in v1 — responsive web first; native app is v2
- ❌ Not a multi-chain product — X Layer only in v1
- ❌ Not a custody product — users hold their own keys; no platform wallet
- ❌ Not a DAO / governance token — focused product, no token launch in v1

---

## 4. Target Users

### 4.1 Primary Personas

**P1 — The Manager ("competitive fantasy player")**
- *Profile:* 25–40, follows FPL or DFS, plays daily during football season, comfortable spending $5–$50/month on fantasy
- *Crypto comfort:* low to medium — has a wallet but isn't a DeFi power user
- *Motivation:* skill expression, leaderboard climbing, beating friends, real prize money
- *Pain points:* tired of FPL's stale meta; doesn't want to spend $1k on Sorare cards just to play
- *Sample journey:* "I have $20 and want to compete this Saturday — what's the best lineup I can field?"

**P2 — The Collector ("NFT-native investor")**
- *Profile:* 28–45, already owns NFTs (PFPs, Sorare, NBA Top Shot), follows crypto markets
- *Crypto comfort:* high
- *Motivation:* acquisition of scarce / iconic cards, passive yield from rentals, market speculation
- *Pain points:* idle NFT collections that don't generate yield; missed Sorare's early days and wants to be early on something good
- *Sample journey:* "I'll buy a Diamond pack pre-Cup, target a Unique Mbappe, list him for rent every matchday."

**P3 — The Fan ("casual World Cup viewer")**
- *Profile:* 18–60, watches football mostly during international tournaments, doesn't usually play fantasy
- *Crypto comfort:* near zero — needs a near-frictionless onboarding
- *Motivation:* extra engagement with World Cup matches, casual social play with friends, low-stakes fun
- *Pain points:* fantasy seems intimidating; doesn't trust crypto; doesn't want to "lose money"
- *Sample journey:* "My friend told me about this game — I just want to pick 11 Brazil players and see how I do."

### 4.2 Persona Coverage by Product Surface

| Persona | Free track | Paid track | Marketplace | Rentals |
|---|---|---|---|---|
| Manager (P1) | secondary | **primary** | secondary | **primary** (renter) |
| Collector (P2) | minimal | secondary | **primary** | **primary** (owner) |
| Fan (P3) | **primary** | minimal | minimal | secondary (renter) |

The product must work end-to-end for all three, even though they barely overlap in motivation.

---

## 5. Success Metrics

### 5.1 North-Star Metric

**Daily Active Lineups (DAL)** during the Cup window. Single metric that captures whether the product is actually being played at the cadence we designed for.

### 5.2 Supporting KPIs

| Category | Metric | Target (v1) |
|---|---|---|
| Acquisition | Registered users by Cup kickoff | ≥ 50,000 |
| Acquisition | Pre-Cup pack revenue | ≥ $250,000 |
| Activation | Median time from signup → first lineup commit | ≤ 30 seconds |
| Activation | % of new signups completing first lineup | ≥ 60% |
| Engagement | Daily Active Lineups during group stage | ≥ 15,000 |
| Engagement | Avg lineups per user per matchday | ≥ 1.5 (free + paid combined) |
| Economy | Rental volume per matchday | ≥ $20,000 USDC |
| Economy | % of in-lineup cards that are rentals | ≥ 30% |
| Economy | Marketplace volume per week | ≥ $100,000 USDC |
| Retention | D7 retention from signup | ≥ 50% |
| Retention | % of users active across all 7 Cup stages | ≥ 25% |
| Monetization | Paid contest entries per matchday | ≥ 3,000 |
| Monetization | Avg paid contest entry value | ≥ $5 |
| Trust | Oracle commits posted within 90 min of last whistle | 100% |
| Trust | Score disputes / disagreements | 0 critical, ≤ 3 minor per Cup |

### 5.3 Counter-Metrics (don't go up)

- Whale concentration: top 1% of wallets own <30% of all in-circulation Rare+ cards
- Sybil ratio: <5% of free-tier prize payouts flagged as multi-account
- Drop-off after first matchday: <40% (means onboarding is broken if higher)

---

## 6. User Stories

### 6.1 Onboarding

- **US-01:** As a new user, I can connect my OKX Wallet and receive a free 5-card Starter Squad in under 30 seconds, so I can immediately enter a free contest.
- **US-02:** As a new user without crypto, I see clear instructions for getting OKB gas via OKX exchange or a partner on-ramp.

### 6.2 Free Track

- **US-03:** As a casual fan, I can enter the daily free contest using only the cards I own and cheap rentals (≤$0.30 each).
- **US-04:** As a free-track winner, I can claim my USDC prize and any Chip NFT rewards directly to my wallet without paying gas above a reasonable threshold.

### 6.3 Card Economy

- **US-05:** As a collector, I can buy pre-Cup packs (Bronze / Silver / Gold) and reveal them with provable randomness.
- **US-06:** As a collector, I can list my cards for rent in three pricing modes (fixed / floor-pegged / suggested) and earn 88% of the rental fee.
- **US-07:** As any user, I can list a card for sale at fixed price; royalties (4% platform + 1% original buyer) are enforced on-chain.
- **US-08:** As any user, I can browse the marketplace with filters (player, country, tier, position, price) and see verified scarcity counts.

### 6.4 Rental Market

- **US-09:** As a renter, I can rent any un-lineup'd available card for a single matchday, paying USDC upfront.
- **US-10:** As a renter, I can opt into DNP insurance (v1.5) at a 20% premium for full refund if the player doesn't play.
- **US-11:** As a renter, I can cancel pre-lock for a 90% refund.
- **US-12:** As an owner, I can flip "auto-list at floor%" to passively rent out idle cards across all matchdays.
- **US-13:** As any user, I see clear UX that a card is either OWN, RENTING-OUT, RENTING-IN, or LOCKED-IN-LINEUP at any time.

### 6.5 Lineup & Gameplay

- **US-14:** As a manager, I can pick a formation, drag 11 cards into position slots, set a captain and vice-captain, and apply one chip.
- **US-15:** As a manager, I see real-time validation: country synergy bonus active? formation synergy triggered? stamina warnings on tired cards?
- **US-16:** As a manager, I commit my lineup before the daily lock and see a confirmation with all multipliers shown.
- **US-17:** As a manager, during matches I watch a live score ticker for each of my 11 cards updating with multipliers applied.
- **US-18:** As a manager, after the matchday closes I see a day-after report: my decile rank, my counterfactual best possible lineup, captain efficiency, trait synergy heatmap.

### 6.6 Paid Contests

- **US-19:** As a manager, I can enter any open paid contest by approving USDC and committing my lineup.
- **US-20:** As a paid-contest entrant, I see the live prize pool growing and my projected payout based on current rank.
- **US-21:** As a winner, I claim my prize via on-chain Merkle proof submission.

### 6.7 Season-Long Play

- **US-22:** As a long-term player, my daily scores accumulate into a season leaderboard ranked across the whole Cup.
- **US-23:** As the season #1 finisher, I receive a 1-of-1 ceremonial Unique NFT and the top-tier season prize.

### 6.8 Trust & Verification

- **US-24:** As a skeptical user, I can re-run the deterministic scoring formula against any matchday's data and verify my score matches the on-chain commit.
- **US-25:** As a user, I see clearly which trust assumptions exist (oracle multi-sig signers, data feed source) on a dedicated transparency page.

---

## 7. Functional Requirements

### 7.1 Cards

| ID | Requirement | Priority |
|---|---|---|
| FR-C1 | Cards are ERC-721 NFTs on X Layer | Must |
| FR-C2 | Cards implement ERC-4907 rentable extension | Must |
| FR-C3 | 4 rarity tiers (Common / Rare / Super Rare / Unique) with hard supply caps per (player, tier) | Must |
| FR-C4 | Stats are deterministic per (player, tier) — no per-card RNG within a tier | Must |
| FR-C5 | Each card has 1 primary + 1 secondary trait, deterministic per player | Must |
| FR-C6 | Card metadata includes serial number, mint batch, cosmetic URI | Must |
| FR-C7 | No upgrade path — Common can never become Rare, etc. | Must |
| FR-C8 | No burn mechanic in v1 — supply is fixed at mint | Must |

### 7.2 Pack Sales

| ID | Requirement | Priority |
|---|---|---|
| FR-P1 | Pack purchase in USDC, randomness via VRF (or commit-reveal fallback) | Must |
| FR-P2 | Bronze / Silver / Gold packs available in v1 | Must |
| FR-P3 | Diamond pack with guaranteed Unique in v1.5 | Should |
| FR-P4 | Pack pull rates published and on-chain verifiable | Must |
| FR-P5 | Pack reveal animation in UI | Must |

### 7.3 Marketplace

| ID | Requirement | Priority |
|---|---|---|
| FR-M1 | Fixed-price listings in USDC | Must |
| FR-M2 | English auctions with anti-snipe | Should (v1.5) |
| FR-M3 | 5% royalty (4% platform + 1% original buyer) enforced on-chain | Must |
| FR-M4 | Filters: player, country, tier, position, price | Must |
| FR-M5 | Wash-trade detection via OKX Security skill integration | Should |

### 7.4 Rentals

| ID | Requirement | Priority |
|---|---|---|
| FR-R1 | Per-matchday delegations via ERC-4907 | Must |
| FR-R2 | Three pricing modes: fixed / floor-pegged / algorithmic-suggested | Must |
| FR-R3 | Owner / Platform / Original-buyer fee split (88% / 10% / 2%) enforced on-chain | Must |
| FR-R4 | Exclusivity: one card = one lineup per matchday | Must |
| FR-R5 | Auto-list at floor% toggle for passive rental income | Must |
| FR-R6 | DNP insurance opt-in (20% premium, 100% refund + 50% premium back) | Should (v1.5) |
| FR-R7 | Auto-refund on match postponement / cancellation | Must |
| FR-R8 | 90% refund if renter cancels pre-lock | Must |
| FR-R9 | Stamina state inherited by renter | Must |

### 7.5 Gameplay

| ID | Requirement | Priority |
|---|---|---|
| FR-G1 | 11-card lineup commit per matchday (no subs in v1) | Must |
| FR-G2 | 6 formations available: 4-3-3, 4-4-2, 3-5-2, 4-2-3-1, 3-4-3, 5-3-2 | Must |
| FR-G3 | Captain (×2) and Vice-Captain (backup) selection | Must |
| FR-G4 | Country synergy bonuses (3/5/7+ cards from same nation) | Must |
| FR-G5 | Formation synergies (Wide Play, Iron Wall, Tiki-Taka, Counter-Attack, Brick Defense) | Must |
| FR-G6 | 4 baseline chips per user per Cup (Triple Captain, Doubler, Wildcard, Free Hit) | Must |
| FR-G7 | Stamina mechanic (cost 30, regen 50, Fresh Legs +5%, Fatigued −20%) | Must |
| FR-G8 | Out-of-position penalty (−15% on all events) | Must |
| FR-G9 | Earned chip drops from in-Cup performance | Should (v1.5) |
| FR-G10 | 4-card bench + Bench Boost chip | Could (v2) |

### 7.6 Scoring

| ID | Requirement | Priority |
|---|---|---|
| FR-S1 | Deterministic event-based scoring per Section 4.8 of design spec | Must |
| FR-S2 | Multiplier stacking order documented and replicable | Must |
| FR-S3 | Live scoring during matches via websocket | Must |
| FR-S4 | Final scores committed as Merkle root on X Layer within 90 min of last whistle | Must |
| FR-S5 | Public verifier CLI for anyone to re-run formula | Must |
| FR-S6 | Day-after report with counterfactual analysis | Must |

### 7.7 Contests

| ID | Requirement | Priority |
|---|---|---|
| FR-CT1 | Free daily Common-tier-only contest | Must |
| FR-CT2 | Paid Common Open contest at $1 entry in v1 | Must |
| FR-CT3 | Paid Rare+ / Super Rare+ / Whale Pool contests | Should (v1.5) |
| FR-CT4 | Season-long aggregate leaderboard | Must |
| FR-CT5 | Private leagues with 6-char invite codes | Should (v1.5) |
| FR-CT6 | Head-to-Head duels | Could (v2) |
| FR-CT7 | Prize payouts via Merkle proof claim | Must |
| FR-CT8 | Unclaimed prize rollover policy (N days, then next pool) | Must |
| FR-CT9 | Anti-Sybil: 1 entry per wallet per contest + funded-wallet checks | Must |
| FR-CT10 | Same-lineup detection across wallets flags for manual review | Should |

### 7.8 Onboarding & Wallet

| ID | Requirement | Priority |
|---|---|---|
| FR-O1 | OKX Wallet first-class connect | Must |
| FR-O2 | MetaMask + WalletConnect support | Must |
| FR-O3 | Free 5-card Starter Squad airdrop on first signup | Must |
| FR-O4 | OnchainOS DEX-swap integration for paying entry fees in any token | Should |
| FR-O5 | Tutorial flow / interactive walkthrough for first lineup | Must |
| FR-O6 | Wallet-state UX (Connected / Insufficient Gas / Insufficient USDC) | Must |

### 7.9 Trust & Transparency

| ID | Requirement | Priority |
|---|---|---|
| FR-T1 | Public transparency page documenting oracle signers, data source, formula | Must |
| FR-T2 | All scoring inputs (match data) preserved publicly for re-verification | Must |
| FR-T3 | Smart contract addresses + audit reports linked from product UI | Must |
| FR-T4 | Disagreement / dispute reporting flow | Must |

---

## 8. Non-Functional Requirements

### 8.1 Performance

- Page TTI (Time to Interactive) ≤ 2.5s on median 4G mobile
- Lineup commit confirmation ≤ 10s end-to-end (sign + broadcast + indexer ack)
- Live score push latency ≤ 5s from real-world event to UI update
- Marketplace browse: 100ms server response for filter+sort queries

### 8.2 Reliability

- 99.5% uptime during Cup window; 99.9% uptime during the 30-minute pre-lock window each day
- Oracle multi-sig posts Merkle root ≤ 90 min after last whistle, every matchday
- Indexer lag ≤ 30s behind chain head during matches

### 8.3 Security

- Pre-mainnet third-party audit covering all 10 contracts
- Public bug bounty post-launch
- Operational incident playbook: oracle disagreement, data outage, contract pause
- No admin-callable functions that can transfer user assets without their signature
- Multi-sig governance on any contract upgrade / parameter change

### 8.4 Privacy & Compliance

- No PII required for free-tier participation beyond wallet address
- KYC required only above paid-contest thresholds (jurisdiction-dependent)
- Geofencing for restricted jurisdictions (US states with DFS bans, EU member states with specific rules)
- GDPR-compliant data handling for any optional account features (email, username)
- ToS, Privacy Policy, Fair-Play rules published before launch

### 8.5 Accessibility

- WCAG 2.1 AA compliance for core flows (signup, lineup commit, claim)
- Color-blind safe palette for stat bars and synergy indicators
- Keyboard navigation for lineup builder

### 8.6 Scalability

- Architecture target: 100k concurrent connections during peak match windows
- Database: handle 1M lineups per matchday without table-scan operations
- Indexer: handle X Layer block rate sustained for 28 days

---

## 9. Product Phases

### 9.1 Phase v1 — Launch

**Scope:** core game playable end-to-end. Free + 1 paid contest tier. Bronze/Silver/Gold packs. Fixed-price marketplace. Rentals (no insurance). Daily + Season leaderboards. 6 formations, traits, captains, chips, stamina, all scoring.

**Goal:** prove the core loop works at scale during the Cup.

### 9.2 Phase v1.5 — Post-Launch

**Scope additions:** DNP insurance product, English-auction marketplace, Diamond pack tier with Unique guarantee, expanded paid contest tiers (Rare+ / SR+ / Whale Pool), private leagues with invite codes, earned chip drops from in-Cup performance.

**Goal:** deepen the economy and add competitive social formats.

### 9.3 Phase v2 — Next Season

**Scope additions:** 4-card bench + Bench Boost chip, Head-to-Head duels, Country/Faction pools, Moment cards (in-Cup NFT drops), native mobile app, cross-game card composability with other X Layer fantasy products.

**Goal:** expand surface area, build cross-product ecosystem.

---

## 10. Constraints & Dependencies

### 10.1 Technical Dependencies

- **X Layer infrastructure** — uptime, gas predictability, VRF availability
- **API-Football** (or equivalent) — match data SLA during World Cup
- **Oracle signer partners** — 2 external entities willing to run signers
- **OKX Wallet SDK** — for first-class wallet integration
- **OnchainOS skills** — DEX-swap, security scan (optional but valued)

### 10.2 Business / Legal Dependencies

- **DFS legal classification** in target jurisdictions
- **FIFPro or equivalent license** for player likeness in cards (or stylized renderings sidestepping rights)
- **Audit firm engagement** before mainnet launch
- **Federation/charity partnerships** for Unique auction proceeds split (optional but PR-positive)

### 10.3 Content Dependencies

- **Card art** for ~1,300 players × 4 tiers (~5,200 distinct artworks)
- **Player metadata** — traits, base stats, positional data for all WC squads
- **Fixture data** — full Cup schedule, kickoff times, venue info

---

## 11. Risks & Open Questions

### 11.1 Top Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Oracle accuracy / dispute | High | Multi-signer + multi-source data + public re-verifier + dispute window |
| Regulatory crackdown on paid contests | High | Geofence + DFS legal opinion + KYC at thresholds |
| Whale dominance crowds out casuals | Medium | Tier-gated contests + free track funded by economy fees |
| Onboarding friction (gas, wallet) | High | Starter Squad airdrop + low X Layer gas + clear OKX wallet path |
| Card art rights / likeness issues | High | FIFPro license OR stylized renderings; legal review pre-launch |
| Match data feed reliability | High | Primary + backup feeds; manual fallback playbook |
| Sybil farming free prizes | Medium | Wallet-history checks; capped prize value per wallet/day |
| Cup ends; product loses relevance | Medium | Cards retain value (collectible + composable); v2 expands to other competitions |

### 11.2 Open Questions (need resolution before launch)

1. **Final brand name** — "ManagerCup" is a placeholder
2. **Card art direction** — stylized illustration vs photo-based (rights cost vs distinctiveness)
3. **Player likeness rights** — direct partnerships, FIFPro license, or stylized to sidestep
4. **Oracle signer partners** — who are the 2 external entities?
5. **Sponsor / ecosystem grants** — OKX ecosystem grant? Partner brand sponsors funding free prize pool?
6. **Federation/charity partners** — for Unique auction split
7. **Geofencing scope** — which jurisdictions excluded from paid tier in v1
8. **VRF source** — Chainlink availability on X Layer; if absent, finalize commit-reveal design
9. **Audit firm** — provider + budget
10. **Pack pricing tiers** — exact USDC prices for Bronze / Silver / Gold / Diamond

---

## 12. Out of Scope (Explicit)

These are not in scope for any phase and should be politely declined if proposed:

- Direct sports betting / sportsbook markets
- Cash sweepstakes / lottery formats
- Governance token / utility token launch
- Multi-chain expansion (Ethereum mainnet, Solana, etc.) before X Layer product matures
- White-label fantasy platform for other operators
- Player NFT identity beyond what cards already provide (no separate player NFT)
- AMM / DeFi yield products built on cards

---

## 13. Reference Documents

- **Design specification:** `docs/superpowers/specs/2026-05-28-football-card-fantasy-design.md`
- **Hackathon context:** `HACKATHON_CONTEXT.md`
- **OKX Build X Hackathon home:** https://web3.okx.com/xlayer/build-x-hackathon
- **X Layer developer docs:** https://web3.okx.com/xlayer/docs/developer/
- **ERC-4907 (rentable NFTs):** https://eips.ethereum.org/EIPS/eip-4907
- **OnchainOS skills:** https://github.com/okx/onchainos-skills
- **Reference products:** Sorare, Fantasy Premier League, DraftKings DFS, NBA Top Shot, Axie Infinity scholarships

---

## 14. Approvals

| Role | Name | Status |
|---|---|---|
| Product Owner | Romario Kavin | Draft |
| Engineering Lead | TBD | — |
| Design Lead | TBD | — |
| Legal | TBD | — |
| Ecosystem Partner (OKX) | TBD | — |

---

*PRD v1 draft — open for review. Update version on each material revision.*
