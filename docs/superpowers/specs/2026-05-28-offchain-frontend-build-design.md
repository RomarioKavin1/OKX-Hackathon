# Off-chain + Frontend Build — Design Spec (v2, re-baselined to actual repo)

> Companion to `docs/superpowers/specs/2026-05-28-football-card-fantasy-design.md` (product design),
> `PRD.md`, and `CONTRACTS.md` (contract reference).
> **Covers everything EXCEPT the smart contracts.** Contracts are written, tested, and **already
> deployed** to X Layer testnet by a separate workstream; we consume them via the existing SDK.
> Target chain: X Layer testnet (chain `1952`, RPC `https://testrpc.xlayer.tech`, gas OKB).
> Approach: **vertical slice first, then breadth** (approved). The vertical slice already exists at the
> script level (`lib/lifecycle.ts`); remaining work is UI + a real data/scoring pipeline.
> Hard rule: **no mocks, no stubs, no fakes, no fillers.** Real contracts, real match data, real roots.
> The only deferred item is bulk card-art/metadata → IPFS ("later").

---

## 1. Goal & scope

Ship the v1 product per the PRD — **minus the contracts** — as a working, demoable, on-chain-verifiable
app on X Layer testnet for the OKX Build X / xCup hackathon. The contract + SDK + business-logic
foundation is done; this spec is about turning it into a played game: real UI, real match-data scoring,
and the read layer that powers browse/leaderboards.

### 1.1 In scope (the five gaps)

1. **Frontend UI** — all 13 product screens on top of the existing SDK.
2. **Real scoring pipeline** — API-Football → MatchEvents → scoring engine → real score + payout Merkle
   roots on-chain (replaces the placeholder `keccak256("scores-N")` root and contrived payouts).
3. **Read/data layer** — a lightweight indexer (chain logs → DB) + read API for browse, portfolio,
   leaderboards, and day-after analytics (replaces "probe tokenIds 1..5000").
4. **Real player content + trait/formation-synergy computation** — real taxonomy (nation, position,
   traits, base stats, fixtures) and the trait (§4.2) + formation-synergy (§4.3) logic the scoring
   engine already accepts but nothing yet computes.
5. **Live scoring + lifecycle service** — replay a real finished match → live ticker; matchday
   lifecycle (configure/lock/settle + oracle post) as a runnable service/cron.

### 1.2 Out of scope

- Writing/redeploying the contracts (done; consumed as-is).
- Mainnet, third-party audit, bug bounty, the `CONTRACTS.md` "Hardening TODO" items.
- Legal/DFS classification, geofencing, KYC (we don't fake them; we simply don't ship a legal gate).
- Bulk card-art + 1,300×4 IPFS metadata upload (deferred; placeholder CID for cosmetics).
- v1.5/v2 features as primary: auctions, Diamond/Unique packs, private leagues, earned chip drops,
  bench, H2H. **DNP insurance is already wired in the SDK + contracts**, so it's a cheap include, but
  stays behind the v1 loop in priority.

### 1.3 Definition of done (demo)

A new wallet, against the live testnet contracts and **real** match data, with no faked value:
connect OKX wallet → claim Starter Squad + baseline chips → (rent / buy / open a pack) → build a valid
11-card lineup (formation, captain/VC, chip, with live synergy/stamina/OOP feedback) → commit on-chain →
enter the free contest → watch a real match's events stream into a live ticker → after the oracle posts
the **real** score + payout roots → claim USDC. Every score reproducible by a verifier from on-chain
roots + public match data.

---

## 2. Current state (inventory)

### 2.1 Done — do not rebuild

| Area | Where | Status |
|---|---|---|
| 11 contracts (10 product + MockUSDC) | `contracts/src/` | Written, 46/46 Foundry tests, **deployed to testnet** |
| Deployed addresses + wiring | `contracts/deployments/xlayer-testnet.json`, mirrored in `frontend/lib/contracts/addresses.ts` | Live; oracle 1-of-1 (signer=deployer); minters/burner/oracle wired |
| Typed ABIs (all contracts) | `frontend/lib/abis/*` | Auto-generated via `scripts/gen-abis.mjs` from `contracts/out` |
| viem clients + wagmi config | `frontend/lib/clients.ts`, `lib/wagmi.ts` | Public + script + browser (OKX `window.okxwallet` → MetaMask) clients; X Layer testnet |
| Read wrappers (every contract) | `frontend/lib/actions/reads.ts` | Done |
| Write wrappers (every contract) | `frontend/lib/actions/writes.ts` | Done — incl. admin/oracle calls |
| Scoring engine (§4.8/§4.9 stacking) | `frontend/lib/business/scoring.ts` | Done (tier/OOP/stamina/captain/country wired; **trait + formation inputs accepted but uncomputed**) |
| Merkle (OZ sorted-pair, exact leaves) | `frontend/lib/business/merkle.ts` | Done — payout/DNP leaves, `buildPayoutTree` |
| Stamina / fees / pricing / packs / lineup-validate / format | `frontend/lib/business/*` | Done |
| Domain model + constants/tables | `frontend/lib/types.ts`, `lib/constants.ts` | Done — tiers, formations, synergy tables, score tables, splits, contest tiers |
| Full on-chain lifecycle (every flow) | `frontend/lib/lifecycle.ts`, `scripts/lifecycle.ts`, `scripts/demo-flow.ts` | **Proven on testnet** end-to-end |
| OKX OnchainOS skills | `.agents/skills/*` (22 skills) | Installed (gitignore decision pending) |

### 2.2 Missing — the work

- **UI:** `app/page.tsx` is a connect-wallet + USDC-balance demo only. No product screens.
- **Real scoring:** lifecycle uses `scoreRoot = keccak256("scores-N")` and "single entrant = net pool".
  No API-Football ingester; the scoring engine is never fed real events; payout trees aren't built from
  real ranks via the §5.2 prize curve.
- **Read layer:** no indexer/DB/API. Aggregate views (marketplace/rental browse, portfolio enumeration,
  leaderboards, day-after) have no backing store — current scripts brute-force `ownerOf` over token ids.
- **Content + synergy logic:** players are synthetic (`DEMO-PLAYER-i`). No real taxonomy/fixtures; no
  trait-table (§4.2) or formation-synergy-detection (§4.3) functions feeding `scoreCard`.
- **Live scoring + lifecycle automation:** no websocket/replay; lifecycle is manual scripts, not a cron.

---

## 3. Architecture (build on what exists)

No new monorepo. Two existing roots, plus off-chain workers that **reuse `frontend/lib`** (SDK + business
logic) so contract calls and scoring math are defined exactly once.

```
contracts/                         (done — consumed only)
frontend/
├── app/
│   ├── (screens)/                 NEW — all 13 product screens
│   └── api/                       NEW — Next route handlers = read API over the indexer DB
├── lib/                           (done — SDK + business logic; extend with trait/synergy + data)
│   ├── data/                      NEW — player taxonomy, traits, fixtures, nation map
│   └── business/synergy.ts        NEW — trait modifiers (§4.2) + formation synergy (§4.3)
├── services/                      NEW — long-running workers (import ../lib)
│   ├── indexer/                   viem getLogs/watchEvent → Postgres
│   ├── oracle/                    API-Football ingest → scoring → Merkle → submitRoot/PayoutRoot
│   ├── livescore/                 replay real match events → WebSocket/SSE
│   └── lifecycle/                 matchday cron (configure/lock/settle) — wraps lib/lifecycle pieces
├── scripts/                       (done — demo/admin; keep)
└── verifier/                      NEW — public CLI: re-run scoring vs on-chain roots
infra/docker-compose.yml           NEW — Postgres (+ Redis if needed for livescore)
```

### 3.1 Data flow

- **Writes:** screen → wagmi browser wallet (`getBrowserWalletClient` / `useWriteContract`) → contract
  tx → `services/indexer` observes the event → Postgres → `app/api` → screen updates.
- **Scoring/settlement:** `services/oracle` polls API-Football → normalizes to `MatchEvents` →
  `lib/business/scoring` over committed lineups (read via SDK/indexer) → `lib/business/merkle` builds
  score tree (our leaf) + DNP tree + ranked contest payout tree (§5.2) → signer calls
  `submitRoot` / `submitPayoutRoot` / (season) `submitSeasonRoot` → indexer → api → screen claims.
- **Live:** `services/livescore` replays a real finished match's event timeline → SSE/WebSocket → ticker.

**Trust invariant:** every user-facing number recomputable from on-chain roots + public match data via
`lib/business` (same code in oracle, api projections, and `verifier/`).

### 3.2 Contract boundary — already the SDK

`frontend/lib` IS the boundary §3 of v1 called for. No mocks live anywhere: reads/writes hit the deployed
addresses; the only test double in the system is **MockUSDC**, which is the real testnet currency the
contracts were deployed against (a faucet token on-chain, not a code mock). Keep `addresses.ts` in sync
with the deployment JSON (single source: the JSON; consider importing it directly to remove drift).

### 3.3 Merkle leaf formats (already implemented; keep canonical)

- Contest payout / season: `keccak256(abi.encodePacked(address, uint256 amount))` — `payoutLeaf`.
- DNP: `keccak256(abi.encodePacked(uint256 tokenId))` — `dnpLeaf`.
- Score root (not consumed on-chain by other contracts → ours, for the verifier): define
  `keccak256(abi.encodePacked(address wallet, uint32 matchday, int256 score))`, document on the
  transparency page. (New leaf helper to add alongside the existing two.)

---

## 4. Component designs (the five gaps)

### 4.1 Real scoring pipeline (`services/oracle` + `verifier/`)

- **Ingester:** poll API-Football for the configured fixtures; map provider event payloads → the existing
  `MatchEvents` shape (`lib/types.ts`); persist raw + normalized to Postgres (preserved publicly for
  re-verification, PRD FR-T2).
- **Score runner:** on matchday close, read every committed lineup (`GameRegistry.getLineup` via indexer),
  resolve each card's position/tier/traits/nation/stamina, compute `scoreCard` with **real**
  `traitModifier` (§4.2) and `formationSynergyMult` (§4.3) from the new `synergy.ts`.
- **Merkle/publish:** build score tree (new score leaf) + DNP tree (players with 0 minutes) → `submitRoot`;
  rank entrants per contest, apply §5.2 prize curve on the net pool, build payout tree → `submitPayoutRoot`;
  at Cup end aggregate → `submitSeasonRoot`. Signer = deployer key (1-of-1) for the demo.
- **Verifier CLI:** given matchday + the preserved match data, recompute all leaves and assert the root
  equals `ScoreOracle.roots(matchday)` / `payoutRoots(contestId)`.
- **Tests:** scoring vs **real** finished-match fixtures (committed snapshots), hand-verified for a few.

### 4.2 Read/data layer (`services/indexer` + `app/api`)

- **Indexer:** viem `getLogs`/`watchEvent` from a start block per contract → Postgres. Tables: `cards`
  (+owner/user/expiry from Transfer + ERC-4907 events), `rental_listings`, `rentals`,
  `marketplace_listings`, `packs`, `lineups`, `chips`, `contests`, `contest_entries`, `score_roots`,
  `payout_roots`, `claims`, `cursor`. Idempotent upserts on `(txHash, logIndex)`; small confirmations
  buffer (L2 reorgs). Target lag ≤ 30s.
- **Read API (Next route handlers):** portfolio (own/rented-in/rented-out/locked), card detail,
  marketplace browse (player/country/tier/position/price filters), rental browse (+stamina +next-matchday
  availability), matchday/lineup state, contest list + live pool + projected payout, season standings,
  day-after report (counterfactual best lineup, captain efficiency, decile rank), claim proofs.
- **Onboarding route:** `POST /api/onboard` → server uses the **minter** key (`airdropStarterSquad`) to
  mint a real Starter Squad, one-per-wallet (DB + on-chain guard); signed-message anti-sybil.

### 4.3 Player content + synergy (`lib/data` + `lib/business/synergy.ts`)

- `players.ts` — real footballers for demo teams: `playerId = keccak256("FRA-10-Mbappe")`, nation,
  position, primary+secondary trait, base stats per tier (deterministic). Scoped to the teams in the
  demo fixtures; expandable to 48×26.
- `fixtures.ts` — real WC-2026 schedule + the real **finished** match(es) driving the scored matchday.
- `nations.ts` / trait + formation-synergy tables (from §4.2/§4.3).
- `synergy.ts` — `traitModifier(position, trait, event)` and `formationSynergy(lineup)` returning the
  multipliers `scoreCard` already accepts; plus client mirrors so the lineup builder shows live synergy.
- **Seed script:** `setPlayerStats(playerId, tier, stats)` for every (player,tier) with the owner key
  (mint reverts without stats). Cosmetic URIs = placeholder CID (real IPFS upload deferred).

### 4.4 Frontend UI (`app/`)

Screens (PRD §7.8, design §D1–D13), OKX-wallet-first via existing wagmi config, all reads through
`app/api`, all writes via the SDK write wrappers:
wallet connect → onboarding/Starter Squad + claim chips → card detail → marketplace browse → rental
browse → pack buy + reveal animation (commit→wait 16 blocks→reveal) → **lineup builder** (drag-drop
formation, captain/VC, chip, stamina display, live validation via `validateLineup` + synergy preview) →
contest selector (free + Common Open $1) → live scoring ticker → day-after report → profile/portfolio
(OWN / RENTING-OUT / RENTING-IN / LOCKED) → season leaderboard → settings + gas estimator + claim flow.
Wallet-state UX (Connected / Insufficient Gas / Insufficient USDC). **Heed `frontend/AGENTS.md`: this is
Next.js 16 — consult `node_modules/next/dist/docs/` before writing app code.**

### 4.5 Live scoring + lifecycle (`services/livescore`, `services/lifecycle`)

- **livescore:** replay a real finished match's events on a controlled clock → SSE/WebSocket; the API/UI
  apply the same `scoreCard` math for a genuine running total (≤5s push target).
- **lifecycle:** cron wrapping the existing lifecycle pieces — `configureMatchday`(open) → `lock` at
  T−10m → trigger oracle (score/payout) → `settle`; `createContest` (free + Common Open) per matchday;
  `RentalMarket.settle` post-lock; `setFloorPrice` feeder from indexed marketplace data.

---

## 5. Real-data approach (no mocks)

- **Match data:** API-Football, real finished matches; `API_FOOTBALL_KEY` in env (to provision). The
  "live" demo replays a real finished fixture's timeline — genuine events, not invented numbers.
- **Card metadata/art → IPFS:** deferred; placeholder CID for `cosmeticURI`. On-chain **stats** seeded
  for real (§4.3). (Per your note: country-wise JSON → IPFS later.)
- **USDC:** MockUSDC faucet on testnet (the deployed currency).
- **Tests:** unit (scoring vs real fixtures), integration (real testnet txs — already in `lifecycle.ts`),
  e2e (Playwright against testnet, funded test wallet). No mocked contract/data layers.

---

## 6. Milestones (re-baselined)

**M0 — Foundations.** ✅ Mostly done (monorepo-equivalent, SDK, business logic, deployed contracts).
Remaining: stand up `infra/docker-compose.yml` (Postgres), `services/`/`app/api` skeletons, CI
(typecheck/lint/test), decide `.agents/` + `.env` handling. Sync `addresses.ts` ← deployment JSON.

**M1 — Vertical loop in the UI.** ✅ Proven on-chain (`lib/lifecycle.ts`). Remaining: surface it in the UI —
connect → onboard (Starter Squad + chips) → commit a lineup → enter free contest → claim. Wire the
minimal indexer + API needed for these views. **First demoable web build.**

**M2 — Real scoring pipeline.** `services/oracle` ingester + score runner + real Merkle/publish + verifier
CLI. Replace placeholder roots with real API-Football-derived scores and §5.2 ranked payouts. **This is
the core "no-fillers" deliverable.**

**M3 — Card economy UI.** PackSale buy+reveal (+animation), Marketplace list/buy/cancel + browse filters,
RentalMarket list/rent/settle/cancel + rental browse + floor feeder + portfolio states. (Contracts/SDK
done; build screens + indexer tables.)

**M4 — Full gameplay + analytics.** Trait + formation-synergy computation (`synergy.ts`), lineup builder
with live synergy/stamina/OOP feedback across all 6 formations + 4 chips; live-scoring ticker; day-after
report (counterfactual, captain efficiency, decile rank).

**M5 — Season + polish + stretch.** Season leaderboard aggregation + claim; transparency page (signers,
data source, formula, verifier link); wallet-state UX + gas estimator; DNP insurance UI; optional
OnchainOS `okx-dex-swap` (any-token entry) + `okx-security` (marketplace risk scan).

---

## 7. Dependencies & risks

| Item | Impact | Handling |
|---|---|---|
| `API_FOOTBALL_KEY` | Blocks real scoring (M2) | Provision free tier; document env; pick finished fixtures |
| Backend wallet OKB gas (minter/oracle) | Blocks airdrop/oracle txs | Deployer key already funded; reuse for demo (1-of-1) |
| Postgres for indexer | Blocks aggregate views | docker-compose; SQLite acceptable fallback for demo |
| Next.js 16 unfamiliarity | UI bugs | Follow `AGENTS.md`; read bundled docs before app code |
| Trait/formation tables not yet defined | Scoring incomplete | Author in `lib/data` + `synergy.ts` (M4), unit-test vs spec |
| `addresses.ts` drift vs JSON | Wrong-address calls | Import JSON or assert equality in CI |
| Card art/IPFS deferred | Cosmetic only | Placeholder CID; real upload later |
| `.agents/skills/` (22 files) committed by accident | Repo noise | gitignore `.agents/` unless intentionally vendored |

---

## 8. Open items to confirm

1. **API-Football key** — available now, or provision as part of M2? (Earlier: real finished matches.)
2. **Demo fixtures** — which real finished match(es) drive the scored matchday + replayed ticker?
3. **Read-layer store** — Postgres (per PRD) or SQLite for demo speed?
4. **Off-chain hosting** — single Next deployment + worker processes, or split? (Affects M0 skeleton.)
5. **`.agents/skills/`** — gitignore, or vendor into the repo intentionally?

---

*End of build design spec v2. Next step: writing-plans → implementation plan starting at M0/M1 (UI surface
of the existing loop) then M2 (real scoring).*
