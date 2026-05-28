# ManagerCup Off-chain + Frontend + OKX Integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the already-deployed ManagerCup contracts + SDK into a fully playable, on-chain-verifiable World Cup fantasy game on X Layer testnet — real UI, real API-Football scoring, real Merkle payouts, and a Supabase-backed read layer — with no mocks, stubs, or fillers.

**Architecture:** Build entirely on the existing `frontend/` (Next.js 16.2.6 App Router + `lib/` SDK + business logic) and the deployed `contracts/`. Add: (1) a **Supabase**-backed indexer (`frontend/services/indexer`, viem logs → Supabase via service-role) + read access (Next route handlers in `app/api/*` for computed views, direct `supabase-js` reads for browse); (2) a real scoring pipeline (`frontend/services/oracle`) that ingests API-Football, feeds the existing `scoreCard` engine, and posts genuine score/DNP/payout Merkle roots; (3) the missing scoring inputs — player content + **trait** (§4.2) and **formation-synergy** (§4.3) computation (`frontend/lib/data`, `frontend/lib/business/synergy.ts`); (4) all 13 UI screens; (5) a live-scoring replay (`frontend/services/livescore` → Supabase Realtime) + matchday lifecycle cron (`frontend/services/lifecycle`); (6) a public `verifier/` CLI. Every user-facing number is recomputable from on-chain roots + public match data by `frontend/lib/business` (shared by oracle, API projections, and verifier).

**Tech Stack:** TypeScript, Next.js 16.2.6 (App Router) + React 19, **Privy** (`@privy-io/react-auth`) for wallet auth + viem v2 for contract reads/writes, @tanstack/react-query v5, Tailwind v4 (CSS-config), `merkletreejs`, **Supabase** (`@supabase/supabase-js` + `@supabase/ssr`, Supabase CLI for migrations), `vitest` (new), `tsx`, API-Football (`v3.football.api-sports.io`).

---

## Reference docs (read before starting)

- Build spec: `docs/superpowers/specs/2026-05-28-offchain-frontend-build-design.md`
- Product spec: `docs/superpowers/specs/2026-05-28-football-card-fantasy-design.md` — scoring §4.8/§4.9, traits §4.2, formation synergy §4.3, country synergy §4.5, stamina §4.7, contest curve §5.2.
- Contract reference: `CONTRACTS.md`; deployed addresses: `contracts/deployments/xlayer-testnet.json` (chain `1952`).
- `PRD.md` (functional requirements FR-*); `HACKATHON_CONTEXT.md` (xCup framing).
- **`frontend/AGENTS.md`: this is Next.js 16.2.6 with breaking changes — after `npm install`, consult `frontend/node_modules/next/dist/docs/` before writing ANY `app/` code (async `params`/`searchParams`, route-handler signatures, caching defaults). Do not assume Next 13/14/15 idioms.**
- **Supabase work MUST use the `supabase:supabase` skill** and verify features against `https://supabase.com/changelog.md` before implementing. Enable RLS on every `public` table; never expose the service-role key to the browser.

## What already exists (do NOT rebuild)

**Contracts (deployed to X Layer testnet, chain 1952, deployer `0xA3327d90d087cdddfB99E598E50B5Bdee7fC55bD`):**

| Contract | Address | Key events (for the indexer) |
|---|---|---|
| MockUSDC | `0x29A46d0376C41423FF2aa9425A13c44FC53a1850` | `Transfer` |
| CardNFT | `0xa6188b7eCb3638A3b7Fbb855089cdCFc84dE36c9` | `Transfer`, `UpdateUser(tokenId,user,expires)` |
| ChipNFT | `0x2991dF527c84823a16917f425E24e746EE31F314` | `TransferSingle`, `TransferBatch` |
| PackSale | `0x0136b193EE83BffC55262aAFC411efd578F9e8D5` | `PackBought(commitId,buyer,packType)`, `PackRevealed(commitId,tokenIds[])` |
| Marketplace | `0x4b1c73E8d59FD4a0EB1525A1255d64FEE05aF7C8` | `Listed(tokenId,seller,price)`, `Sold(tokenId,buyer,price)`, `Cancelled(tokenId)` |
| GameRegistry | `0x53d6CBe6bcA72396Fe1E5AD8E2249a78Ec79D5fC` | `MatchdayConfigured(matchday,lock)`, `LineupCommitted(matchday,wallet,chipId)` |
| RentalMarket | `0x7a809b6e51b5DeE675036F24F76Eeb149C0f266c` | `ListedForRent`, `Rented(tokenId,matchday,renter,paid)`, `Settled`, `Cancelled`, `RefundedPostponed` |
| ScoreOracle | `0x3470694dD5Afd5474F916B89C108bBB85d05A295` | `RootSubmitted`, `RootFinalized(matchday,scoreRoot,dnpRoot)`, `PayoutRootFinalized(contestId,root)`, `SeasonRootFinalized(root)` |
| ContestEscrow | `0x00B08f0E928933422A7b623E475Dd84b2B98BaA4` | `ContestCreated(id,matchday,entryFee,rakeBps,minTier)`, `Entered(id,player)`, `RakeTaken(id,rake)`, `Claimed(id,player,amount)` |
| InsurancePool | `0xc6d3061ccEA1c25769962A9cBDcee293Aaf698fB` | `Insured`, `DnpClaimed`, `PolicyReleased` |
| SeasonLeaderboard | `0x9D696CBB6BD4DcfA322C14Ff74B662560aa5C2d8` | `Claimed(player,amount)` |

Wiring (recorded): `CardNFT.minter=[PackSale, deployer]`, `CardNFT.rentalMarket=RentalMarket`, `ChipNFT.burner=GameRegistry`, `ScoreOracle.signers=[deployer]`, `threshold=1`, `ContestEscrow.oracle=SeasonLeaderboard.oracle=InsurancePool.oracle=ScoreOracle`.

**SDK + business logic (`frontend/lib/`) — consume, don't rebuild:**

- `lib/contracts/`: `xLayerTestnet` (id 1952), `ACTIVE_CHAIN`, `ADDRESSES: Record<ContractName, Address>`, `ABIS`, `contract(name)`; `lib/abis/*` (auto-gen via `scripts/gen-abis.mjs`).
- `lib/clients.ts`: `publicClient`, `getScriptWalletClient(pk)` (scripts). `getBrowserWalletClient()` (injected `window.okxwallet`) still exists, but **UI writes use a Privy-derived viem `WalletClient`** — Task 3.2 adds `getPrivyWalletClient(wallet)` built from `await wallet.getEthereumProvider()`.
- Wallet auth via **Privy** (`@privy-io/react-auth` `PrivyProvider`); `lib/wagmi.ts` was removed (no wagmi config / connectors).
- `lib/actions/reads.ts`: `usdcBalance`, `usdcAllowance`, `cardOwner`, `cardUser`, `cardController`, `cardMeta`, `cardStats`, `chipBalance`, `staminaOf`, `hasLineup`, `matchdayIsOpen`, `rentalListing`, `marketListing`, `packCommit`, `contestInfo`, `scoreRoot`, `payoutRootFinalized`.
- `lib/actions/writes.ts`: `waitFor`, `usdcFaucet/Approve/Transfer`, `setPlayerStats`, `mintCard`, `airdropStarterSquad`, `claimBaselineChips`, `setPackPrice/PlayerPool`, `buyPack`, `revealPack`, `approveCard`, `listForSale`, `buyListing`, `listForRent`, `rentCard`, `settleRental`, `cancelRental`, `commitLineup`, `configureMatchday`, `createContest`, `enterContest`, `takeRake`, `claimContest`, `claimSeason`, `insureRental`, `claimDnp`, `submitScoreRoot`, `submitPayoutRoot`, `submitSeasonRoot`. (Each takes `wallet: WalletClient` first, optional `from?: Address` last, returns `Promise<Hex>`.)
- `lib/business/`: `scoring.ts` (`scoreCard`, `baseEventPoints`, `countrySynergyMult`, `captainMult`, `lineupTotal`, `CardScoreInput`), `merkle.ts` (`payoutLeaf`, `dnpLeaf`, `buildMerkleTree`, `buildPayoutTree`, `verifyProof`), `stamina.ts` (`applyStamina`, `staminaModifier`), `lineup.ts` (`validateLineup`, `isEligibleForContest`, `nationCounts`, `LineupDraft`), `fees.ts`, `pricing.ts`, `packs.ts`, `format.ts` (`toUsdc`, `fromUsdc`, `fmtUsdc`); barrel `lib/business/index.ts`.
- `lib/types.ts`: `Tier`, `Stats`, `Position`, `Card`, `FormationName`, `ChipId`, `Lineup`, `MatchdayStatus`, `PricingMode`, `RentalListing`, `Rental`, `Contest`, **`MatchEvents`** (the scoring input), `ScoredCard`, `PayoutLeaf`, `MerkleClaim`.
- `lib/constants.ts`: `USDC_DECIMALS`, `RENTAL_SPLIT`, `MARKETPLACE_SPLIT`, `INSURANCE`, `TIER_SUPPLY_CAP`, `TIER_BONUS`, `PACK_TIER_CUM`, `PACK_NAME`, `STAMINA`, `OUT_OF_POSITION_PENALTY`, `CAPTAIN_MULT`, `COUNTRY_SYNERGY`, `FORMATIONS` (6 × 11-slot `Position[]`), `LINEUP_SIZE`, all `SCORE_*` tables, `CONTEST_TIERS`, `DEFAULT_CONTEST_RAKE_BPS=800`.
- `lib/lifecycle.ts`: `runFullLifecycle(wallet, account, log?)` — proven on-chain end-to-end (10 phases). `scripts/{demo-flow,lifecycle,read-state}.ts`, `scripts/gen-abis.mjs`, `scripts/_env.ts` (loads repo-root `../.env`, exports `wallet`/`account`/`publicClient`).
- `app/`: `layout.tsx` (Geist fonts, `<Providers>`), `providers.tsx` (`PrivyProvider`, gated on `NEXT_PUBLIC_PRIVY_APP_ID`), `page.tsx` (Privy login + USDC balance demo), `demo/page.tsx` + `lib/demo/phases.ts` (on-chain lifecycle demo), `globals.css` (Tailwind v4 `@theme`).

## The four concrete gaps this plan fills

1. **Scoring inputs unimplemented.** `scoreCard` reads `traitModifier?` and `formationSynergyMult?` but **nothing computes them** (both default to `1`); there is no `Trait` type, no trait table, no formation-synergy table. → Phase 2.
2. **No read layer.** Aggregate views (browse, portfolio, leaderboards, day-after) have no store; scripts brute-force `ownerOf` 1..5000. → Phase 1 (Supabase + indexer).
3. **No real scoring.** Lifecycle uses `scoreRoot=keccak256("scores-N")` and "single entrant = net pool"; no API-Football, no §5.2 ranked payouts. → Phase 4.
4. **No product UI.** Only `/` exists. → Phases 3, 5, 6.

Also: **no indexer `fromBlock`** is recorded anywhere (no `broadcast/`, no block in the deployments JSON) → Phase 0 sources it. **Next.js 16.2.6** is post-cutoff → read bundled docs. **No tests/CI** → Phase 0 adds vitest + CI.

## Conventions

- All commands run from `frontend/` unless noted. Services live in `frontend/services/*` and import `../lib`. The verifier lives in `frontend/verifier/`.
- Tests use **vitest**. Pure-logic tasks are **TDD** (failing test → implement → pass → commit). Indexer/oracle/API tasks use integration tests against the live testnet + a Supabase test schema. UI tasks are verified by running `npm run dev` and using the feature in a browser (project rule) — type checks/tests verify code, not feature correctness.
- Secrets live in the **repo-root `.env`** (gitignored, loaded by `scripts/_env.ts` and by services). New vars: `API_FOOTBALL_KEY`, `SUPABASE_SERVICE_ROLE_KEY`. Browser-public vars (in `frontend/.env.local`, prefixed `NEXT_PUBLIC_`): `NEXT_PUBLIC_SUPABASE_URL=https://jwylnndtmfyxnngfyuqq.supabase.co`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_zADdGfIGyo3CAkIsol-roA_TXcDjyMA`, `NEXT_PUBLIC_PRIVY_APP_ID=<privy-app-id>` (FR-O1/O2 — Privy login modal).
- Commit after every green step. Never use `--no-verify`. Never commit secrets.
- **Supabase security rule (non-negotiable):** every table in `public` has RLS enabled. Browse tables get a read-only `SELECT TO anon` policy. All writes go through the **service-role** key from server-only code (indexer/oracle/onboarding) — never from the browser, never `NEXT_PUBLIC_`.

---

# PHASE 0 — Foundations, tooling, Supabase, OKX service skeleton

Goal: install deps + read Next docs, vitest harness, Supabase project wired with schema + RLS, address-drift guard, deploy-block discovery, app shell/nav, CI. Independently verifiable; unblocks everything.

### Task 0.1: Install deps, gitignore `.agents/`, read Next 16 docs

**Files:** Modify `.gitignore`, `.env.example`.

- [ ] **Step 1:** `cd frontend && npm install`. Expected: `node_modules/` populated (this is required before any `app/` work — `node_modules/next/dist/docs/` is the Next 16 source of truth).
- [ ] **Step 2:** Read `frontend/node_modules/next/dist/docs/` index and skim the App Router route-handler + async `params`/`searchParams` + caching pages. Note breaking changes in a scratch comment for later UI tasks (do not assume Next 14/15 idioms).
- [ ] **Step 3:** Append to repo-root `.gitignore`:

```
# OKX OnchainOS agent skills (installed via `npx skills add okx/onchainos-skills`; not vendored)
.agents/
skills-lock.json
```

- [ ] **Step 4:** Append to repo-root `.env.example`:

```
# Read layer (Supabase) — service role is SECRET, server-only
SUPABASE_SERVICE_ROLE_KEY=YOUR_SUPABASE_SERVICE_ROLE_KEY
# Match data
API_FOOTBALL_KEY=YOUR_API_FOOTBALL_KEY
```

- [ ] **Step 5:** Create `frontend/.env.local` (gitignored by `.env.*`) with the two `NEXT_PUBLIC_SUPABASE_*` values from Conventions plus `NEXT_PUBLIC_PRIVY_APP_ID` (Privy app id, FR-O1/O2). Confirm `git status` does NOT show `.env.local` or `.agents/`.
- [ ] **Step 6: Commit** — `git add .gitignore .env.example && git commit -m "chore: ignore .agents, document new env vars"`.

### Task 0.2: vitest harness

**Files:** Modify `frontend/package.json`; create `frontend/vitest.config.ts`, `frontend/lib/business/__tests__/format.test.ts`.

- [ ] **Step 1:** `cd frontend && npm i -D vitest @vitest/coverage-v8`.
- [ ] **Step 2:** Create `frontend/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts", "services/**/*.test.ts", "verifier/**/*.test.ts"],
  },
  resolve: { alias: { "@": resolve(__dirname, ".") } },
});
```

- [ ] **Step 3:** In `frontend/package.json` `"scripts"` add `"test": "vitest run"`, `"test:watch": "vitest"`, `"typecheck": "tsc --noEmit"`.
- [ ] **Step 4: Write a passing harness test** `frontend/lib/business/__tests__/format.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { toUsdc, fmtUsdc } from "../format";

describe("usdc format", () => {
  it("round-trips 12.5 USDC at 6 decimals", () => {
    expect(toUsdc(12.5)).toBe(12_500000n);
    expect(fmtUsdc(12_500000n)).toBe("12.50");
  });
});
```

- [ ] **Step 5: Run** `npm test`. Expected: PASS. If `fmtUsdc` default differs from `"12.50"`, first `Read lib/business/format.ts` and adjust the expectation to the real output (keep the round-trip assertion).
- [ ] **Step 6: Commit** — `git add package.json package-lock.json vitest.config.ts lib/business/__tests__/format.test.ts && git commit -m "test: add vitest harness"`.

### Task 0.3: Discover the indexer start block

**Files:** Modify `contracts/deployments/xlayer-testnet.json` (add `startBlock`).

- [ ] **Step 1:** Find the earliest contract-creation block. Run from `frontend/`:

```bash
npx tsx -e "import {publicClient} from './lib/clients'; import {ADDRESSES} from './lib/contracts'; const head=await publicClient.getBlockNumber(); console.log('head', head); const code=await publicClient.getBytecode({address:ADDRESSES.CardNFT}); console.log('CardNFT has code:', !!code);"
```

Then find the deploy block via OKLink for the deployer `0xA3327d90d087cdddfB99E598E50B5Bdee7fC55bD` (explorer: `https://www.oklink.com/xlayer-test/address/0xA3327d90d087cdddfB99E598E50B5Bdee7fC55bD`) — use the block of the first CardNFT creation tx.
- [ ] **Step 2:** Add `"startBlock": <N>` to `contracts/deployments/xlayer-testnet.json`. If OKLink is unavailable, set `startBlock` to a safe lower bound (a block known to predate deployment) and document it; the indexer tolerates an early start (idempotent upserts).
- [ ] **Step 3: Commit** — `git add contracts/deployments/xlayer-testnet.json && git commit -m "chore: record indexer startBlock"`.

### Task 0.4: Address-drift guard (single source of truth)

**Files:** Create `frontend/lib/contracts/__tests__/addresses.test.ts`.

- [ ] **Step 1: Write a failing test** asserting `ADDRESSES` matches the deployment JSON:

```ts
import { describe, it, expect } from "vitest";
import { ADDRESSES } from "../addresses";
import deployment from "../../../../contracts/deployments/xlayer-testnet.json";

describe("address drift", () => {
  it("ADDRESSES match deployments JSON for all 11 contracts", () => {
    for (const [name, addr] of Object.entries(ADDRESSES)) {
      expect((deployment as any).contracts?.[name]?.toLowerCase?.() ?? (deployment as any)[name]?.toLowerCase?.())
        .toBe((addr as string).toLowerCase());
    }
  });
});
```

- [ ] **Step 2: Run** `npm test -- addresses`. If it fails, `Read contracts/deployments/xlayer-testnet.json` to learn the exact JSON shape and fix the test's accessor (not the addresses). Expected once aligned: PASS.
- [ ] **Step 3:** Ensure `tsconfig.json` has `"resolveJsonModule": true` (add if missing).
- [ ] **Step 4: Commit** — `git add lib/contracts/__tests__/addresses.test.ts tsconfig.json && git commit -m "test: guard address drift vs deployment JSON"`.

### Task 0.5: Supabase project wiring + clients

> Uses the `supabase:supabase` skill. The Supabase project is `jwylnndtmfyxnngfyuqq`. Service-role key goes in repo-root `.env` (server only); publishable key in `frontend/.env.local`.

**Files:** Create `frontend/lib/supabase/server.ts`, `frontend/lib/supabase/browser.ts`; modify `frontend/package.json`.

- [ ] **Step 1:** `cd frontend && npm i @supabase/supabase-js @supabase/ssr`.
- [ ] **Step 2:** Create `frontend/lib/supabase/browser.ts` (publishable key, browser/RLS-scoped reads):

```ts
import { createBrowserClient } from "@supabase/ssr";

export function supabaseBrowser() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
```

- [ ] **Step 3:** Create `frontend/lib/supabase/server.ts` — TWO factories: `supabaseAnonServer()` (publishable key, for read route handlers) and `supabaseAdmin()` (service-role, server-only writers; throws if `SUPABASE_SERVICE_ROLE_KEY` missing):

```ts
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;

export function supabaseAnonServer() {
  return createClient(url, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false },
  });
}

export function supabaseAdmin() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is required for server writers");
  return createClient(url, key, { auth: { persistSession: false } });
}
```

- [ ] **Step 4:** Install the Supabase CLI (if absent) and link: `npx supabase login` (interactive — the user runs `! npx supabase login`), then `npx supabase link --project-ref jwylnndtmfyxnngfyuqq`. Create `frontend/supabase/` via `npx supabase init`.
- [ ] **Step 5: Commit** — `git add lib/supabase package.json package-lock.json supabase/ && git commit -m "feat: supabase clients (anon read + service-role writer)"`.

### Task 0.6: Database schema migration (Supabase) + RLS

> Per the supabase skill: iterate schema with `execute_sql`, then generate the migration file with `supabase migration new`. Enable RLS on EVERY table; add `SELECT TO anon` read policies on browse tables; writes are service-role only (bypasses RLS).

**Files:** Create `frontend/supabase/migrations/<ts>_init.sql`.

- [ ] **Step 1: Create the migration** — `npx supabase migration new init`. Author the SQL (all amounts `numeric(78,0)` to hold uint256; addresses `text` lowercased; idempotency on `(tx_hash, log_index)`):

```sql
-- cursor: per-contract last indexed block
create table public.indexer_cursor (
  contract text primary key,
  last_block bigint not null default 0
);

-- raw idempotency ledger
create table public.events (
  tx_hash text not null,
  log_index int not null,
  block_number bigint not null,
  contract text not null,
  name text not null,
  args jsonb not null,
  created_at timestamptz not null default now(),
  primary key (tx_hash, log_index)
);

create table public.cards (
  token_id numeric(78,0) primary key,
  player_id text not null,
  tier smallint not null,
  serial_number bigint not null,
  mint_batch bigint not null,
  owner text not null,
  user_addr text,                 -- ERC-4907 current renter (null if none/expired)
  user_expires bigint not null default 0,
  original_buyer text not null,
  updated_block bigint not null
);
create index on public.cards (owner);
create index on public.cards (player_id);
create index on public.cards (tier);

create table public.marketplace_listings (
  token_id numeric(78,0) primary key,
  seller text not null,
  price numeric(78,0) not null,
  active boolean not null default true,
  updated_block bigint not null
);

create table public.rental_listings (
  token_id numeric(78,0) primary key,
  owner text not null,
  mode smallint not null,         -- 0 Fixed / 1 FloorPegged / 2 Suggested
  price_value numeric(78,0) not null,
  active boolean not null default true,
  updated_block bigint not null
);

create table public.rentals (
  matchday bigint not null,
  token_id numeric(78,0) not null,
  renter text not null,
  owner text not null,
  paid numeric(78,0) not null,
  settled boolean not null default false,
  updated_block bigint not null,
  primary key (matchday, token_id)
);

create table public.packs (
  commit_id numeric(78,0) primary key,
  buyer text not null,
  pack_type smallint not null,
  opened boolean not null default false,
  revealed_token_ids numeric(78,0)[] ,
  updated_block bigint not null
);

create table public.lineups (
  matchday bigint not null,
  wallet text not null,
  token_ids numeric(78,0)[] not null,
  formation smallint not null,
  captain_idx smallint not null,
  vice_idx smallint not null,
  chip_id smallint not null,
  committed_block bigint not null,
  primary key (matchday, wallet)
);

create table public.contests (
  contest_id numeric(78,0) primary key,
  matchday bigint not null,
  entry_fee numeric(78,0) not null,
  rake_bps int not null,
  min_tier smallint not null,
  pool numeric(78,0) not null default 0,
  rake_taken boolean not null default false,
  updated_block bigint not null
);

create table public.contest_entries (
  contest_id numeric(78,0) not null,
  wallet text not null,
  entered_block bigint not null,
  primary key (contest_id, wallet)
);

-- match data preserved publicly for re-verification (PRD FR-T2)
create table public.match_events (
  matchday bigint not null,
  fixture_id bigint not null,
  player_key text not null,        -- maps to on-chain player_id via lib/data
  raw jsonb not null,              -- provider payload
  events jsonb not null,           -- normalized MatchEvents
  primary key (matchday, fixture_id, player_key)
);

-- finalized roots mirrored from chain
create table public.score_roots (
  matchday bigint primary key,
  score_root text not null,
  dnp_root text not null,
  finalized_block bigint not null
);
create table public.payout_roots (
  contest_id numeric(78,0) primary key,
  root text not null,
  finalized_block bigint not null
);

-- per-wallet per-matchday computed scores (projection; reproducible from match_events + lib/business)
create table public.scores (
  matchday bigint not null,
  wallet text not null,
  contest_id numeric(78,0),
  score numeric not null,
  rank int,
  payout numeric(78,0) not null default 0,
  proof text[] not null default '{}',
  primary key (matchday, wallet, contest_id)
);

-- one-per-wallet onboarding guard (anti-sybil)
create table public.onboarded (
  wallet text primary key,
  tx_hash text not null,
  created_at timestamptz not null default now()
);

-- dispute / disagreement reports (FR-T4). Anyone may FILE; only service-role reads/triages.
create table public.disputes (
  id uuid primary key default gen_random_uuid(),
  wallet text,
  matchday bigint,
  contest_id numeric(78,0),
  kind text not null,                       -- 'score' | 'payout' | 'data' | 'other'
  message text not null,
  status text not null default 'open',      -- open | reviewing | resolved
  created_at timestamptz not null default now()
);

-- identical-lineup-across-wallets flags for manual review (FR-CT10)
create table public.lineup_flags (
  matchday bigint not null,
  lineup_hash text not null,                -- keccak256 of sorted token_ids
  wallets text[] not null,                  -- >1 wallet sharing the identical lineup
  created_at timestamptz not null default now(),
  primary key (matchday, lineup_hash)
);

-- unclaimed-prize rollover ledger (FR-CT8): value unclaimed past the deadline,
-- honored by topping up a future FREE pool from the treasury (see Phase 7.6).
create table public.contest_rollover (
  contest_id numeric(78,0) primary key,
  unclaimed numeric(78,0) not null,
  claim_deadline timestamptz not null,
  rolled_into_contest_id numeric(78,0),     -- the free contest the value funded
  status text not null default 'pending',   -- pending | rolled
  computed_block bigint not null
);
```

- [ ] **Step 2: RLS** — append to the same migration. Enable RLS on every table; grant `anon` SELECT on read-facing tables only:

```sql
do $$ declare t text; begin
  for t in select tablename from pg_tables where schemaname='public' loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- public read for browse/leaderboard/transparency tables
create policy "read cards" on public.cards for select to anon using (true);
create policy "read mkt" on public.marketplace_listings for select to anon using (true);
create policy "read rentlist" on public.rental_listings for select to anon using (true);
create policy "read rentals" on public.rentals for select to anon using (true);
create policy "read packs" on public.packs for select to anon using (true);
create policy "read lineups" on public.lineups for select to anon using (true);
create policy "read contests" on public.contests for select to anon using (true);
create policy "read entries" on public.contest_entries for select to anon using (true);
create policy "read scores" on public.scores for select to anon using (true);
create policy "read score_roots" on public.score_roots for select to anon using (true);
create policy "read payout_roots" on public.payout_roots for select to anon using (true);
create policy "read match_events" on public.match_events for select to anon using (true);
create policy "read lineup_flags" on public.lineup_flags for select to anon using (true);
create policy "read rollover" on public.contest_rollover for select to anon using (true);
-- disputes: anyone may FILE (insert), but only service-role can read/triage them (FR-T4)
create policy "file disputes" on public.disputes for insert to anon with check (char_length(message) between 1 and 4000);
-- NOTE: indexer_cursor, events, onboarded, and disputes-SELECT have RLS enabled with NO anon read policy → only service-role can read them.
```

- [ ] **Step 3: Apply** — `npx supabase db push` (or run the SQL via the Supabase SQL editor / MCP `execute_sql`). Then `npx supabase db advisors` (or MCP `get_advisors`) and fix any flagged RLS/security issues.
- [ ] **Step 4: Verify** — query each table returns empty with the publishable key (read works) and that inserts with the publishable key are rejected (RLS):

```bash
npx tsx -e "import {supabaseAnonServer} from './lib/supabase/server'; const c=supabaseAnonServer(); const {data,error}=await c.from('cards').select('*').limit(1); console.log('read', error?.message ?? 'ok', data); const w=await c.from('cards').insert({token_id:'1',player_id:'x',tier:0,serial_number:0,mint_batch:0,owner:'0x0',original_buyer:'0x0',updated_block:0}); console.log('anon write blocked:', !!w.error);"
```

Expected: read `ok`; `anon write blocked: true`. Also confirm the inverse for `disputes`: an anon `insert` into `disputes` **succeeds** (FR-T4 file path) while an anon `select` on `disputes` returns no rows / is denied.
- [ ] **Step 5: Commit** — `git add supabase/migrations && git commit -m "feat: supabase schema + RLS (indexer tables, scores, onboarding guard)"`.

_(Task 0.7 removed — the OKX OnchainOS `onchainos` CLI integration was cut from scope. OKX **Wallet** connect remains via the **Privy** login modal in Task 0.8 and needs no OKX API keys. The numbering keeps 0.8/0.9 as-is.)_

### Task 0.8: App shell — nav, design tokens, route group

> Read `node_modules/next/dist/docs/` first. This is Next 16: route groups `app/(app)/`, server components by default, `"use client"` only where hooks/wallet are used.

**Files:** Create `frontend/app/(app)/layout.tsx`, `frontend/components/Nav.tsx`, `frontend/components/WalletButton.tsx`; modify `frontend/app/globals.css` (theme tokens). Wallet auth is **Privy** — `app/providers.tsx` already wraps the app in `PrivyProvider` (gated on `NEXT_PUBLIC_PRIVY_APP_ID`); `lib/wagmi.ts` was removed. (This supersedes the earlier wagmi/WalletConnect app-shell attempt — the repo adopted Privy.)

- [ ] **Step 1:** `components/WalletButton.tsx` (`"use client"`, FR-O1/O2): use Privy's `usePrivy()` (`ready`, `authenticated`, `login`, `logout`) + `useWallets()` (active wallet address). Disconnected → a single "Connect Wallet" button that opens the **Privy login modal** — which itself offers OKX Wallet / MetaMask / WalletConnect / embedded wallets, so one button satisfies FR-O1 (OKX Wallet) + FR-O2 (MetaMask + WalletConnect). Connected → truncated address + "Log out". If `NEXT_PUBLIC_PRIVY_APP_ID` is unset, `providers.tsx` renders children without wallet context (graceful degrade, not a crash).
- [ ] **Step 2:** Create `components/Nav.tsx` with links: Play (lineup), Contests, Marketplace, Rentals, Packs, Portfolio, Leaderboard, Transparency — plus `<WalletButton/>`.
- [ ] **Step 3:** Create `app/(app)/layout.tsx` rendering `<Nav/>` + `{children}` in a max-width container. Add World-Cup-themed tokens to `globals.css` `@theme` (pitch green, gold accent) — keep Tailwind v4 CSS-config (no `tailwind.config.js`). **Accessibility (§8.5):** use a **color-blind-safe** palette for stat bars / synergy indicators (never encode meaning by hue alone — pair color with icon, label, or pattern), ensure ≥4.5:1 text contrast, and add a global `:focus-visible` ring token that every interactive component reuses. Core flows (connect, lineup commit, claim) target **WCAG 2.1 AA**.
- [ ] **Step 4: Verify** — `npm run dev`, open `http://localhost:3000`, confirm nav renders and the **Privy login modal** opens + connects (OKX Wallet / MetaMask / WalletConnect / email-embedded all reachable through Privy). Tab through the nav + wallet button with the **keyboard only** (focus ring visible, every control reachable). Screenshot.
- [ ] **Step 5: Commit** — `git add app components globals.css && git commit -m "feat: app shell — nav, Privy wallet button, a11y theme tokens"`.

### Task 0.9: CI (typecheck, lint, test)

**Files:** Create `.github/workflows/ci.yml`.

- [ ] **Step 1:** Add a workflow running on push/PR: `cd frontend && npm ci && npm run lint && npm run typecheck && npm test`. (Do NOT run the indexer/oracle integration tests in CI — they need live testnet + Supabase; gate those behind a separate manual job or `*.it.test.ts` excluded from the default `vitest` include.)
- [ ] **Step 2:** Adjust `vitest.config.ts` `include`/`exclude` so integration tests (`*.it.test.ts`) are excluded from `npm test` and run via `npm run test:it` (add script `"test:it": "vitest run --config vitest.it.config.ts"`).
- [ ] **Step 3: Commit** — `git add .github vitest*.config.ts package.json && git commit -m "ci: typecheck, lint, unit tests"`.

---

# PHASE 1 — Read layer: indexer (chain → Supabase)

Goal: a real indexer that turns contract events into Supabase rows, so every aggregate view stops brute-forcing the chain. This unblocks all UI browse/portfolio/leaderboard screens.

### Task 1.1: Indexer event decoders + upsert mappers (TDD)

**Files:** Create `frontend/services/indexer/decode.ts`, `frontend/services/indexer/decode.test.ts`.

- [ ] **Step 1: Write failing tests** for pure decode→row mappers (no network): given a decoded log for each event (`Transfer` of CardNFT, `UpdateUser`, `Listed`, `Sold`, `Cancelled`, `ListedForRent`, `Rented`, `Settled`, `PackBought`, `PackRevealed`, `LineupCommitted`, `ContestCreated`, `Entered`, `RakeTaken`, `RootFinalized`, `PayoutRootFinalized`), assert it maps to the correct table + upsert payload (addresses lowercased, bigints → string). Example:

```ts
import { describe, it, expect } from "vitest";
import { mapRented } from "./decode";

it("maps Rented to a rentals upsert row", () => {
  const row = mapRented({ tokenId: 7n, matchday: 3n, renter: "0xAbC", paid: 12_000000n }, 100n /* owner resolved upstream */ as any, 555n);
  // owner is resolved from cards table by the runner; mapRented takes it as arg
  expect(row).toMatchObject({ matchday: 3, token_id: "7", renter: "0xabc", paid: "12000000", settled: false, updated_block: 555 });
});
```

- [ ] **Step 2: Implement** `decode.ts` — one pure `map<Event>(args, ctx, block)` per event returning `{ table: string; row: Record<string, unknown>; onConflict: string }`. Card ownership = latest `Transfer.to`; `UpdateUser` sets `user_addr`/`user_expires` (null when `expires <= now` is resolved at read time, store raw). `PackRevealed` sets `revealed_token_ids` + `opened=true`. `LineupCommitted` needs the full lineup — store the event's `(matchday, wallet, chipId)` and let the runner fetch `getLineup` for `token_ids/formation/idx` (Task 1.2).
- [ ] **Step 3: Run** `npm test -- decode`. Expected: PASS.
- [ ] **Step 4: Commit** — `git add services/indexer/decode.ts services/indexer/decode.test.ts && git commit -m "feat(indexer): pure event→row decoders"`.

### Task 1.2: Indexer runner (viem getLogs + cursor + Supabase upserts)

**Files:** Create `frontend/services/indexer/index.ts`, `frontend/services/indexer/run.ts`.

- [ ] **Step 1:** Implement a backfill+follow loop: read `startBlock` from the deployment JSON and `indexer_cursor` per contract; `publicClient.getLogs({ address, fromBlock, toBlock, events })` in ≤2000-block windows; for each log, decode (Task 1.1) and upsert via `supabaseAdmin()` (`.upsert(row, { onConflict })`); record raw into `events` keyed `(tx_hash, log_index)` for idempotency (skip if exists); advance `indexer_cursor`. Use `confirmations: 2` lag (X Layer read-after-write) — index up to `head - 2`.
- [ ] **Step 2:** For `LineupCommitted` and `ContestCreated`, after decoding, fetch authoritative struct via SDK reads (`getLineup` — add wrapper in Task 1.3; `contestInfo`) and upsert the full row. For `Transfer` from `0x0` (mint), also enrich `cards` with `cardMeta`/`cardStats`/`originalBuyer` via the SDK (one read per new token).
- [ ] **Step 3:** Add `"index": "tsx services/indexer/run.ts"` and `"index:once": "INDEX_ONCE=1 tsx services/indexer/run.ts"` to `package.json`. `run.ts` loads `../.env`, constructs clients, runs one pass (if `INDEX_ONCE`) or polls every 5s.
- [ ] **Step 4: Integration test** `services/indexer/index.it.test.ts`: run one pass against live testnet (the lifecycle has already produced events) into a Supabase test schema/prefix; assert ≥1 row exists in `cards` and the cursor advanced. Run `npm run test:it -- indexer`.
- [ ] **Step 5: Verify** — `npm run index:once`, then query Supabase: `cards`, `marketplace_listings`, `contests` have rows reflecting prior lifecycle txs.
- [ ] **Step 6: Commit** — `git add services/indexer package.json && git commit -m "feat(indexer): backfill+follow runner → supabase"`.

### Task 1.3: SDK read-wrapper gaps the indexer/UI need

**Files:** Modify `frontend/lib/actions/reads.ts`; create `frontend/lib/actions/reads.test.ts` (unit where pure, else skip-network).

- [ ] **Step 1:** Add wrappers (exact contract calls, decode structs to `lib/types`): `getLineup(matchday, wallet): Promise<Lineup | null>` (decode `GameRegistry.getLineup` tuple), `seasonFinalized(): Promise<boolean>`, `seasonRoot(): Promise<Hex>`, `dnpRoot(matchday): Promise<Hex>`, `insurancePolicy(matchday, tokenId)`, `cardUsedInMatchday(matchday, tokenId): Promise<boolean>`, `lastUsedMatchday(tokenId): Promise<number>`, `userExpires(tokenId): Promise<bigint>`.
- [ ] **Step 2:** Each mirrors the existing `reads.ts` style (`publicClient.readContract({...contract(name), functionName, args})`). No new patterns.
- [ ] **Step 3: Verify** — `npx tsx -e "import {getLineup} from './lib/actions/reads'; console.log(await getLineup(<existingMatchday>, '<deployer>'))"` returns a decoded lineup or null.
- [ ] **Step 4: Commit** — `git add lib/actions/reads.ts && git commit -m "feat(sdk): add read wrappers (getLineup, season, dnp, insurance, stamina helpers)"`.

---

# PHASE 2 — Player content + trait/formation synergy (close the scoring gap)

Goal: implement the ONLY missing scoring inputs. After this phase, `scoreCard` receives real `traitModifier` and `formationSynergyMult` instead of defaulting to `1`. Pure logic → strict TDD.

> **Design note (modeling decision, not a placeholder):** the deployed `scoreCard` applies `traitModifier` and `formationSynergyMult` as **single scalars** per card (stacking order §4.9). The §4.2/§4.3 rules are event-specific, so `synergy.ts` collapses them into scalars: `traitModifier` = (trait-adjusted event points ÷ base event points) for that card's actual `MatchEvents`; `formationSynergyMult` = product of active formation-synergy bonuses applicable to that card's position, clamped to `[1.0, 1.15]` per §4.3. The verifier and oracle use this same code, so scores stay reproducible. This decision is documented on the Transparency page.

### Task 2.1: Trait + nation taxonomy data

**Files:** Create `frontend/lib/data/nations.ts`, `frontend/lib/data/traits.ts`.

- [ ] **Step 1:** `nations.ts` — `export type Nation = "BRA" | "FRA" | "ARG" | ...` for demo teams; `NATION_NAME: Record<Nation,string>`.
- [ ] **Step 2:** `traits.ts` — encode §4.2 exactly:

```ts
import type { Position } from "@/lib/types";
import type { MatchEvents } from "@/lib/types";

export type Trait =
  | "ShotStopper" | "SweeperKeeper" | "PenaltySpecialist"
  | "Wall" | "BallPlaying" | "Aggressor" | "Wingback"
  | "Playmaker" | "BoxToBox" | "BallWinner" | "Creator" | "Anchor"
  | "Poacher" | "TargetMan" | "Winger" | "InsideForward" | "False9";

// Each trait boosts specific event categories (multiplier applied to that category's points).
// Categories mirror lib/constants SCORE_* tables.
export type EventCategory = "goals" | "assists" | "cleanSheet" | "tackles" | "keyPasses" | "saves" | "penaltiesSaved" | "all" | "attacking";

export const TRAIT_BOOST: Record<Trait, Partial<Record<EventCategory, number>>> = {
  ShotStopper:       { saves: 1.20 },
  SweeperKeeper:     { keyPasses: 1.10 },
  PenaltySpecialist: { penaltiesSaved: 1.50 },
  Wall:              { cleanSheet: 1.15 },
  BallPlaying:       { keyPasses: 1.25 },
  Aggressor:         { tackles: 1.10 },
  Wingback:          { assists: 1.20 },
  Playmaker:         { assists: 1.25 },
  BoxToBox:          { all: 1.10 },
  BallWinner:        { tackles: 1.20 },
  Creator:           { keyPasses: 1.30 },
  Anchor:            { cleanSheet: 1.15 },
  Poacher:           { goals: 1.25 },
  TargetMan:         { goals: 1.20 },   // "headed" goals approximated as goals
  Winger:            { assists: 1.20 },
  InsideForward:     { goals: 1.15, assists: 1.15 }, // G+A
  False9:            { attacking: 1.15 }, // goals+assists+keyPasses
};

export const TRAITS_BY_POSITION: Record<Position, Trait[]> = {
  GK:  ["ShotStopper", "SweeperKeeper", "PenaltySpecialist"],
  DEF: ["Wall", "BallPlaying", "Aggressor", "Wingback"],
  MID: ["Playmaker", "BoxToBox", "BallWinner", "Creator", "Anchor"],
  FWD: ["Poacher", "TargetMan", "Winger", "InsideForward", "False9"],
};
```

- [ ] **Step 3: Commit** — `git add lib/data/nations.ts lib/data/traits.ts && git commit -m "feat(data): trait + nation taxonomy (§4.2)"`.

### Task 2.2: `traitModifier` + per-event scoring breakdown (TDD)

**Files:** Create `frontend/lib/business/synergy.ts`, `frontend/lib/business/__tests__/synergy.traits.test.ts`. Modify `frontend/lib/business/scoring.ts` only if a per-event breakdown helper must be exported.

- [ ] **Step 1: Write failing tests** with hand-computed expectations from the §4.8 `SCORE_*` tables. Example (a FWD Poacher who scored 2 goals + 1 assist):

```ts
import { describe, it, expect } from "vitest";
import { eventPointBreakdown, traitModifier } from "../synergy";
import type { MatchEvents } from "@/lib/types";

const ev = (p: Partial<MatchEvents>): MatchEvents => ({
  goals:0,assists:0,cleanSheet:false,tackles:0,keyPasses:0,saves:0,penaltiesSaved:0,
  manOfTheMatch:false,played60:true,yellowCards:0,redCards:0,ownGoals:0,penaltiesMissed:0,
  goalsConceded:0,minutes:90, ...p,
});

it("breakdown: FWD 2 goals + 1 assist + played60", () => {
  // SCORE_GOAL.FWD=5, SCORE_ASSIST=3, SCORE_PLAYED_60=1
  const b = eventPointBreakdown("FWD", ev({ goals:2, assists:1 }));
  expect(b.goals).toBe(10); expect(b.assists).toBe(3); expect(b.base).toBe(1); // played60 in base
});

it("traitModifier: Poacher (+25% goals) on 2 goals + 1 assist + played60", () => {
  // base = 10+3+1 = 14; boosted goals = 12.5; total = 12.5+3+1 = 16.5; mod = 16.5/14
  expect(traitModifier("FWD", ["Poacher"], ev({ goals:2, assists:1 }))).toBeCloseTo(16.5/14, 6);
});

it("traitModifier returns 1 when base points are 0 (DNP)", () => {
  expect(traitModifier("FWD", ["Poacher"], ev({ played60:false, minutes:0 }))).toBe(1);
});
```

- [ ] **Step 2: Implement** `synergy.ts`:
  - `eventPointBreakdown(scoringPosition: Position, e: MatchEvents): Record<EventCategory|"base", number>` — replicate the §4.8 table from `lib/constants` `SCORE_*` (goals by position, assists, clean sheet by position w/ 60+ guard, capped tackles/keyPasses/saves, penaltiesSaved, MOTM, played60, and negatives → fold negatives into `base`). Sum of category values + `base` must equal `baseEventPoints(scoringPosition, e)` (assert this in a test against the existing engine).
  - `traitModifier(scoringPosition, traits: Trait[], e): number` — for each trait, multiply matching categories' points by `TRAIT_BOOST[trait][cat]`; `attacking` = goals+assists+keyPasses; `all` = every positive category. Return `adjustedTotal / baseTotal` (guard `baseTotal===0 → 1`; if `baseTotal<0`, return `1`).
- [ ] **Step 3: Run** `npm test -- synergy.traits`. Iterate to green.
- [ ] **Step 4: Cross-check** — add a test asserting `eventPointBreakdown` totals equal `baseEventPoints` for 10 random event vectors (keeps synergy.ts and scoring.ts in lockstep).
- [ ] **Step 5: Commit** — `git add lib/business/synergy.ts lib/business/__tests__/synergy.traits.test.ts && git commit -m "feat(scoring): traitModifier from §4.2 event boosts"`.

### Task 2.3: `formationSynergy` (TDD)

**Files:** Create `frontend/lib/data/formationSynergy.ts`; modify `frontend/lib/business/synergy.ts`; create `frontend/lib/business/__tests__/synergy.formation.test.ts`.

- [ ] **Step 1:** `formationSynergy.ts` — encode §4.3 triggers/bonuses:

```ts
import type { FormationName, Position } from "@/lib/types";
import type { Trait } from "./traits";

export type SynergyName = "WidePlay" | "IronWall" | "TikiTaka" | "CounterAttack" | "BrickDefense";

export interface SynergyDef {
  name: SynergyName;
  // returns true if the lineup triggers this synergy
  triggers: (ctx: { formation: FormationName; traits: Trait[][]; positions: Position[] }) => boolean;
  // multiplier applied to a card given its scoring position; default 1
  multForPosition: (pos: Position) => number;
}
```

Implement the 5 synergies exactly:
  - **WidePlay**: `formation ∈ {4-3-3, 3-4-3}` and ≥2 cards with `Winger`/`Wingback` trait → MID/FWD/DEF (cards that earn assists/keyPasses) get `1.05`.
  - **IronWall**: `formation ∈ {5-3-2}` (5-4-1 not in the 6) and ≥3 `Wall` traits → DEF/GK get `1.10` (clean-sheet-weighted; approximated as position scalar per the design note).
  - **TikiTaka**: `formation ∈ {4-3-3, 3-5-2}` and ≥3 `Playmaker`/`Creator` → MID gets `1.08`.
  - **CounterAttack**: ≥2 `Poacher` and ≥2 `BallWinner` → FWD gets `1.12`.
  - **BrickDefense**: ≥5 `Wall`/`SweeperKeeper` → DEF/GK `1.15`, FWD/MID `0.95` (−5% attacking; clamp keeps it ≥ floor — see below).
- [ ] **Step 2:** Add to `synergy.ts`: `formationSynergy(input: { formation: FormationName; cards: { position: Position; scoringPosition: Position; traits: Trait[] }[] }): { active: SynergyName[]; multForCard: (i: number) => number }`. `multForCard` = product of `multForPosition(scoringPosition)` across active synergies, clamped to `[0.95, 1.15]` (allows BrickDefense's −5%; otherwise floor 1.0 per §4.9's "1.0–1.15"). Document the clamp.
- [ ] **Step 3: Write tests** for each synergy: a lineup that triggers it and one that doesn't; assert `active` membership and `multForCard` values for representative slots. Include a no-synergy lineup → all `1.0`.
- [ ] **Step 4: Run** `npm test -- synergy.formation`. Iterate to green.
- [ ] **Step 5: Commit** — `git add lib/data/formationSynergy.ts lib/business/synergy.ts lib/business/__tests__/synergy.formation.test.ts && git commit -m "feat(scoring): formationSynergy from §4.3"`.

### Task 2.4: Real player catalog + fixtures for the demo teams

**Files:** Create `frontend/lib/data/players.ts`, `frontend/lib/data/fixtures.ts`, `frontend/lib/data/index.ts`.

- [ ] **Step 1:** `players.ts` — for the teams in the demo fixture (the two nations the user-picked finished match is between, plus a couple more for rentals), encode real squads:

```ts
import { keccak256, toHex } from "viem";
import type { Position, Tier, Stats } from "@/lib/types";
import type { Trait } from "./traits";
import type { Nation } from "./nations";

export interface PlayerDef {
  key: string;            // "FRA-10-Mbappe"
  playerId: `0x${string}`; // keccak256(toHex(key)) — MUST match how cards were/will be minted
  name: string; nation: Nation; position: Position;
  primaryTrait: Trait; secondaryTrait: Trait;
  base: Stats;            // Common-tier base; higher tiers scale by TIER_BONUS
  apiFootballId?: number; // to map provider events → player
}

export const playerId = (key: string): `0x${string}` => keccak256(toHex(key));

export const PLAYERS: PlayerDef[] = [
  // ... real players for the demo nations (≈26 per team needed for full squads;
  //     at minimum the 11 starters + bench used in the scored fixture, plus rental pool)
];

export const PLAYER_BY_ID = new Map(PLAYERS.map((p) => [p.playerId, p]));
export const PLAYER_BY_APIID = new Map(PLAYERS.filter(p=>p.apiFootballId).map((p) => [p.apiFootballId!, p]));
```

  Stats are deterministic per (player, tier): Common = `base`; Rare/SR/Unique scale each stat by `TIER_BONUS` (1.05/1.12/1.20) rounded — matches "higher tier = better stats."
- [ ] **Step 2:** `fixtures.ts` — the real WC-2026 (or user-chosen finished) fixtures: `{ fixtureId, matchday, home: Nation, away: Nation, kickoff: ISO, status }`. The scored matchday points at the user's chosen finished match's `fixtureId`.
- [ ] **Step 3:** `index.ts` barrel + a `nationOf(playerId)` / `positionOf(playerId)` / `traitsOf(playerId)` helper set used by the oracle, lineup builder, and indexer enrichment.
- [ ] **Step 4: Test** `lib/data/__tests__/players.test.ts`: `playerId("FRA-10-Mbappe")` is stable; every player has 2 traits valid for its position (`TRAITS_BY_POSITION`); tier-scaled stats are monotonic. Run `npm test -- players`.
- [ ] **Step 5: Commit** — `git add lib/data && git commit -m "feat(data): real player catalog + fixtures for demo teams"`.

### Task 2.5: Seed on-chain player stats

**Files:** Create `frontend/scripts/seed-players.ts`.

- [ ] **Step 1:** For every `PlayerDef` × 4 tiers, call `setPlayerStats(wallet, playerId, tier, scaledStats)` (owner key from `_env`). Mint reverts without stats, so this gates all minting. Idempotent: read existing stats first; skip if set. Also `setPlayerPool(wallet, PLAYERS.map(p=>p.playerId))` on PackSale and set `setPackPrice` for Bronze/Silver/Gold (e.g. 5/15/40 USDC) and `setTierCum` to match `PACK_TIER_CUM`.
- [ ] **Step 2:** Add `"seed": "tsx scripts/seed-players.ts"`.
- [ ] **Step 3: Run** `npm run seed`. Verify a sample: `npx tsx -e "import {cardStats} from './lib/actions/reads'; /* mint one then read */"` or read `tierStats` via a one-off. Expected: stats set on-chain for demo players.
- [ ] **Step 4: Commit** — `git add scripts/seed-players.ts package.json && git commit -m "chore: seed on-chain player stats + pack config"`.

---

# PHASE 3 — Vertical slice in the UI (first demoable build)

Goal: surface the proven on-chain loop end-to-end in the browser, backed by the indexer/Supabase + read API, with a viem-native simulate/gas preflight on writes. This is the first thing a judge can click through: connect → onboard → commit a (minimal) lineup → enter the free contest → claim.

### Task 3.1: Read API route handlers (computed views)

> Read Next 16 route-handler docs first. Handlers query Supabase (anon server client) and apply `lib/business` projections so numbers stay reproducible.

**Files:** Create `frontend/app/api/portfolio/route.ts`, `frontend/app/api/contests/route.ts`, `frontend/app/api/lineup/route.ts`.

- [ ] **Step 1:** `GET /api/portfolio?wallet=` → from `cards` (owner = wallet OR `user_addr` = wallet w/ unexpired `user_expires`), classify each as `OWN | RENTING_IN | RENTING_OUT | LOCKED` (LOCKED = appears in a `lineups` row for an open/locked matchday). Return `{ cards: [...] }`.
- [ ] **Step 2:** `GET /api/contests?matchday=` → from `contests` join `contest_entries` count + `pool`; include `entryFee`, `minTier`, `rakeBps`, `rakeTaken`. `GET /api/lineup?matchday=&wallet=` → from `lineups`.
- [ ] **Step 3:** Each handler validates query params (boundary validation), returns typed JSON. No business logic in the browser.
- [ ] **Step 4: Verify** — with indexer data present, `curl 'localhost:3000/api/portfolio?wallet=<deployer>'` returns classified cards.
- [ ] **Step 5: Commit** — `git add app/api && git commit -m "feat(api): portfolio/contests/lineup read handlers"`.

### Task 3.2: Write preflight (viem-native simulate/gas) + TxButton

**Files:** Create `frontend/components/TxButton.tsx` (optionally `frontend/app/api/preflight/route.ts`).

- [ ] **Step 1:** Preflight uses **viem** (no external service): `publicClient.simulateContract({ address, abi, functionName, args, account })` to detect whether the write will revert (catch the error → extract the revert reason via viem's `BaseError`/`ContractFunctionRevertedError`), plus `publicClient.estimateContractGas(...)` + `publicClient.getGasPrice()` for the gas estimate. This can run client-side in `TxButton`, or behind a thin `POST /api/preflight` if you prefer server-side; either way it yields `{ willRevert: boolean, reason?, gas, gasPriceGwei }`.
- [ ] **Step 2:** `components/TxButton.tsx` (`"use client"`): given a contract write (address/abi/functionName/args), first run the viem preflight, show "Simulating… ✓ will succeed / ✗ will revert: <reason>" + gas estimate, then on confirm submit through the **Privy** wallet → a viem `WalletClient`. Add `getPrivyWalletClient(wallet)` to `lib/clients.ts`: `const provider = await wallet.getEthereumProvider(); return createWalletClient({ account: wallet.address as Address, chain: ACTIVE_CHAIN, transport: custom(provider) });` (where `wallet` is `useWallets().wallets[0]`). Call the relevant `lib/actions/writes.ts` fn with that client, then poll `waitFor`. This is the standard write UX reused by every screen (also satisfies the FR-O6 gas estimator).
- [ ] **Step 3: Verify** — wire `TxButton` to a harmless call (USDC `faucet`), confirm the simulate badge shows and the tx submits in the browser.
- [ ] **Step 4: Commit** — `git add components/TxButton.tsx && git commit -m "feat: viem-native simulate/gas preflight + TxButton"`.

### Task 3.3: Onboarding screen + server airdrop route

**Files:** Create `frontend/app/(app)/onboard/page.tsx`, `frontend/app/api/onboard/route.ts`.

- [ ] **Step 1:** `POST /api/onboard` `{ wallet, signature }` — verify the signed message (anti-sybil, FR-CT9), check `onboarded` table (one per wallet) AND on-chain (no existing starter cards), then use the **minter** key (`_env` deployer = minter) to call `airdropStarterSquad(wallet, fivePlayerIds)` (5 deterministic Commons from `PLAYERS`), insert into `onboarded`. Returns `{ txHash }`. Service-role Supabase + server-only key.
- [ ] **Step 2:** `onboard/page.tsx` (`"use client"`): Privy `login()` → "Claim your free 5-card Starter Squad" → sign the anti-sybil message with the active Privy wallet (`useWallets().wallets[0]` → `getEthereumProvider()` → viem `signMessage`, or Privy's own `signMessage`) → POST → show minted cards (poll `/api/portfolio`) → "Claim baseline chips" (`claimBaselineChips` via `TxButton`).
- [ ] **Step 2b: Interactive walkthrough (FR-O5/US-05 — Must).** After squad + chips are claimed, launch a guided first-lineup tutorial: a step-through coachmark overlay (lightweight, no heavy dep) that routes the user to `/play/builder`, highlights each action in order — "pick a formation → fill 11 slots → set captain/vice → (optional) chip → commit" — and finishes by entering the free contest. Persist completion in `localStorage` so it shows once; expose a "Replay tutorial" entry in Settings (Task 7.5). Do not skip — FR-O5 is a Must.
- [ ] **Step 3: Verify** — fresh wallet: claim squad (5 cards appear), claim chips (balances 1×4), the walkthrough launches and guides the user to a committed first lineup + free-contest entry. Re-claim is rejected (one-per-wallet). Screenshot/GIF.
- [ ] **Step 4: Commit** — `git add app/(app)/onboard app/api/onboard && git commit -m "feat: onboarding — starter squad airdrop + baseline chips + guided first-lineup walkthrough"`.

### Task 3.4: Minimal lineup commit + free contest entry + claim

**Files:** Create `frontend/app/(app)/play/page.tsx`, `frontend/app/(app)/contests/page.tsx`, `frontend/app/api/claim-proof/route.ts`.

- [ ] **Step 1:** `play/page.tsx` — list the wallet's controllable cards (`/api/portfolio`), let the user pick 11 + a formation (simple select, full builder is Phase 6), captain/vice index, optional chip; validate with `validateLineup`; commit via `commitLineup` through `TxButton`. (For the slice, 5 owned Commons + cheap rentals from Phase 5; if <11 owned, show "rent more" CTA.)
- [ ] **Step 2:** `contests/page.tsx` — list contests from `/api/contests`; "Enter free contest" (entryFee 0) and "$1 Common Open" → `enterContest` via `TxButton` (with USDC approve when fee>0). Show live `pool` + entrant count.
- [ ] **Step 3:** `GET /api/claim-proof?contestId=&wallet=` → from `scores` (Phase 4 populates rank/payout/proof); returns `{ amount, proof }` or `{ eligible:false }`. Claim button → `claimContest(contestId, amount, proof)` via `TxButton` (after `takeRake`).
- [ ] **Step 4: Verify (slice end-to-end)** — using the existing lifecycle-produced matchday/contest OR a freshly configured one: commit lineup, enter contest; after Phase 4 posts the payout root, claim USDC. Until Phase 4, validate against the lifecycle's already-finalized contest (proof from `buildPayoutTree`). Browser screenshot of a successful claim.
- [ ] **Step 5: Commit** — `git add app/(app)/play app/(app)/contests app/api/claim-proof && git commit -m "feat: vertical slice — commit lineup, enter contest, claim"`.

**Milestone M1 reached: first demoable web build.**

---

# PHASE 4 — Real scoring pipeline (oracle) + verifier (the no-fillers core)

Goal: replace placeholder roots with real API-Football-derived scores and §5.2 ranked payouts, posted on-chain by the signer, and independently verifiable.

### Task 4.1: API-Football ingester

**Files:** Create `frontend/services/oracle/ingest.ts`, `frontend/services/oracle/ingest.it.test.ts`.

- [ ] **Step 1:** Implement `fetchFixtureEvents(fixtureId): Promise<RawFixture>` against `https://v3.football.api-sports.io/fixtures/players?fixture=<id>` with header `x-apisports-key: API_FOOTBALL_KEY`. Normalize each player's stats → the existing `MatchEvents` shape (`lib/types`): minutes, goals, assists, `cleanSheet` (60+ min & team conceded 0), tackles, keyPasses (passes.key), saves, penaltiesSaved (penalty.saved), `manOfTheMatch`, `played60`, yellow/red, ownGoals (goals.conceded for GK→goalsConceded; own goals from `penalty`/events), penaltiesMissed, goalsConceded, plus `apiFootballId`.
- [ ] **Step 2:** Persist to `match_events` (raw + normalized) via `supabaseAdmin()`, keyed `(matchday, fixtureId, player_key)` where `player_key` maps via `PLAYER_BY_APIID`. Unmapped players are stored with their api id (logged) but won't affect scoring (no card → not in any lineup).
- [ ] **Step 3: Integration test** (real key, user-chosen finished fixture): `npm run test:it -- ingest` asserts ≥22 player rows and that a known scorer's `goals ≥ 1`. Hand-verify 2-3 players against the match report.
- [ ] **Step 4:** Add `"ingest": "tsx services/oracle/ingest.ts <fixtureId> <matchday>"`.
- [ ] **Step 5: Commit** — `git add services/oracle/ingest.ts services/oracle/ingest.it.test.ts package.json && git commit -m "feat(oracle): API-Football ingester → MatchEvents"`.

### Task 4.2: Score runner (real events + synergy → scoreCard)

**Files:** Create `frontend/services/oracle/score.ts`, `frontend/services/oracle/score.test.ts`.

- [ ] **Step 1:** `computeLineupScore(lineup, eventsByPlayerId, cardCtx): { wallet; cards: ScoredCard[]; total }`. For each of the 11 tokenIds: resolve `playerId → position/traits/nation` (`lib/data`), `tier` (`cardMeta`/indexer), `scoringPosition` (from formation slot), `stamina` (`staminaOf`/indexer), `MatchEvents` (from `match_events`, DNP→all-zero), `sameNationCount` (via `nationCounts`), `traitModifier` (Task 2.2), and the lineup's `formationSynergyMult` per card (Task 2.3). Build `CardScoreInput` and call `scoreCard`. Captain/vice + chip handling exactly per the engine (`isCaptain`, `chip`, vice promotes if captain DNP — `played60===false && minutes===0`).
- [ ] **Step 2: Tests** against a committed real-fixture snapshot (`services/oracle/__fixtures__/<fixture>.json` captured from Task 4.1): assert a few hand-computed card scores and a lineup total, exercising trait + formation + country + captain + stamina stacking together. This is the core correctness test.
- [ ] **Step 3: Run** `npm test -- score`. Iterate to green.
- [ ] **Step 4: Commit** — `git add services/oracle/score.ts services/oracle/score.test.ts services/oracle/__fixtures__ && git commit -m "feat(oracle): real lineup scoring (traits+formation+stamina+captain)"`.

### Task 4.3: Prize curve + payout tree (TDD)

**Files:** Create `frontend/lib/business/contest.ts`, `frontend/lib/business/__tests__/contest.test.ts`.

- [ ] **Step 1: Write failing tests** for `prizeCurve(netPool: bigint, numEntrants: number): bigint[]` (index 0 = 1st place), implementing §5.2 weights `[15,8,5, 2.5×7, 0.5×40, 0.15×200]` (%). Rule: take weights for ranks `1..min(250, numEntrants)`, **normalize** so `Σ payouts === netPool` exactly (integer 6dp), add any rounding remainder (dust) to rank 1. Tests:

```ts
it("single entrant takes the whole net pool", () => {
  expect(prizeCurve(9_200000n, 1)).toEqual([9_200000n]);
});
it("sums exactly to net pool with no dust lost (1000 entrants)", () => {
  const out = prizeCurve(9_200000n, 1000);
  expect(out.reduce((a,b)=>a+b,0n)).toBe(9_200000n);
  expect(out.length).toBe(250); // only top 25% get paid
  expect(out[0] > out[1] && out[1] > out[2]).toBe(true);
});
it("3 entrants: weights 15/8/5 normalized to net pool", () => {
  const out = prizeCurve(28n, 3); // tiny pool to check dust→rank1
  expect(out.reduce((a,b)=>a+b,0n)).toBe(28n);
});
```

- [ ] **Step 2: Implement** `prizeCurve`; add `buildContestPayout(scored: {wallet; total}[], netPool): { ranked: {wallet; rank; amount}[] }` — sort by `total` desc, tie-break by earliest `entered_block` then wallet asc (deterministic), map `prizeCurve` amounts by rank.
- [ ] **Step 3: Run** `npm test -- contest`. Green.
- [ ] **Step 4: Commit** — `git add lib/business/contest.ts lib/business/__tests__/contest.test.ts && git commit -m "feat(scoring): §5.2 prize curve + ranked payout builder"`.

### Task 4.4: Merkle build + on-chain publish

**Files:** Create `frontend/services/oracle/publish.ts`; add score-leaf helper to `frontend/lib/business/merkle.ts`.

- [ ] **Step 1:** Add `scoreLeaf(wallet: Address, matchday: number, score: bigint): Hex` = `keccak256(encodePacked(["address","uint32","int256"], [wallet, matchday, score]))` (per build spec §3.3) + a unit test. Score is integer (scale points ×1000, documented).
- [ ] **Step 2:** `publishMatchday(matchday)`: read all committed lineups (`lineups` table) → `computeLineupScore` each → build score tree (`scoreLeaf`) + DNP tree (`dnpLeaf` for every tokenId with 0 minutes in any committed lineup) → `submitScoreRoot(wallet, matchday, scoreRoot, dnpRoot)`. Then per contest for that matchday: filter eligible entrants (`isEligibleForContest` against `minTier`; ineligible score 0), `contestRake(pool, rakeBps)` → net, `buildContestPayout` → `buildPayoutTree(PayoutLeaf[])` → `submitPayoutRoot(wallet, contestId, root)`. Persist ranks/payouts/proofs to `scores` (so `/api/claim-proof` serves them). Mirror finalized roots into `score_roots`/`payout_roots` (or rely on the indexer).
- [ ] **Step 2b: Same-lineup detection (FR-CT10/US — Should).** While reading committed lineups, compute `lineup_hash = keccak256(sorted token_ids)` per (matchday, wallet); group by hash within the matchday and, where >1 wallet shares an identical lineup, upsert a `lineup_flags` row (`wallets[]`). This flags collusion / multi-account farming for manual review **without** blocking payouts; the flags are surfaced on the transparency page (Task 7.4).
- [ ] **Step 3:** Add `"publish": "tsx services/oracle/publish.ts <matchday>"`.
- [ ] **Step 4: Integration test / live run** — against a configured+locked matchday with committed lineups: `npm run publish -- <matchday>`; assert `ScoreOracle.roots(matchday)` is non-zero and `payoutRootFinalized(contestId)` is true; assert a claimer's `/api/claim-proof` proof verifies via `verifyProof`.
- [ ] **Step 5: Commit** — `git add services/oracle/publish.ts lib/business/merkle.ts && git commit -m "feat(oracle): build + publish score/DNP/payout roots (real, ranked) + same-lineup flags"`.

### Task 4.5: Public verifier CLI

**Files:** Create `frontend/verifier/index.ts`, `frontend/verifier/verify.test.ts`.

- [ ] **Step 1:** `verify(matchday)`: pull preserved `match_events` + committed lineups, recompute scores with the SAME `lib/business` + `services/oracle/score` code, rebuild the score/payout trees, and assert the roots equal `ScoreOracle.roots(matchday)` / `payoutRoots(contestId)` read on-chain. Print PASS/FAIL per root with the recomputed vs on-chain hex.
- [ ] **Step 2:** Add `"verify": "tsx verifier/index.ts <matchday>"`. Test: run against the Phase-4 published matchday → all roots match.
- [ ] **Step 3: Commit** — `git add verifier package.json && git commit -m "feat(verifier): public CLI re-runs scoring vs on-chain roots"`.

**Milestone M2 reached: real, reproducible scoring.**

---

# PHASE 5 — Card economy UI + OKX security/portfolio

Goal: packs, marketplace, rentals, portfolio — built on the SDK + indexer.

### Task 5.1: SDK + API gaps for the economy

**Files:** Modify `frontend/lib/actions/writes.ts`; create `frontend/app/api/market/route.ts`, `frontend/app/api/rentals/route.ts`.

- [ ] **Step 1:** Add write wrappers: `cancelListing(wallet, tokenId)` (Marketplace.cancel), `delistRental(wallet, tokenId)`, `refundPostponed(wallet, tokenId, matchday)`, `setFloorPrice(wallet, player, tier, price)`.
- [ ] **Step 2:** `GET /api/market` (filters: player, country/nation, tier, position, maxPrice; from `marketplace_listings` join `cards` + `lib/data`), `GET /api/rentals` (same filters + stamina + next-matchday availability from `rentals`/`cardUsedInMatchday`). Server-side filtered Supabase queries (indexed columns).
- [ ] **Step 3: Verify** — `curl` each with filters returns expected rows.
- [ ] **Step 4: Commit** — `git add lib/actions/writes.ts app/api/market app/api/rentals && git commit -m "feat: economy write wrappers + market/rental browse APIs"`.

### Task 5.2: Pack buy + reveal screen

**Files:** Create `frontend/app/(app)/packs/page.tsx`, `frontend/components/PackReveal.tsx`.

- [ ] **Step 1:** Buy: approve USDC → `buyPack(packType)` via `TxButton`; parse the `PackBought` commitId (from receipt logs or `/api` after indexer). Show a 16-block countdown (`PACK_REVEAL_DELAY_BLOCKS`), then enable `revealPack(commitId)`. Reveal animation in `PackReveal.tsx` (CSS/Tailwind transitions — no Framer dependency needed; flip 5 cards). Pull rates from `pullProbabilities(packType)` shown pre-buy (on-chain-verifiable, FR-P4).
- [ ] **Step 2: Verify** — buy a Bronze pack, wait blocks, reveal 5 cards, they appear in portfolio. GIF.
- [ ] **Step 3: Commit** — `git add app/(app)/packs components/PackReveal.tsx && git commit -m "feat: pack buy + reveal with animation"`.

### Task 5.3: Marketplace browse/list/buy

**Files:** Create `frontend/app/(app)/market/page.tsx`, `frontend/app/(app)/market/[tokenId]/page.tsx`.

- [ ] **Step 1:** Browse with filters (`/api/market`); card detail shows stats/traits/tier/serial + rental availability. List flow: `approveCard(Marketplace, tokenId)` → `listForSale(tokenId, price)`. Buy flow: approve USDC → `buyListing(tokenId)` (via `TxButton`, which already shows the viem simulate/gas preflight). On-chain royalty (4% platform + 1% original buyer) is enforced by the contract (FR-M3). _(FR-M5 wash-trade detection was an OKX Security integration — removed from scope; deferred.)_
- [ ] **Step 2: Verify** — list a card, buy from a second wallet; the royalty split is reflected on-chain. Screenshot.
- [ ] **Step 3: Commit** — `git add app/(app)/market && git commit -m "feat: marketplace browse/list/buy"`.

### Task 5.4: Rental browse/list/rent/settle/cancel

**Files:** Create `frontend/app/(app)/rentals/page.tsx`, `frontend/components/RentalActions.tsx`.

- [ ] **Step 1:** Browse rentable cards (`/api/rentals`) with stamina + next-matchday availability. List-for-rent (3 modes: Fixed/FloorPegged/Suggested) via `listForRent(tokenId, mode, priceValue)`; price preview uses `resolveRentalPrice` + `setFloorPrice` feed. Rent: `rentCard(tokenId, matchday)` (USDC approve first) → card becomes RENTING-IN; per-matchday exclusivity enforced on-chain. Owner `settleRental` post-lock; renter `cancelRental` pre-lock (90% refund shown via `rentalCancelSplit`).
- [ ] **Step 1b: Auto-list at floor% (FR-R5/US-12 — Must).** Owner toggle that creates a **standing** `FloorPegged` listing (price tracks the indexed floor via the Task 7.2 feeder) so an idle card stays rentable across **every** matchday until delisted — confirm the rental listing is standing, not per-matchday, and add a "Stop auto-listing" control (`delistRental`). This is the passive-income path P2 expects.
- [ ] **Step 1c: Postponement refund (FR-R7/US — Must).** When a fixture is postponed/cancelled, surface a "Refund (match postponed)" action calling `refundPostponed(tokenId, matchday)` (wrapper from Task 5.1), driven by the lifecycle's `RefundedPostponed` event / API-Football fixture-status check.
- [ ] **Step 2: Verify** — list a card for rent, rent from another wallet, see 4907 user set; cancel pre-lock shows 90% refund; settle post-lock pays 88/10/2 (`rentalSplit`); flip auto-list-at-floor and confirm a standing listing appears + is rentable next matchday; trigger a postponed-fixture refund path. Screenshot.
- [ ] **Step 3: Commit** — `git add app/(app)/rentals components/RentalActions.tsx && git commit -m "feat: rental market UI (list/rent/settle/cancel, 3 modes, auto-list-at-floor, postponement refund)"`.

### Task 5.5: Portfolio + public profile

**Files:** Create `frontend/app/(app)/portfolio/page.tsx`, `frontend/app/(app)/u/[address]/page.tsx`, `frontend/app/api/profile/route.ts`.

- [ ] **Step 1:** Portfolio: own cards, RENTING-OUT (listed/active leases), RENTING-IN, LOCKED-IN-LINEUP (`/api/portfolio`), with clear state chips (FR-R/US-13). Career stats placeholder until season data.
- [ ] **Step 2:** `GET /api/profile?address=` → the wallet's ManagerCup cards + summary stats from the **indexer** (Supabase) → public manager profile at `/u/[address]`. _(External multi-token wallet holdings via OKX wallet-portfolio were removed from scope; the profile surfaces our on-chain card holdings.)_
- [ ] **Step 3: Verify** — portfolio shows all 4 states correctly across two wallets; `/u/<addr>` renders the wallet's cards. Screenshot.
- [ ] **Step 4: Commit** — `git add app/(app)/portfolio app/(app)/u app/api/profile && git commit -m "feat: portfolio + public profile (from indexer)"`.

**Milestone M3 reached: full card economy.**

---

# PHASE 6 — Full gameplay + analytics

Goal: the real lineup builder with live synergy/stamina/OOP feedback, the live ticker, and the day-after report.

### Task 6.1: Client synergy mirrors

**Files:** Create `frontend/lib/business/synergyPreview.ts`, test.

- [ ] **Step 1:** `previewLineup(draft, cardMeta[]): { countryMult, activeSynergies, oopFlags, staminaFlags, perCardTraitHints }` reusing `synergy.ts` + `nationCounts` + `staminaModifier` + `OUT_OF_POSITION_PENALTY` — pure, so the builder shows the exact multipliers the oracle will apply (no divergence). Test a couple of drafts.
- [ ] **Step 2: Commit** — `git add lib/business/synergyPreview.ts && git commit -m "feat: client synergy/stamina/OOP preview (mirrors oracle math)"`.

### Task 6.2: Lineup builder

**Files:** Create `frontend/app/(app)/play/builder/page.tsx`, `frontend/components/Pitch.tsx`, `frontend/components/CardChip.tsx`.

- [ ] **Step 1:** Formation picker (6 from `FORMATIONS`), drag-drop 11 controllable cards into position slots (native HTML5 DnD — no new dep), captain/vice selection, one chip selector (balances from `chipBalance`). Live panel from `previewLineup`: country synergy tier, active formation synergies, OOP penalties (red slot), stamina Fresh/Fatigued badges. Validate with `validateLineup` before enabling commit; commit via `TxButton` (`commitLineup`). Wildcard/FreeHit stamina semantics shown.
- [ ] **Step 1b: Accessibility (§8.5/US-15 — Must).** Drag-drop must have a **keyboard-operable** equivalent: every card and slot is a focusable control with a "select card → choose slot" Enter/click path (do not rely on pointer DnD alone). Add ARIA roles/labels on the pitch + slots and an `aria-live` region announcing synergy/OOP/stamina changes as the user builds. Synergy and stamina states use **icon + text** (not color alone) on the color-blind-safe palette from Task 0.8. Builder targets **WCAG 2.1 AA**.
- [ ] **Step 2: Verify** — build across all 6 formations; trigger a formation synergy (e.g. Tiki-Taka) and watch the badge + per-card multiplier light up; OOP and stamina warnings correct; commit succeeds and exclusivity is enforced. **Then build + commit a full lineup using only the keyboard** (no mouse), confirming live-region announcements. GIF.
- [ ] **Step 3: Commit** — `git add app/(app)/play/builder components/Pitch.tsx components/CardChip.tsx && git commit -m "feat: lineup builder with live synergy/stamina/OOP + keyboard-accessible alternative"`.

### Task 6.3: Live scoring replay + ticker

**Files:** Create `frontend/services/livescore/replay.ts`, `frontend/app/(app)/live/[matchday]/page.tsx`.

- [ ] **Step 1:** `replay.ts` reads the real finished fixture's event timeline (from `match_events`/API-Football events endpoint with minute stamps), emits them on a controlled clock, computing running `scoreCard` totals per committed lineup, and writes incremental rows to a Supabase `live_scores` table (add to schema) OR pushes via Supabase Realtime channel `live:<matchday>`.
- [ ] **Step 2:** `live/[matchday]/page.tsx` subscribes (supabase-js Realtime) and renders a per-card running ticker + leaderboard movement (≤5s updates, FR-S3/US-17).
- [ ] **Step 3: Verify** — start `replay`, watch the ticker climb in the browser to the same final total the oracle computes. GIF.
- [ ] **Step 4: Commit** — `git add services/livescore app/(app)/live supabase/migrations && git commit -m "feat: live scoring replay + realtime ticker"`.

### Task 6.4: Day-after report

**Files:** Create `frontend/app/(app)/report/[matchday]/page.tsx`, `frontend/app/api/report/route.ts`.

- [ ] **Step 1:** `GET /api/report?matchday=&wallet=` computes (server, from `scores` + `match_events` + `lib/business`): decile rank, within-tier rank, your lineup vs counterfactual best-possible lineup (greedy from available pool), captain pick vs best captain, chip-use efficiency, trait-synergy heatmap data (§4.10). Render charts (lightweight, hand-rolled bars — no chart dep required).
- [ ] **Step 2: Verify** — for the scored matchday, the report renders real numbers reproducible by the verifier. Screenshot.
- [ ] **Step 3: Commit** — `git add app/(app)/report app/api/report && git commit -m "feat: day-after report (counterfactual, decile, captain efficiency)"`.

_(Task 6.5 removed — OKX dex-swap any-token entry (FR-O4) and the x402-gated premium analytics were OKX OnchainOS integrations, cut from scope. Contest entry stays USDC-direct (the always-on path); the day-after report (Task 6.4) shows all analytics with no premium gate.)_

**Milestone M4 reached: full gameplay + analytics.**

---

# PHASE 7 — Season, lifecycle automation, transparency, insurance, polish

Goal: season aggregation + claim, the matchday cron, the transparency page (incl. which OKX skill powers what), DNP insurance UI, gas/wallet-state UX, and the final demo polish.

### Task 7.1: Season leaderboard aggregation + claim

**Files:** Create `frontend/services/oracle/season.ts`, `frontend/app/(app)/leaderboard/page.tsx`, `frontend/app/api/season/route.ts`.

- [ ] **Step 1:** `season.ts`: aggregate every matchday's per-wallet score (`scores` table) across the Cup, apply the season prize policy (top-100 from the 2% rake pool; #1 ceremonial), build the season payout tree (`payoutLeaf`), `submitSeasonRoot`. Persist ranks/proofs.
- [ ] **Step 2:** Leaderboard screen reads aggregated standings; `GET /api/season?wallet=` returns the season claim proof; claim via `claimSeason` (`TxButton`), guarded by `seasonFinalized`.
- [ ] **Step 3: Verify** — aggregate ≥2 scored matchdays, post season root, claim. Screenshot.
- [ ] **Step 4: Commit** — `git add services/oracle/season.ts app/(app)/leaderboard app/api/season && git commit -m "feat: season leaderboard aggregation + claim"`.

### Task 7.2: Matchday lifecycle cron

**Files:** Create `frontend/services/lifecycle/cron.ts`; add write wrappers `lockMatchday`/`cancelMatchday`/`settleMatchday` to `writes.ts`.

- [ ] **Step 1:** A scheduler that, per fixture in `lib/data/fixtures`: `configureMatchday(open)` at T−12h, `lock(m)` at T−10m, trigger `services/oracle/publish` after final whistle (real-match completion check via API-Football status), `settle(m)`, and `RentalMarket.settle` for active leases; `createContest` (free + Common Open $1) per matchday; periodic `setFloorPrice` feeder from indexed marketplace medians. Idempotent (checks matchday status before each transition).
- [ ] **Step 2:** Add `"lifecycle": "tsx services/lifecycle/cron.ts"`. For the demo, a `--matchday <m> --now` flag fast-forwards one matchday's transitions.
- [ ] **Step 3: Verify** — run the fast-forward for the demo matchday: configure→lock→publish→settle all execute and statuses advance on-chain.
- [ ] **Step 4: Commit** — `git add services/lifecycle lib/actions/writes.ts package.json && git commit -m "feat: matchday lifecycle cron (configure/lock/publish/settle + contests + floor feed)"`.

### Task 7.3: DNP insurance UI

**Files:** Modify `rentals/page.tsx`; create `frontend/components/InsureToggle.tsx`.

- [ ] **Step 1:** On rent, offer "Insure this rental" (+20% premium via `insurancePremium`); `insureRental(matchday, tokenId, rentalCost)`. After the oracle posts the DNP root, if the player got 0 minutes, show "Claim DNP refund" → `claimDnp(matchday, tokenId, rentalCost, proof)` (proof from a new `GET /api/dnp-proof` reading the DNP tree). Show payout = 100% rental + 50% premium (`insurancePayout`).
- [ ] **Step 2: Verify** — insure a rental whose player DNP'd in the scored fixture; claim refund succeeds. Screenshot.
- [ ] **Step 3: Commit** — `git add app/(app)/rentals components/InsureToggle.tsx app/api/dnp-proof && git commit -m "feat: DNP insurance opt-in + claim"`.

### Task 7.4: Transparency page (lists OKX skill usage + verifier)

**Files:** Create `frontend/app/(app)/transparency/page.tsx`, `frontend/app/api/dispute/route.ts`.

- [ ] **Step 1:** Document (FR-T1/T2/T3): oracle signers + threshold (read from `ScoreOracle`), data source (API-Football + which fixture), the scoring formula + the §4.2/§4.3 scalar-collapse modeling note (Phase 2), all 11 contract addresses (linked to OKLink), the verifier command + how to re-run. Links to preserved `match_events`. Also document: **audit status** (FR-T3 — "pre-mainnet third-party audit pending; X Layer testnet only," shown alongside the deployed addresses since no audit exists yet — stated, not implied), the **unclaimed-prize rollover** policy + the escrow-lock limitation (Task 7.6), and the **same-lineup review flags** (`lineup_flags`, FR-CT10).
- [ ] **Step 1b: Dispute reporting flow (FR-T4/US-25 — Must).** `POST /api/dispute` `{ wallet?, matchday?, contestId?, kind, message }` → validate (boundary) + insert into `disputes` via `supabaseAdmin()` (anon-insert RLS also permits it; the server route adds rate-limiting + validation). Add a "Report a disagreement" form on the transparency page (and a link from the day-after report, Task 6.4) with `kind` = score/payout/data/other; on submit show a tracking id. This is the FR-T4 Must.
- [ ] **Step 2: Verify** — page renders live signer/threshold + addresses + OKX-skill table; submitting the dispute form inserts a `disputes` row and returns a tracking id. Screenshot.
- [ ] **Step 3: Commit** — `git add app/(app)/transparency app/api/dispute && git commit -m "feat: transparency page (oracle, formula, addresses, OKX skills, verifier) + dispute reporting flow"`.

### Task 7.5: Wallet-state UX + gas estimator + final demo polish

**Files:** Modify `components/WalletButton.tsx`, `components/TxButton.tsx`; create `frontend/app/(app)/settings/page.tsx`.

- [ ] **Step 1:** Wallet-state UX (FR-O6): Connected / Insufficient Gas (OKB) / Insufficient USDC banners (read balances; OKB via `publicClient.getBalance`); include the FR-O2/US-02 "get OKB gas via OKX exchange / on-ramp" instructions. Gas estimator on `TxButton` already from the viem preflight (Task 3.2). Settings page: faucet USDC, view chip balances, claim history, and a **"Replay tutorial"** entry (clears the `localStorage` walkthrough flag, FR-O5).
- [ ] **Step 2:** Run the full happy path in the browser end-to-end (connect → onboard → rent/buy/pack → build lineup → enter → live ticker → after publish → claim → report → season), capture a GIF per the hackathon demo-video bonus.
- [ ] **Step 3: Commit** — `git add app/(app)/settings components && git commit -m "feat: wallet-state UX + gas estimator + settings"`.

### Task 7.6: Unclaimed-prize rollover policy (FR-CT8)

> **Contract reality (verified against `contracts/src/ContestEscrow.sol`):** the deployed `ContestEscrow` has **no sweep / reclaim / rollover function** — USDC left unclaimed stays locked in the escrow, and the contract is immutable. So an *on-chain* sweep of unclaimed funds is **impossible without a contract upgrade** (out of hackathon scope; documented as a known limitation). We honor the rollover **economically** instead: value unclaimed past a deadline is added to a future **free** contest's prize pool, funded from the **treasury** (which legitimately receives rake via `takeRake`). No fake on-chain sweep, no pretending the stuck escrow is recoverable.

**Files:** Create `frontend/services/oracle/rollover.ts`, `frontend/app/api/rollover/route.ts`.

- [ ] **Step 1:** `computeRollover(contestId, deadlineDays)`: from `scores` (who was owed) minus on-chain `claimed[id][wallet]` reads, sum the amount still unclaimed after `claim_deadline = finalized_at + N days` (N documented, e.g. 14). Upsert a `contest_rollover` row (`unclaimed`, `claim_deadline`, `status='pending'`, `computed_block`).
- [ ] **Step 2:** When the next free contest is created (Task 7.2), top up its advertised prize pool from the **treasury** by the pending rollover total — a treasury USDC transfer reflected in that contest's payout tree at finalization — then mark `status='rolled'` + `rolled_into_contest_id`. The rolled value reaches winners through the normal Merkle payout, fully on-chain claimable.
- [ ] **Step 3:** `GET /api/rollover` returns the ledger (pending/rolled, amounts, deadlines) for the transparency page (Task 7.4 documents the policy + the escrow-lock limitation).
- [ ] **Step 4: Verify** — with a finalized contest that has an unclaimed leaf, run the rollover past a simulated deadline; assert a `contest_rollover` row exists and the next free pool reflects the topped-up amount. Screenshot the transparency ledger.
- [ ] **Step 5: Commit** — `git add services/oracle/rollover.ts app/api/rollover && git commit -m "feat: unclaimed-prize rollover policy (treasury-funded, FR-CT8) + escrow-lock limitation documented"`.

**Milestone M5 reached: season + transparency + insurance + rollover + dispute flow + polish + OKX woven throughout.**

---

## Self-review (spec coverage check)

Per-FR, with the task that delivers it. Items NOT delivered are listed under "Honestly deferred" — none are claimed done.

- **Cards (FR-C1–C8):** ERC-721/4907 + tiers/caps/no-burn = deployed contracts; deterministic stats + 2 traits per player = Tasks 2.4–2.5. **FR-C6 cosmetic URI:** placeholder CID (art deferred). ✅ (C6 partial)
- **Packs (FR-P1/P2/P4/P5):** commit-reveal buy/reveal + published rates + animation = Tasks 2.5, 5.2. **FR-P3 Diamond = v1.5 deferred.** ✅
- **Marketplace (FR-M1/M3/M4):** fixed-price + on-chain royalty + filters = Tasks 5.1, 5.3. **FR-M2 auctions = v1.5 deferred; FR-M5 wash-trade detection (OKX Security) = removed from scope.** ✅
- **Rentals (FR-R1–R9):** per-matchday 4907, 3 modes, 88/10/2, exclusivity, **auto-list@floor (R5, Task 5.4 Step 1b)**, DNP insurance (R6, Task 7.3), **postponement refund (R7, Task 5.4 Step 1c)**, 90% pre-lock (R8), inherited stamina (R9). ✅
- **Gameplay (FR-G1–G8):** 6 formations + captain/VC + chips + stamina + OOP = Phase 6.2; country synergy in SDK; trait + formation synergy = Phase 2. **FR-G9/G10 = v1.5/v2 deferred.** ✅
- **Scoring (FR-S1–S6):** real engine on real events = Phase 4; deterministic Merkle roots; live ticker (S3) via Supabase Realtime replay = 6.3; verifier CLI (S5) = 4.5; day-after report (S6) = 6.4. ✅
- **Contests (FR-CT1/CT2/CT4/CT7/CT9):** free + Common Open = 3.4; ranked §5.2 payouts = 4.3–4.4; season = 7.1; Merkle claims throughout; on-chain 1-entry/wallet + onboarding anti-sybil = 3.3 + `ContestEscrow.enter`. **FR-CT8 rollover = Task 7.6 (treasury-funded; on-chain sweep impossible on the deployed contract — documented).** **FR-CT10 same-lineup detection = Task 4.4 Step 2b (flag-for-review).** **FR-CT3/CT5/CT6 = v1.5/v2 deferred.** ✅
- **Onboarding/wallet (FR-O1/O2/O3/O5/O6):** **Privy** login modal covers OKX Wallet (O1) + MetaMask/WalletConnect/embedded (O2) = Task 0.8; starter squad = 3.3; **interactive walkthrough (O5, Task 3.3 Step 2b)**; wallet-state UX (O6) = 7.5. **FR-O4 dex-swap entry (OKX) = removed from scope.** ✅
- **Trust/transparency (FR-T1–T4):** transparency page + formula + addresses (T1/T3, with audit-pending stated) = 7.4; preserved `match_events` (T2); **dispute reporting flow (T4, Task 7.4 Step 1b)**; verifier = 4.5. ✅
- **Accessibility (§8.5):** color-blind-safe palette + focus tokens (0.8); **keyboard-operable lineup builder + ARIA/live regions (6.2 Step 1b)**; WCAG 2.1 AA on core flows. ✅
- **OKX OnchainOS:** **removed from scope** (no `onchainos` CLI, no OKX_* keys). Wallet auth is **Privy** (OKX Wallet still available through the Privy login modal, no keys). Write preflight uses viem (3.2); marketplace has no security scan (5.3); profiles read from the indexer (5.5); contest entry is USDC-direct (6.5 removed).
- **Read layer (PRD §8.6):** Supabase + indexer Phase 1; RLS 0.6. ✅
- **Honestly deferred (documented, NOT claimed done):**
  - *PRD Should/Could by design:* FR-M2 auctions, FR-P3 Diamond pack, FR-CT3 Rare+/Whale tiers, FR-CT5 private leagues, FR-CT6 H2H, FR-G9 earned chips, FR-G10 bench/Bench Boost.
  - *Out of hackathon scope (stated as limitations):* FR-CT8 **on-chain** unclaimed-sweep (deployed `ContestEscrow` has no sweep fn — economic rollover only, Task 7.6); §8.3 mainnet third-party audit; §8.4 legal/geofencing/KYC; FR-C6 bulk card-art/IPFS (placeholder CID).
  - *Removed by scope decision:* all **OKX OnchainOS** CLI integrations — FR-O4 dex-swap, FR-M5 OKX wash-trade scan, OKX wallet-portfolio profiles, gateway preflight (replaced by viem), and x402 premium analytics. OKX **Wallet** connect (FR-O1) is unaffected.

## Open items to confirm during execution

1. **Demo fixture** — user to name the real finished match (drives Task 4.1 ingest + 6.3 replay) and provide `API_FOOTBALL_KEY`.
2. **Supabase service-role key** — required for indexer/oracle/onboarding (server `.env`); not the publishable key.
3. **Player catalog breadth** — Phase 2.4 covers the demo teams; expanding to 48×26 is mechanical content work post-demo.
4. **Privy app id** — `NEXT_PUBLIC_PRIVY_APP_ID` from the Privy dashboard for wallet auth (FR-O1/O2, Task 0.8). Without it, `providers.tsx` renders without wallet context (no login).
5. **Rollover N-days + treasury float** — confirm the unclaimed-claim deadline (default 14d) and that the treasury holds enough rake to fund the rollover top-up (Task 7.6).

---

*Plan ready. Execute with superpowers:subagent-driven-development (fresh subagent per task + review) or superpowers:executing-plans (inline batches with checkpoints). Phases 0→4 are the critical path to a real, verifiable, demoable build; 5→7 add breadth and the full OKX surface.*
