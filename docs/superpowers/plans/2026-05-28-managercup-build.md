# ManagerCup Off-chain + Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the already-deployed ManagerCup contracts + SDK into a fully playable, on-chain-verifiable World Cup fantasy game on X Layer testnet — real UI, real API-Football scoring, real Merkle payouts, no mocks/stubs/fillers.

**Architecture:** Build entirely on the existing `frontend/` (Next.js 16 + `lib/` SDK + business logic) and the deployed `contracts/`. Add: a Postgres-backed indexer (`frontend/services/indexer`) + read API (`frontend/app/api/*`), a real scoring pipeline (`frontend/services/oracle`) that ingests API-Football and posts genuine Merkle roots, player content + trait/formation synergy (`frontend/lib/data`, `frontend/lib/business/synergy.ts`), all 13 UI screens, a live-scoring replay (`frontend/services/livescore`), and a matchday lifecycle cron (`frontend/services/lifecycle`). Every user-facing number is recomputable from on-chain roots + public match data by `frontend/verifier`.

**Tech Stack:** TypeScript, Next.js 16 (App Router), wagmi v3 + viem v2, React Query, Tailwind v4, Postgres + drizzle-orm, vitest (new), tsx, API-Football (`v3.football.api-sports.io`).

---

## Reference docs (read before starting)

- Build spec: `docs/superpowers/specs/2026-05-28-offchain-frontend-build-design.md`
- Product spec: `docs/superpowers/specs/2026-05-28-football-card-fantasy-design.md` (scoring §4.8/§4.9, traits §4.2, formation synergy §4.3, country synergy §4.5, contest curve §5.2)
- Contract reference: `CONTRACTS.md`; deployed addresses: `contracts/deployments/xlayer-testnet.json`
- `PRD.md` (functional requirements FR-*)
- **`frontend/AGENTS.md`: this is Next.js 16 with breaking changes — consult `frontend/node_modules/next/dist/docs/` before writing any `app/` code.**

## What already exists (do NOT rebuild)

- Deployed contracts (testnet) + `frontend/lib/contracts/addresses.ts`.
- Typed ABIs `frontend/lib/abis/*`; viem clients `frontend/lib/clients.ts`; wagmi `frontend/lib/wagmi.ts`.
- Read wrappers `frontend/lib/actions/reads.ts`; write wrappers `frontend/lib/actions/writes.ts` (every contract).
- Business logic `frontend/lib/business/`: `scoring.ts` (`scoreCard`, `baseEventPoints`, `countrySynergyMult`, `captainMult`, `lineupTotal`, `CardScoreInput`), `merkle.ts` (`payoutLeaf`, `dnpLeaf`, `buildMerkleTree`, `buildPayoutTree`, `verifyProof`), `stamina.ts` (`staminaModifier`), `lineup.ts` (`validateLineup`, `isEligibleForContest`, `nationCounts`, `LineupDraft`), `fees.ts`, `pricing.ts`, `packs.ts`, `format.ts` (`toUsdc`, `fmtUsdc`).
- Domain types `frontend/lib/types.ts`; constants/tables `frontend/lib/constants.ts`.
- Full on-chain lifecycle `frontend/lib/lifecycle.ts` + `frontend/scripts/{demo-flow,lifecycle,read-state}.ts`, env bootstrap `frontend/scripts/_env.ts`.

## Conventions

- All new commands run from `frontend/` unless noted.
- Tests use **vitest**. Pure-logic tasks are TDD (failing test → implement → pass → commit). DB/API/oracle tasks use integration tests against a test Postgres / live testnet. UI tasks are verified by running the dev server in a browser (project rule).
- Secrets live in the **repo-root** `.env` (already gitignored, loaded by `scripts/_env.ts` via `../.env`). New vars: `DATABASE_URL`, `API_FOOTBALL_KEY`.
- Commit after every green step. Never use `--no-verify`.

---

# PHASE 0 — Foundations & tooling

Goal: test harness, Postgres, DB schema, address-drift guard, app shell. Independently verifiable.

### Task 0.1: Add vitest test harness

**Files:**
- Modify: `frontend/package.json` (scripts + devDeps)
- Create: `frontend/vitest.config.ts`
- Create: `frontend/lib/business/__tests__/format.test.ts`

- [ ] **Step 1: Install vitest**

Run: `cd frontend && npm i -D vitest @vitest/coverage-v8`
Expected: added to devDependencies.

- [ ] **Step 2: Add config**

Create `frontend/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  test: { environment: "node", include: ["lib/**/*.test.ts", "services/**/*.test.ts", "verifier/**/*.test.ts"] },
  resolve: { alias: { "@": resolve(__dirname, ".") } },
});
```

- [ ] **Step 3: Add scripts to `frontend/package.json`**

Add under `"scripts"`: `"test": "vitest run"`, `"test:watch": "vitest"`.

- [ ] **Step 4: Write a failing test** in `frontend/lib/business/__tests__/format.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { toUsdc, fmtUsdc } from "../format";

describe("usdc format", () => {
  it("round-trips 12.5 USDC at 6 decimals", () => {
    expect(toUsdc(12.5)).toBe(12_500000n);
    expect(fmtUsdc(12_500000n)).toBe("12.5");
  });
});
```

- [ ] **Step 5: Run** — `npm test`. Expected: PASS (proves harness + existing `format.ts`). If `fmtUsdc` formats differently, adjust the expectation to the actual output (read `lib/business/format.ts` first), keep the round-trip assertion.

- [ ] **Step 6: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/vitest.config.ts frontend/lib/business/__tests__/format.test.ts
git commit -m "test: add vitest harness"
```

### Task 0.2: Postgres via docker-compose + env

**Files:**
- Create: `infra/docker-compose.yml`
- Modify: `.env.example`

- [ ] **Step 1: Create `infra/docker-compose.yml`**

```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: managercup
      POSTGRES_PASSWORD: managercup
      POSTGRES_DB: managercup
    ports: ["5432:5432"]
    volumes: ["managercup_pg:/var/lib/postgresql/data"]
volumes:
  managercup_pg:
```

- [ ] **Step 2: Extend `.env.example`** (append):

```
DATABASE_URL=postgres://managercup:managercup@localhost:5432/managercup
API_FOOTBALL_KEY=YOUR_API_FOOTBALL_KEY
```

- [ ] **Step 3: Start it** — Run: `docker compose -f infra/docker-compose.yml up -d` then `docker compose -f infra/docker-compose.yml ps`. Expected: postgres container `running`/healthy.

- [ ] **Step 4: Commit**

```bash
git add infra/docker-compose.yml .env.example
git commit -m "chore: add postgres docker-compose and env vars"
```

### Task 0.3: DB layer (drizzle schema + connection)

**Files:**
- Create: `frontend/lib/db/schema.ts`, `frontend/lib/db/index.ts`, `frontend/drizzle.config.ts`
- Modify: `frontend/package.json` (deps + db scripts)

- [ ] **Step 1: Install** — Run: `cd frontend && npm i drizzle-orm postgres && npm i -D drizzle-kit`.

- [ ] **Step 2: Create `frontend/lib/db/schema.ts`** (the indexer read model):

```ts
import { pgTable, text, integer, bigint, boolean, timestamp, primaryKey, index } from "drizzle-orm/pg-core";

export const cards = pgTable("cards", {
  tokenId: bigint("token_id", { mode: "bigint" }).primaryKey(),
  playerId: text("player_id").notNull(),
  tier: integer("tier").notNull(),
  serial: integer("serial").notNull(),
  mintBatch: integer("mint_batch").notNull(),
  owner: text("owner").notNull(),
  user: text("user").default("0x0000000000000000000000000000000000000000").notNull(),
  userExpires: bigint("user_expires", { mode: "bigint" }).default(0n).notNull(),
  originalBuyer: text("original_buyer").notNull(),
  updatedBlock: bigint("updated_block", { mode: "bigint" }).notNull(),
}, (t) => ({ ownerIdx: index("cards_owner_idx").on(t.owner), playerIdx: index("cards_player_idx").on(t.playerId) }));

export const marketplaceListings = pgTable("marketplace_listings", {
  tokenId: bigint("token_id", { mode: "bigint" }).primaryKey(),
  seller: text("seller").notNull(),
  price: bigint("price", { mode: "bigint" }).notNull(),
  active: boolean("active").notNull(),
});

export const rentalListings = pgTable("rental_listings", {
  tokenId: bigint("token_id", { mode: "bigint" }).primaryKey(),
  owner: text("owner").notNull(),
  mode: integer("mode").notNull(),
  priceValue: bigint("price_value", { mode: "bigint" }).notNull(),
  active: boolean("active").notNull(),
});

export const rentals = pgTable("rentals", {
  matchday: integer("matchday").notNull(),
  tokenId: bigint("token_id", { mode: "bigint" }).notNull(),
  renter: text("renter").notNull(),
  owner: text("owner").notNull(),
  paid: bigint("paid", { mode: "bigint" }).notNull(),
  settled: boolean("settled").default(false).notNull(),
}, (t) => ({ pk: primaryKey({ columns: [t.matchday, t.tokenId] }) }));

export const lineups = pgTable("lineups", {
  matchday: integer("matchday").notNull(),
  wallet: text("wallet").notNull(),
  tokenIds: text("token_ids").notNull(), // JSON array of decimal strings
  formation: integer("formation").notNull(),
  captainIdx: integer("captain_idx").notNull(),
  viceIdx: integer("vice_idx").notNull(),
  chipId: integer("chip_id").notNull(),
}, (t) => ({ pk: primaryKey({ columns: [t.matchday, t.wallet] }) }));

export const contests = pgTable("contests", {
  id: bigint("id", { mode: "bigint" }).primaryKey(),
  matchday: integer("matchday").notNull(),
  entryFee: bigint("entry_fee", { mode: "bigint" }).notNull(),
  rakeBps: integer("rake_bps").notNull(),
  minTier: integer("min_tier").notNull(),
  pool: bigint("pool", { mode: "bigint" }).notNull(),
  rakeTaken: boolean("rake_taken").default(false).notNull(),
});

export const contestEntries = pgTable("contest_entries", {
  contestId: bigint("contest_id", { mode: "bigint" }).notNull(),
  wallet: text("wallet").notNull(),
}, (t) => ({ pk: primaryKey({ columns: [t.contestId, t.wallet] }) }));

export const scoreRoots = pgTable("score_roots", {
  matchday: integer("matchday").primaryKey(),
  scoreRoot: text("score_root").notNull(),
  dnpRoot: text("dnp_root").notNull(),
});

// raw + normalized match data, preserved publicly for re-verification (PRD FR-T2)
export const matchEvents = pgTable("match_events", {
  matchday: integer("matchday").notNull(),
  playerId: text("player_id").notNull(),
  events: text("events").notNull(), // JSON of MatchEvents
}, (t) => ({ pk: primaryKey({ columns: [t.matchday, t.playerId] }) }));

export const cursor = pgTable("cursor", {
  contract: text("contract").primaryKey(),
  lastBlock: bigint("last_block", { mode: "bigint" }).notNull(),
});
```

- [ ] **Step 3: Create `frontend/lib/db/index.ts`**:

```ts
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL not set");
const client = postgres(url);
export const db = drizzle(client, { schema });
export { schema };
```

- [ ] **Step 4: Create `frontend/drizzle.config.ts`**:

```ts
import { defineConfig } from "drizzle-kit";
export default defineConfig({
  schema: "./lib/db/schema.ts",
  out: "./lib/db/migrations",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL! },
});
```

- [ ] **Step 5: Add scripts** to `frontend/package.json`: `"db:gen": "drizzle-kit generate"`, `"db:push": "dotenv -e ../.env -- drizzle-kit push"`. Install dotenv-cli: `npm i -D dotenv-cli`.

- [ ] **Step 6: Push schema** — Run: `npm run db:push`. Expected: tables created (no errors). Verify: `docker compose -f ../infra/docker-compose.yml exec postgres psql -U managercup -d managercup -c "\dt"` lists all tables.

- [ ] **Step 7: Commit**

```bash
git add frontend/lib/db frontend/drizzle.config.ts frontend/package.json frontend/package-lock.json
git commit -m "feat: add postgres read-model schema (drizzle)"
```

### Task 0.4: Address-drift guard + gitignore .agents

**Files:**
- Modify: `.gitignore`
- Create: `frontend/lib/contracts/__tests__/addresses.test.ts`

- [ ] **Step 1: Ignore the vendored skills** — append to `.gitignore`:

```
# Vendored agent skills (installed via npx skills add)
.agents/
```

- [ ] **Step 2: Write failing test** `frontend/lib/contracts/__tests__/addresses.test.ts` asserting the SDK matches the deployment JSON:

```ts
import { describe, it, expect } from "vitest";
import { ADDRESSES } from "../addresses";
import deployment from "../../../../contracts/deployments/xlayer-testnet.json";

describe("address book", () => {
  it("matches the deployed addresses JSON exactly", () => {
    for (const [name, addr] of Object.entries(deployment.contracts)) {
      expect(ADDRESSES[name as keyof typeof ADDRESSES].toLowerCase()).toBe(addr.toLowerCase());
    }
  });
});
```

- [ ] **Step 3: Enable JSON import** — ensure `frontend/tsconfig.json` has `"resolveJsonModule": true` (add if missing).

- [ ] **Step 4: Run** — `npm test`. Expected: PASS. If it fails, fix `addresses.ts` to match the JSON.

- [ ] **Step 5: Commit**

```bash
git add .gitignore frontend/lib/contracts/__tests__/addresses.test.ts frontend/tsconfig.json
git commit -m "test: guard address-book drift; ignore .agents"
```

### Task 0.5: App shell + navigation

**Files:**
- Modify: `frontend/app/layout.tsx`
- Create: `frontend/app/components/Nav.tsx`
- Create routes (empty page stubs that render a heading): `frontend/app/play/page.tsx`, `frontend/app/market/page.tsx`, `frontend/app/rent/page.tsx`, `frontend/app/packs/page.tsx`, `frontend/app/portfolio/page.tsx`, `frontend/app/leaderboard/page.tsx`

- [ ] **Step 1: Read Next 16 docs** — open `frontend/node_modules/next/dist/docs/` and skim App Router + route handler guides (per AGENTS.md). Note any deprecations.

- [ ] **Step 2: Create `Nav.tsx`** — a client component with wagmi connect/disconnect + links to `/play /market /rent /packs /portfolio /leaderboard`. Use the existing connect pattern from `app/page.tsx` (`useConnect({ connector: injected() })`).

- [ ] **Step 3: Add `<Nav/>`** to `app/layout.tsx` inside the providers wrapper.

- [ ] **Step 4: Create the six page stubs** — each a server component returning `<main><h1>{Title}</h1></main>`.

- [ ] **Step 5: Verify in browser** — Run: `npm run dev`; open `http://localhost:3000`; confirm nav renders, links route, wallet connects (OKX/MetaMask), each page shows its heading.

- [ ] **Step 6: Commit**

```bash
git add frontend/app
git commit -m "feat: app shell with nav and route stubs"
```

---

# PHASE 1 — Indexer + read API

Goal: chain logs → Postgres → typed read endpoints. Powers every browse/portfolio/leaderboard view.

### Task 1.1: Event log decoders

**Files:**
- Create: `frontend/services/indexer/decode.ts`
- Test: `frontend/services/indexer/decode.test.ts`

- [ ] **Step 1: Identify events** — read each contract's events in `contracts/src/*.sol` (Transfer, UpdateUser/ERC-4907, listing/rental/pack/contest/lineup/root events). Confirm exact names + args against `frontend/lib/abis/*`.

- [ ] **Step 2: Write failing test** with a real decoded `Transfer` log shape (use viem `decodeEventLog` against `CardNFTAbi`):

```ts
import { describe, it, expect } from "vitest";
import { decodeCardTransfer } from "./decode";
import { encodeEventTopics, encodeAbiParameters } from "viem";
import { CardNFTAbi } from "../../lib/abis";

it("decodes a CardNFT Transfer into {from,to,tokenId}", () => {
  const topics = encodeEventTopics({ abi: CardNFTAbi, eventName: "Transfer",
    args: { from: "0x0000000000000000000000000000000000000000", to: "0x1111111111111111111111111111111111111111", tokenId: 7n } });
  const out = decodeCardTransfer({ topics, data: "0x" } as any);
  expect(out.tokenId).toBe(7n);
  expect(out.to.toLowerCase()).toBe("0x1111111111111111111111111111111111111111");
});
```

- [ ] **Step 3: Run** — `npm test decode`. Expected: FAIL (no `decodeCardTransfer`).

- [ ] **Step 4: Implement `decode.ts`** — export typed decoders using viem `decodeEventLog` for each indexed event (CardNFT Transfer + ERC-4907 user update; Marketplace list/cancel/buy; RentalMarket list/rent/settle/cancel; PackSale bought/revealed; GameRegistry lineup committed; ContestEscrow created/entered; ScoreOracle roots finalized). Each returns a plain typed object.

- [ ] **Step 5: Run** — `npm test decode`. Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/services/indexer/decode.ts frontend/services/indexer/decode.test.ts
git commit -m "feat: indexer event decoders"
```

### Task 1.2: Upsert handlers (logs → DB rows)

**Files:**
- Create: `frontend/services/indexer/handlers.ts`
- Test: `frontend/services/indexer/handlers.test.ts` (integration, requires test DB)

- [ ] **Step 1: Write failing integration test** — against the dev Postgres: applying a decoded `Transfer` (mint) then a second `Transfer` (sale) leaves exactly one `cards` row with the latest owner. Use a unique tokenId per run; clean up after.

```ts
import { describe, it, expect, beforeAll } from "vitest";
import { db, schema } from "../../lib/db";
import { applyCardTransfer } from "./handlers";
import { eq } from "drizzle-orm";

it("upserts card owner idempotently", async () => {
  const id = BigInt(Date.now());
  await applyCardTransfer({ from: "0x0", to: "0xAAA...", tokenId: id }, 100n);
  await applyCardTransfer({ from: "0xAAA...", to: "0xBBB...", tokenId: id }, 101n);
  const rows = await db.select().from(schema.cards).where(eq(schema.cards.tokenId, id));
  expect(rows.length).toBe(1);
  expect(rows[0].owner.toLowerCase()).toBe("0xbbb...");
});
```

(Use full 40-hex addresses in the actual test.)

- [ ] **Step 2: Run** — `dotenv -e ../.env -- npm test handlers`. Expected: FAIL.

- [ ] **Step 3: Implement `handlers.ts`** — one `apply*` function per decoded event, doing `insert ... onConflictDoUpdate`. On a mint Transfer (`from == 0x0`), also read `cardMeta`/`cardStats`/`originalBuyer` via `lib/actions/reads.ts` to fill the row. Update `updatedBlock` to the higher block; ignore stale (lower-block) updates.

- [ ] **Step 4: Run** — `dotenv -e ../.env -- npm test handlers`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/services/indexer/handlers.ts frontend/services/indexer/handlers.test.ts
git commit -m "feat: indexer upsert handlers"
```

### Task 1.3: Indexer runner

**Files:**
- Create: `frontend/services/indexer/run.ts`
- Modify: `frontend/package.json` (script `"indexer": "dotenv -e ../.env -- tsx services/indexer/run.ts"`)

- [ ] **Step 1: Implement `run.ts`** — for each contract: read `cursor.lastBlock` (default a configured `START_BLOCK` from the deployment), `publicClient.getLogs({ address, fromBlock, toBlock })` in ranges (e.g. 2000 blocks), decode (Task 1.1) → handle (Task 1.2) → advance cursor. Loop with a small poll interval and a 3-block confirmation buffer. Log progress.

- [ ] **Step 2: Determine START_BLOCK** — Run: `cast block-number --rpc-url https://testrpc.xlayer.tech` is not available; instead read the earliest deployment block by querying the deployer's first contract tx, or set `START_BLOCK` to a value safely before `deployedAt`. Store it in `services/indexer/run.ts` as a constant with a comment.

- [ ] **Step 3: Run a one-shot backfill** — Run: `npm run indexer` for ~30s; Ctrl-C. Verify: `psql ... -c "select count(*) from cards;"` returns the cards minted by prior `lifecycle.ts`/`demo-flow.ts` runs (non-zero).

- [ ] **Step 4: Commit**

```bash
git add frontend/services/indexer/run.ts frontend/package.json
git commit -m "feat: indexer runner with cursor + backfill"
```

### Task 1.4: Read API — portfolio + card detail

**Files:**
- Create: `frontend/app/api/portfolio/route.ts`, `frontend/app/api/cards/[tokenId]/route.ts`
- Test: `frontend/app/api/__tests__/portfolio.test.ts`

- [ ] **Step 1: Write failing test** — seed one `cards` row owned by wallet W, call the route's handler with `?wallet=W`, expect the card in `owned`. (Import the `GET` function directly and pass a `new Request(url)`.)

- [ ] **Step 2: Run** — `dotenv -e ../.env -- npm test portfolio`. Expected: FAIL.

- [ ] **Step 3: Implement `/api/portfolio`** — `GET ?wallet=` returns `{ owned, rentedIn, rentedOut, lockedInLineup }`: `owned` = cards where `owner == wallet AND user == 0x0`; `rentedIn` = cards where `user == wallet AND userExpires > now`; `rentedOut` = cards where `owner == wallet AND user != 0x0`; `lockedInLineup` = cards whose tokenId is in any current open-matchday lineup for the wallet. Serialize bigints to strings.

- [ ] **Step 4: Implement `/api/cards/[tokenId]`** — returns the card row + live `cardController` + active rental/market listing + tier name.

- [ ] **Step 5: Run** — `dotenv -e ../.env -- npm test portfolio`. Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/app/api/portfolio frontend/app/api/cards frontend/app/api/__tests__
git commit -m "feat: portfolio + card-detail read API"
```

### Task 1.5: Read API — marketplace, rentals, contests, matchday

**Files:**
- Create: `frontend/app/api/marketplace/route.ts`, `frontend/app/api/rentals/route.ts`, `frontend/app/api/contests/route.ts`, `frontend/app/api/matchday/[id]/route.ts`
- Test: `frontend/app/api/__tests__/browse.test.ts`

- [ ] **Step 1: Write failing test** — seed two active marketplace listings (different tiers), call `/api/marketplace?tier=1`, expect only the tier-1 card.

- [ ] **Step 2: Run** — Expected: FAIL.

- [ ] **Step 3: Implement routes:**
  - `/api/marketplace` — active listings joined to `cards`; filters `player,country,tier,position,price` (country/position resolved via `lib/data` player map from Task 2.1; until then filter on tier/price and join playerId).
  - `/api/rentals` — active rental listings joined to `cards` + `staminaOf` + next-matchday availability (`rentals` has no row for the next matchday).
  - `/api/contests` — contests for a given `?matchday=`, with live `pool` and entrant count.
  - `/api/matchday/[id]` — status (from `GameRegistry` via reads) + lock time + whether the connected wallet has a lineup (`?wallet=`).

- [ ] **Step 4: Run** — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/app/api/marketplace frontend/app/api/rentals frontend/app/api/contests frontend/app/api/matchday frontend/app/api/__tests__/browse.test.ts
git commit -m "feat: browse + contest + matchday read API"
```

### Task 1.6: Onboarding API (real Starter Squad mint)

**Files:**
- Create: `frontend/app/api/onboard/route.ts`, `frontend/lib/server/signer.ts`
- Test: `frontend/app/api/__tests__/onboard.test.ts`

- [ ] **Step 1: Create `lib/server/signer.ts`** — builds a script wallet client from `process.env.PRIVATE_KEY` (the minter/deployer key); **server-only** (throw if `window` defined). Reuse `getScriptWalletClient` from `lib/clients.ts`.

- [ ] **Step 2: Write failing test** — calling onboard for a fresh wallet returns the chosen `playerIds` and marks it claimed; a second call returns `alreadyClaimed: true`. (Track claims in a new `onboarded` table — add to `schema.ts` + push.)

- [ ] **Step 3: Run** — Expected: FAIL.

- [ ] **Step 4: Implement `/api/onboard`** — `POST { wallet, signature }`: verify the signed message (anti-sybil, FR-CT9), check `onboarded` table + on-chain (wallet has 0 cards), pick 5 Common `playerId`s from `lib/data`, call `airdropStarterSquad(serverWallet, wallet, playerIds)` (real tx), record claim, return tx hash. Idempotent.

- [ ] **Step 5: Run** — Expected: PASS (mints real cards on testnet — ensure deployer has OKB).

- [ ] **Step 6: Commit**

```bash
git add frontend/app/api/onboard frontend/lib/server frontend/lib/db/schema.ts frontend/app/api/__tests__/onboard.test.ts
git commit -m "feat: onboarding API mints real starter squad"
```

---

# PHASE 2 — Player content + synergy computation

Goal: real player data and the trait (§4.2) + formation-synergy (§4.3) logic the scoring engine already accepts.

### Task 2.1: Player taxonomy + fixtures data

**Files:**
- Create: `frontend/lib/data/nations.ts`, `frontend/lib/data/players.ts`, `frontend/lib/data/fixtures.ts`, `frontend/lib/data/index.ts`
- Test: `frontend/lib/data/players.test.ts`

- [ ] **Step 1: Define `Player` type + data shape.** In `players.ts`:

```ts
import { keccak256, toHex, type Hex } from "viem";
import type { Position, Stats, Tier } from "../types";

export type TraitName =
  | "ShotStopper" | "SweeperKeeper" | "PenaltySpecialist"
  | "Wall" | "BallPlaying" | "Aggressor" | "Wingback"
  | "Playmaker" | "BoxToBox" | "BallWinner" | "Creator" | "Anchor"
  | "Poacher" | "TargetMan" | "Winger" | "InsideForward" | "False9";

export interface Player {
  playerId: Hex;          // keccak256("NATION-NUM-Name")
  apiFootballId: number;  // join key to API-Football
  name: string;
  nation: string;         // ISO3, e.g. "FRA"
  position: Position;
  traits: [TraitName, TraitName]; // primary, secondary
  baseStats: Record<Tier, Stats>; // deterministic per tier
}

export const pid = (nation: string, num: number, name: string): Hex =>
  keccak256(toHex(`${nation}-${num}-${name}`));
```

Populate **real** players for the demo's teams (the nations in the chosen fixture, ~2 squads of 23 → 46 players minimum) with real names/positions/nations and assigned traits per §4.2. Base stats deterministic; tier variants scale via `TIER_BONUS` semantics (stats themselves can be equal across tiers — tier bonus is applied in scoring).

- [ ] **Step 2: `nations.ts`** — ISO3 → display name + flag emoji for the demo nations. `fixtures.ts` — the real finished fixture(s): `{ matchday, apiFixtureId, kickoff, home, away }`.

- [ ] **Step 3: Write failing test** — `playerId`s are unique and `pid` is deterministic; every player has 2 traits and a valid position; nation codes exist in `nations.ts`.

- [ ] **Step 4: Run** — `npm test players`. Expected: FAIL then implement data → PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/data
git commit -m "feat: real player taxonomy + fixtures data"
```

### Task 2.2: Trait modifiers (§4.2)

**Files:**
- Create: `frontend/lib/business/synergy.ts`
- Test: `frontend/lib/business/synergy.test.ts`

- [ ] **Step 1: Write failing test** for `traitModifier`:

```ts
import { describe, it, expect } from "vitest";
import { traitModifier } from "./synergy";
// Poacher: +25% goals
it("poacher boosts goal points by 25%", () => {
  expect(traitModifier("FWD", "Poacher", "goal")).toBeCloseTo(1.25);
  expect(traitModifier("FWD", "Poacher", "assist")).toBeCloseTo(1.0);
});
// Playmaker: +25% assists
it("playmaker boosts assists by 25%", () => {
  expect(traitModifier("MID", "Playmaker", "assist")).toBeCloseTo(1.25);
});
```

- [ ] **Step 2: Run** — Expected: FAIL.

- [ ] **Step 3: Implement `traitModifier(position, trait, eventKind)`** — a table mapping each trait to its event-specific multiplier per §4.2 (e.g. ShotStopper +20% saves, Wall +15% clean-sheet, Creator +30% key passes, Winger +20% assists, TargetMan +20% headed-goals, etc.). `eventKind ∈ {"goal","assist","cleanSheet","tackle","keyPass","save","all"}`. Default 1.0.

- [ ] **Step 4: Run** — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/business/synergy.ts frontend/lib/business/synergy.test.ts
git commit -m "feat: trait event modifiers (spec 4.2)"
```

### Task 2.3: Formation synergies (§4.3)

**Files:**
- Modify: `frontend/lib/business/synergy.ts`
- Modify: `frontend/lib/business/synergy.test.ts`

- [ ] **Step 1: Write failing tests** — `formationSynergy` returns the right multiplier+label for: Wide Play (2+ Winger/Wingback in 4-3-3 or 3-4-3 → +5% assists/key passes), Iron Wall (3+ Wall in 5-3-2/5-4-1 → +10% CS), Tiki-Taka (3+ Playmaker/Creator in 4-3-3/3-5-2 → +8% MID), Counter-Attack (2+ Poacher + 2+ BallWinner → +12% goals), Brick Defense (5+ Wall/Sweeper → +15% CS, −5% attacking). Each returns `{ mult: number, label: string | null, scope: "assist"|"keyPass"|"cleanSheet"|"goal"|"mid"|"attack"|"all" }[]`.

- [ ] **Step 2: Run** — Expected: FAIL.

- [ ] **Step 3: Implement `formationSynergy(players, formationName)`** — count traits per §4.3 triggers and return the active synergies.

- [ ] **Step 4: Run** — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/business/synergy.ts frontend/lib/business/synergy.test.ts
git commit -m "feat: formation synergies (spec 4.3)"
```

### Task 2.4: `scoreLineup` — full per-lineup scoring wiring

**Files:**
- Create: `frontend/lib/business/scoreLineup.ts`
- Test: `frontend/lib/business/scoreLineup.test.ts`

- [ ] **Step 1: Write failing test** — a hand-computed lineup (known events, formation, captain, chip, 5 same-nation cards) yields an expected total. Cross-check one card's `final` against manual stacking (raw × tier × trait × oop × stamina × captain × country × formation).

- [ ] **Step 2: Run** — Expected: FAIL.

- [ ] **Step 3: Implement `scoreLineup(input)`** — input: the 11 cards with `{playerId, position, scoringSlotPosition, tier, stamina, events}`, formation index, captainIdx, viceIdx (promote vice if captain DNP per §4.4), chipId, and a player→nation/traits resolver from `lib/data`. For each card: compute `sameNationCount` (via `nationCounts`), `traitModifier` for the dominant event (apply per-event using `baseEventPoints` decomposition — implement a per-event scorer that applies trait+formation scope to the matching event before summing), then call `scoreCard`. Apply Doubler (2× clean-sheet for DEF/GK) and FreeHit/Wildcard semantics via the stamina/events inputs as documented in `scoring.ts`. Return per-card `ScoredCard[]` + `total`.

- [ ] **Step 4: Run** — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/business/scoreLineup.ts frontend/lib/business/scoreLineup.test.ts
git commit -m "feat: full per-lineup scoring with traits + synergies"
```

### Task 2.5: On-chain stats seeding

**Files:**
- Create: `frontend/scripts/seed-stats.ts`

- [ ] **Step 1: Implement `seed-stats.ts`** — import players from `lib/data`, for each `(player, tier)` call `setPlayerStats(serverWallet, player.playerId, tier, player.baseStats[tier])` (owner key). Skip if already set (read `tierStats` if exposed, else catch revert). Reuse `scripts/_env.ts`.

- [ ] **Step 2: Run** — `npx tsx scripts/seed-stats.ts`. Expected: stats set for all demo players (real txs). Spot-check with `cardStats` after a mint.

- [ ] **Step 3: Commit**

```bash
git add frontend/scripts/seed-stats.ts
git commit -m "feat: seed deterministic player stats on-chain"
```

---

# PHASE 3 — Real scoring pipeline (oracle) + verifier

Goal: replace placeholder roots with genuine API-Football-derived scores and ranked §5.2 payouts.

### Task 3.1: API-Football client

**Files:**
- Create: `frontend/lib/data/apiFootball.ts`
- Test: `frontend/lib/data/apiFootball.test.ts` (integration; needs `API_FOOTBALL_KEY`)

- [ ] **Step 1: Implement client** — `getFixturePlayers(apiFixtureId)` calling `GET https://v3.football.api-sports.io/fixtures/players?fixture=<id>` with header `x-apisports-key: ${API_FOOTBALL_KEY}`. Return the raw `response` array (per-team player stat blocks).

- [ ] **Step 2: Write integration test** — for the chosen real finished `apiFixtureId`, assert the response has two teams and player stat objects with `games.minutes`, `goals.total`, `goals.assists`, `tackles.total`, `passes.key`, `goals.saves`, `cards.yellow`, etc. Skip the test if `API_FOOTBALL_KEY` is unset (`it.skipIf`).

- [ ] **Step 3: Run** — `dotenv -e ../.env -- npm test apiFootball`. Expected: PASS (real API).

- [ ] **Step 4: Commit**

```bash
git add frontend/lib/data/apiFootball.ts frontend/lib/data/apiFootball.test.ts
git commit -m "feat: API-Football fixture-players client"
```

### Task 3.2: Match-events normalizer

**Files:**
- Create: `frontend/services/oracle/normalize.ts`
- Test: `frontend/services/oracle/normalize.test.ts`
- Create fixture snapshot: `frontend/services/oracle/__fixtures__/fixture-<id>.json` (saved real API response)

- [ ] **Step 1: Save a real snapshot** — Run a tiny script (or `curl`) to save the chosen fixture's `/fixtures/players` JSON into `__fixtures__/fixture-<id>.json`. This is **real data committed as a deterministic test input** (not a mock).

- [ ] **Step 2: Write failing test** — `normalizeFixture(snapshot)` returns a `Map<apiFootballId, MatchEvents>`; assert a known player's minutes/goals/assists match the snapshot, `cleanSheet` true iff defender/keeper played 60+ and team conceded 0, `goalsConceded` set for DEF/GK.

- [ ] **Step 3: Run** — Expected: FAIL.

- [ ] **Step 4: Implement `normalize.ts`** — map API-Football player stat blocks → `MatchEvents` (fields in `lib/types.ts`). Compute `cleanSheet`/`goalsConceded` from team goals-against + minutes; `manOfTheMatch` from API rating if available (highest rated on winning side, else false). Keyed by `apiFootballId`.

- [ ] **Step 5: Run** — Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/services/oracle/normalize.ts frontend/services/oracle/normalize.test.ts frontend/services/oracle/__fixtures__
git commit -m "feat: normalize API-Football stats to MatchEvents"
```

### Task 3.3: Score-tree leaf + builder

**Files:**
- Modify: `frontend/lib/business/merkle.ts`
- Test: `frontend/lib/business/merkle.test.ts`

- [ ] **Step 1: Write failing test** for `scoreLeaf` + `buildScoreTree`:

```ts
import { describe, it, expect } from "vitest";
import { scoreLeaf, buildScoreTree, verifyProof } from "./merkle";

it("score leaf encodes (wallet, matchday, milliScore) and proves", () => {
  const entries = [
    { wallet: "0x1111111111111111111111111111111111111111", matchday: 5, milliScore: 42137n },
    { wallet: "0x2222222222222222222222222222222222222222", matchday: 5, milliScore: 1000n },
  ];
  const { root, leaves } = buildScoreTree(entries);
  const leaf = scoreLeaf(entries[0].wallet, entries[0].matchday, entries[0].milliScore);
  const tree = buildScoreTree(entries);
  expect(verifyProof(tree.getProof(leaf), root, leaf)).toBe(true);
});
```

- [ ] **Step 2: Run** — Expected: FAIL.

- [ ] **Step 3: Implement** in `merkle.ts`: `scoreLeaf(wallet, matchday, milliScore)` = `keccak256(encodePacked(["address","uint32","int256"], [wallet, matchday, milliScore]))`; `buildScoreTree(entries)` returns `{ root, getProof, leaves }` reusing `buildMerkleTree`. Define `milliScore = BigInt(Math.round(finalScore * 1000))` as the canonical integer encoding (document it).

- [ ] **Step 4: Run** — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/business/merkle.ts frontend/lib/business/merkle.test.ts
git commit -m "feat: score-root merkle leaf + builder"
```

### Task 3.4: Ranking + prize curve (§5.2)

**Files:**
- Create: `frontend/lib/business/prizes.ts`
- Test: `frontend/lib/business/prizes.test.ts`

- [ ] **Step 1: Write failing tests:**
  - `rankEntrants` sorts by score desc, tie-break by earliest commit then wallet asc; returns 1-based ranks.
  - `distributePrizes(rankedScores, netPool)` implements §5.2: 1st 15%, 2nd 8%, 3rd 5%, 4–10 2.5% each, 11–50 0.5% each, 51–250 0.15% each, only top 25% paid; sum of payouts ≤ netPool; rounding remainder added to 1st place. Test with 1000 entrants and a $9,200 net pool → assert 1st = 0.15×9200, count of paid = 250, total ≤ netPool.
  - single-entrant edge: 1 entrant gets the whole net pool.

- [ ] **Step 2: Run** — Expected: FAIL.

- [ ] **Step 3: Implement `prizes.ts`** — `rankEntrants(entries)` and `distributePrizes(ranked, netPool): PayoutLeaf[]` using bps math on `netPool` (bigint), capping at top 25%, dropping ineligible (score ≤ 0 or below minTier — caller filters), and assigning the rounding remainder to rank 1.

- [ ] **Step 4: Run** — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/business/prizes.ts frontend/lib/business/prizes.test.ts
git commit -m "feat: contest ranking + prize curve (spec 5.2)"
```

### Task 3.5: DNP tree builder

**Files:**
- Modify: `frontend/lib/business/merkle.ts`
- Modify: `frontend/lib/business/merkle.test.ts`

- [ ] **Step 1: Write failing test** — `buildDnpTree(tokenIds)` builds a tree of `dnpLeaf(tokenId)`; a tokenId in the set proves, one not in it does not.

- [ ] **Step 2: Run** — Expected: FAIL.

- [ ] **Step 3: Implement `buildDnpTree(tokenIds)`** reusing `dnpLeaf` + `buildMerkleTree`. If empty, return a sentinel zero root (`0x00..00`) — document that an empty DNP set posts the zero root.

- [ ] **Step 4: Run** — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/business/merkle.ts frontend/lib/business/merkle.test.ts
git commit -m "feat: DNP merkle tree builder"
```

### Task 3.6: Oracle orchestrator (real roots on-chain)

**Files:**
- Create: `frontend/services/oracle/run.ts`
- Modify: `frontend/package.json` (`"oracle": "dotenv -e ../.env -- tsx services/oracle/run.ts"`)
- Test: `frontend/services/oracle/run.test.ts` (integration, testnet)

- [ ] **Step 1: Implement `run.ts run(matchday, apiFixtureId, contestIds[])`:**
  1. Ingest: `getFixturePlayers(apiFixtureId)` → `normalizeFixture` → persist to `match_events`.
  2. Build per-player `MatchEvents` map keyed by our `playerId` (join via `lib/data` `apiFootballId → playerId`).
  3. Read all committed lineups for `matchday` (from `lineups` table / `getLineup`).
  4. For each lineup: resolve each card's player/position/tier/stamina (from `cards` + `lib/data`), run `scoreLineup` → `milliScore`.
  5. `buildScoreTree(entries)` + `buildDnpTree(zeroMinuteTokenIds)` → `submitScoreRoot(serverWallet, matchday, scoreRoot, dnpRoot)`.
  6. For each contest: filter eligible entrants by `minTier`, `rankEntrants`, `distributePrizes(net = pool − rake)`, `buildPayoutTree` → `submitPayoutRoot(serverWallet, contestId, root)`. Persist payout leaves for `/api/claim-proof`.

- [ ] **Step 2: Write integration test** — for a fresh matchday: configure it, commit one real lineup (reuse lifecycle helpers), enter a contest, run `run(...)`, then assert `ScoreOracle.roots(matchday) != 0x0` and `payoutFinalized(contestId) == true` and the verifier (Task 3.7) recomputes the same root.

- [ ] **Step 3: Run** — `dotenv -e ../.env -- npm test oracle`. Expected: PASS (real testnet txs + real API).

- [ ] **Step 4: Commit**

```bash
git add frontend/services/oracle/run.ts frontend/services/oracle/run.test.ts frontend/package.json
git commit -m "feat: oracle posts real score + payout roots from API-Football"
```

### Task 3.7: Verifier CLI

**Files:**
- Create: `frontend/verifier/verify.ts`
- Modify: `frontend/package.json` (`"verify:scores": "dotenv -e ../.env -- tsx verifier/verify.ts"`)
- Test: `frontend/verifier/verify.test.ts`

- [ ] **Step 1: Implement `verify.ts verify(matchday)`** — load preserved `match_events`, recompute every lineup's `milliScore` via `scoreLineup`, rebuild `buildScoreTree`, compare to `scoreRoot(matchday)` (on-chain read). Print PASS/FAIL + the root. Same for a contest payout root.

- [ ] **Step 2: Write test** — after Task 3.6's matchday, `verify(matchday)` returns `{ ok: true, root }` equal to the on-chain root.

- [ ] **Step 3: Run** — Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add frontend/verifier frontend/package.json
git commit -m "feat: public verifier CLI (re-run scoring vs on-chain root)"
```

---

# PHASE 4 — Frontend: the vertical loop

Goal: a new wallet can play end-to-end in the browser. Each task verified by running the dev server. Use React Query against the Phase-1 API for reads, and `lib/actions/writes.ts` via `getBrowserWalletClient()` (or `useWriteContract`) for writes. Show tx pending/confirmed state and refetch on confirm.

### Task 4.1: Wallet + state UX

**Files:** Modify `frontend/app/components/Nav.tsx`; Create `frontend/app/components/WalletState.tsx`, `frontend/lib/hooks/useWalletState.ts`.

- [ ] **Step 1:** Implement `useWalletState` — returns `{ connected, address, okbBalance, usdcBalance, status }` where `status ∈ Connected | InsufficientGas | InsufficientUSDC` (OKB via `publicClient.getBalance`, USDC via `usdcBalance`).
- [ ] **Step 2:** Render a `WalletState` chip in the nav + a faucet button (calls `usdcFaucet`) on testnet.
- [ ] **Step 3: Verify in browser** — connect OKX wallet; chip shows balances; faucet increases USDC; status flips to InsufficientGas when OKB is 0.
- [ ] **Step 4: Commit** — `git add frontend/app frontend/lib/hooks && git commit -m "feat: wallet state UX + testnet faucet"`.

### Task 4.2: Onboarding (Starter Squad + chips)

**Files:** Create `frontend/app/onboarding/page.tsx`, `frontend/app/components/OnboardCard.tsx`.

- [ ] **Step 1:** Page: if wallet owns 0 cards (via `/api/portfolio`), show "Claim your free Starter Squad" → sign message → `POST /api/onboard` → on success, show the 5 minted cards. Then "Claim baseline chips" → `claimBaselineChips` write.
- [ ] **Step 2: Verify in browser** — fresh wallet: claim squad (5 real cards appear), claim chips (balances show 1× each via `chipBalance`).
- [ ] **Step 3: Commit** — `git commit -m "feat: onboarding flow (starter squad + chips)"`.

### Task 4.3: Portfolio / profile

**Files:** Create `frontend/app/portfolio/page.tsx` (replace stub), `frontend/app/components/CardTile.tsx`, `frontend/app/components/CardStatePill.tsx`.

- [ ] **Step 1:** Fetch `/api/portfolio?wallet=`; render four sections OWN / RENTING-IN / RENTING-OUT / LOCKED-IN-LINEUP with a status pill per card (FR US-13).
- [ ] **Step 2: Verify in browser** — owned starter cards show under OWN; after renting (Phase 5) others move sections.
- [ ] **Step 3: Commit** — `git commit -m "feat: portfolio with card states"`.

### Task 4.4: Lineup builder

**Files:** Create `frontend/app/play/page.tsx` (replace stub), `frontend/app/components/lineup/{FormationPicker,Pitch,Slot,CaptainControls,ChipPicker,SynergyPanel}.tsx`, `frontend/lib/hooks/useLineupDraft.ts`.

- [ ] **Step 1:** `useLineupDraft` holds `{ formationIndex, slots[11], captainIdx, viceIdx, chipId }`; assign owned/rented cards to slots; compute live: position legality vs `FORMATIONS[idx].slots` (OOP warning), `validateLineup`, country synergy (`nationCounts` + `countrySynergyMult`), formation synergy (`formationSynergy`), stamina pills (`staminaModifier`).
- [ ] **Step 2:** Pitch UI: pick formation, place 11 controllable cards into slots, set captain/VC, choose a chip; SynergyPanel shows active bonuses + warnings; disable Commit until `validateLineup` passes.
- [ ] **Step 3:** Commit button → `commitLineup(browserWallet, matchday, tokenIds, formationIndex, captainIdx, viceIdx, chipId)`; show confirmation with all multipliers (FR-G* / US-16).
- [ ] **Step 4: Verify in browser** — build a valid lineup from starter cards, see synergy/stamina/OOP feedback update live, commit succeeds on testnet, `hasLineup` true after.
- [ ] **Step 5: Commit** — `git commit -m "feat: lineup builder with live validation + synergy"`.

### Task 4.5: Contest selector + entry

**Files:** Create `frontend/app/contests/page.tsx`, `frontend/app/components/ContestCard.tsx`.

- [ ] **Step 1:** List contests for the active matchday (`/api/contests`); show entry fee, live pool, entrants, projected payout (using `distributePrizes` on current ranks if scored, else even-split estimate). Free + Common Open.
- [ ] **Step 2:** Enter → if `entryFee > 0`, `usdcApprove(ContestEscrow)` then `enterContest`; free → `enterContest` directly. One-entry guard from `entered`.
- [ ] **Step 3: Verify in browser** — enter the free contest after committing a lineup; entry reflected; pool/entrants update.
- [ ] **Step 4: Commit** — `git commit -m "feat: contest selector + entry"`.

### Task 4.6: Live scoring ticker

**Files:** Create `frontend/app/live/[matchday]/page.tsx`, `frontend/app/components/LiveTicker.tsx`. (Depends on Phase 6 SSE; until then poll `/api/day-after` style endpoint.)

- [ ] **Step 1:** Subscribe to `/api/live/[matchday]` (SSE, Task 6.1); render running points per card with multipliers applied (reuse `scoreLineup` client-side on streamed events).
- [ ] **Step 2: Verify in browser** — start `services/livescore` replay; ticker updates within ~5s per event.
- [ ] **Step 3: Commit** — `git commit -m "feat: live scoring ticker"`.

### Task 4.7: Day-after report

**Files:** Create `frontend/app/report/[matchday]/page.tsx`, `frontend/app/api/day-after/route.ts`.

- [ ] **Step 1:** `/api/day-after?matchday=&wallet=` computes: user's lineup score, the counterfactual best-possible lineup from their controllable cards (greedy/optimal over owned+rented), best captain pick, chip efficiency, global decile rank (from all scored lineups). Use `scoreLineup` + stored `match_events`.
- [ ] **Step 2:** Page renders rank, counterfactual delta, captain efficiency, trait-synergy heatmap (US-18).
- [ ] **Step 3: Verify in browser** — after a scored matchday, the report shows real numbers matching the verifier.
- [ ] **Step 4: Commit** — `git commit -m "feat: day-after report with counterfactuals"`.

### Task 4.8: Claim flow

**Files:** Create `frontend/app/claim/page.tsx`, `frontend/app/api/claim-proof/route.ts`.

- [ ] **Step 1:** `/api/claim-proof?contestId=&wallet=` returns `{ amount, proof }` from the persisted payout tree (Task 3.6). Page lists claimable contests; Claim → ensure `takeRake` done (call if needed), then `claimContest(browserWallet, contestId, amount, proof)`.
- [ ] **Step 2: Verify in browser** — after oracle posts payout root, winner claims; USDC balance increases; claim disabled after.
- [ ] **Step 3: Commit** — `git commit -m "feat: contest payout claim flow"`.

---

# PHASE 5 — Card economy UI

### Task 5.1: Pack buy + reveal

**Files:** Create `frontend/app/packs/page.tsx` (replace stub), `frontend/app/components/PackReveal.tsx`.

- [ ] **Step 1:** Show Bronze/Silver/Gold with prices (`PACK_NAME`, read `packPrice`) + published pull rates (`PACK_TIER_CUM`, FR-P4). Buy → `usdcApprove(PackSale)` + `buyPack` → read `PackBought` commitId → poll block number until `targetBlock + 1` (16-block delay; `PACK_REVEAL_DELAY_BLOCKS`) → `revealPack(commitId)` → animate the 5 revealed cards (read from Transfer logs / portfolio refetch).
- [ ] **Step 2: Verify in browser** — buy a Bronze pack, wait out the delay, reveal animates 5 real minted cards.
- [ ] **Step 3: Commit** — `git commit -m "feat: pack buy + reveal animation"`.

### Task 5.2: Marketplace browse + trade

**Files:** Create `frontend/app/market/page.tsx` (replace stub), `frontend/app/components/{MarketFilters,ListingRow,ListForSaleDialog}.tsx`.

- [ ] **Step 1:** Browse `/api/marketplace` with filters (player/country/tier/position/price, FR-M4). Buy → `usdcApprove(Marketplace)` + `buyListing`. List own card → `approveCard(Marketplace)` + `listForSale`. Cancel → `cancel`. Show 5% royalty split note (`MARKETPLACE_SPLIT`).
- [ ] **Step 2: Verify in browser** — list a card, see it in browse, buy from a second wallet (or self via another address), royalty reflected.
- [ ] **Step 3: Commit** — `git commit -m "feat: marketplace browse + list/buy/cancel"`.

### Task 5.3: Rental browse + lease + floor feeder

**Files:** Create `frontend/app/rent/page.tsx` (replace stub), `frontend/app/components/{RentFilters,RentalRow,ListForRentDialog}.tsx`, `frontend/services/lifecycle/floorFeeder.ts`.

- [ ] **Step 1:** Browse `/api/rentals` with filters + stamina + next-matchday availability. Rent → `usdcApprove(RentalMarket)` + `rentCard(tokenId, matchday)`. List for rent → `listForRent(tokenId, mode, priceValue)` (3 modes, `PricingMode`). Cancel pre-lock → `cancelRental` (90% refund note). Show 88/10/2 split (`RENTAL_SPLIT`).
- [ ] **Step 2:** `floorFeeder.ts` — compute floor per `(player,tier)` from indexed marketplace listings → `setFloorPrice` (owner key) for FloorPegged mode.
- [ ] **Step 3: Verify in browser** — list a card for rent, rent it from another address, rented card becomes usable in that wallet's lineup builder (controller = renter), portfolio states update.
- [ ] **Step 4: Commit** — `git commit -m "feat: rental browse + lease + floor feeder"`.

### Task 5.4: Card detail page

**Files:** Create `frontend/app/cards/[tokenId]/page.tsx`.

- [ ] **Step 1:** Render `/api/cards/[tokenId]`: stats, traits (from `lib/data`), tier+serial, owner/renter, rental + market availability, and inline list/rent actions (US-13). Verified scarcity count (mintedCount via reads).
- [ ] **Step 2: Verify in browser** — open a card; data + actions correct.
- [ ] **Step 3: Commit** — `git commit -m "feat: card detail page"`.

---

# PHASE 6 — Live scoring + lifecycle services

### Task 6.1: Live-scoring replay (SSE)

**Files:** Create `frontend/services/livescore/replay.ts`, `frontend/app/api/live/[matchday]/route.ts`.
- [ ] **Step 1:** `replay.ts` — given a real finished fixture's timeline (derive incremental `MatchEvents` snapshots from API-Football events endpoint, ordered by minute), publish partial states to a channel (in-memory pub/sub or Postgres LISTEN/NOTIFY).
- [ ] **Step 2:** `/api/live/[matchday]` — SSE endpoint streaming the latest per-player partial events; client recomputes scores via `scoreLineup`.
- [ ] **Step 3: Verify in browser** — run replay; the Task 4.6 ticker advances with real event timing (compressed clock).
- [ ] **Step 4: Commit** — `git commit -m "feat: live-scoring replay over SSE"`.

### Task 6.2: Matchday lifecycle cron

**Files:** Create `frontend/services/lifecycle/cron.ts`; Modify `frontend/package.json` (`"lifecycle": "dotenv -e ../.env -- tsx services/lifecycle/cron.ts"`).
- [ ] **Step 1:** `cron.ts` — for each configured fixture: `configureMatchday(m, lock)`, `createContest` (free + Common Open $1, `DEFAULT_CONTEST_RAKE_BPS`), at lock `lock(m)`, trigger `oracle.run(...)`, then `settle(m)` + settle rentals. Schedule via timers; idempotent (skip already-advanced states).
- [ ] **Step 2: Verify** — Run against a fresh near-future matchday; confirm state transitions on-chain (`isOpen/isSettled`) and that the oracle posted roots.
- [ ] **Step 3: Commit** — `git commit -m "feat: matchday lifecycle cron"`.

---

# PHASE 7 — Season, transparency, polish, stretch

### Task 7.1: Season leaderboard + claim

**Files:** Create `frontend/app/leaderboard/page.tsx` (replace stub), `frontend/app/api/season/route.ts`, `frontend/services/oracle/season.ts`.
- [ ] **Step 1:** `/api/season` aggregates every scored matchday's lineup totals per wallet → standings. `season.ts` builds the season payout tree (top 100, 2% rake pool per §5.4) → `submitSeasonRoot`. Page renders standings + claim (`claimSeason`) via proof.
- [ ] **Step 2: Verify in browser** — after ≥2 scored matchdays, standings aggregate correctly; #1 can claim.
- [ ] **Step 3: Commit** — `git commit -m "feat: season leaderboard + claim"`.

### Task 7.2: Transparency page

**Files:** Create `frontend/app/transparency/page.tsx`.
- [ ] **Step 1:** Document oracle signers (from `ScoreOracle` + deployment JSON), threshold, data source (API-Football), the scoring formula (link spec §4.8/§4.9), contract addresses (link OKLink explorer), and how to run the verifier CLI (FR-T1/T2/T3).
- [ ] **Step 2: Verify in browser** — links resolve; addresses match deployment.
- [ ] **Step 3: Commit** — `git commit -m "feat: transparency page"`.

### Task 7.3: Settings + gas estimator

**Files:** Create `frontend/app/settings/page.tsx`, `frontend/app/components/GasEstimator.tsx`.
- [ ] **Step 1:** Show network/addresses; gas estimator using `publicClient.estimateContractGas` for a sample commit (FR-O6). Optionally call OnchainOS `okx-onchain-gateway` for estimation/simulation.
- [ ] **Step 2: Verify in browser** — estimate renders a plausible OKB cost.
- [ ] **Step 3: Commit** — `git commit -m "feat: settings + gas estimator"`.

### Task 7.4: DNP insurance UI

**Files:** Create `frontend/app/components/InsureDialog.tsx`; wire into rental + claim pages.
- [ ] **Step 1:** On a held rental, "Insure (20% premium)" → `usdcApprove(InsurancePool)` + `insureRental(matchday, tokenId, rentalCost)`. After DNP root posts, "Claim DNP" → `claimDnp(matchday, tokenId, rentalCost, proof)` (proof from `/api/claim-proof` extended for DNP, leaf = `dnpLeaf(tokenId)`).
- [ ] **Step 2: Verify in browser** — insure a rental whose player got 0 minutes in the fixture; claim refund + half premium.
- [ ] **Step 3: Commit** — `git commit -m "feat: DNP insurance UI"`.

### Task 7.5 (stretch): OnchainOS integrations

**Files:** Create `frontend/app/components/SwapToUsdc.tsx`; Modify market pages.
- [ ] **Step 1:** `okx-dex-swap` — any-token contest entry: swap to USDC before `enterContest` (FR-O4). `okx-security` — risk-scan a marketplace listing's token/counterparty before buy (FR-M5). Use the installed `.agents/skills/okx-dex-swap` / `okx-security` (requires `OKX_API_KEY/SECRET/PASSPHRASE` env).
- [ ] **Step 2: Verify** — swap path produces USDC and entry succeeds; security scan renders a verdict.
- [ ] **Step 3: Commit** — `git commit -m "feat: OnchainOS swap + security integrations"`.

---

# Final verification (whole-system, no mocks)

- [ ] `cd frontend && npm test` — all unit/integration suites pass.
- [ ] `npm run indexer` (background) — DB tracks chain head (lag < 30s).
- [ ] `npx tsx scripts/seed-stats.ts` — stats seeded for demo players.
- [ ] Run `services/lifecycle` for the demo fixture; confirm on-chain matchday transitions + posted roots.
- [ ] `npm run verify:scores` — recomputed roots equal on-chain `ScoreOracle.roots`/`payoutRoots`.
- [ ] Browser end-to-end on a fresh wallet: connect → starter squad → chips → rent/buy/pack → build+commit lineup → enter free contest → live ticker → day-after report → claim payout. Every value reproducible by the verifier.
- [ ] Confirm no mocked data anywhere except `MockUSDC` (the deployed testnet faucet token) and committed real-API fixture snapshots used as deterministic test inputs.

---

## Self-review notes (coverage)

- PRD §7.1 Cards / §7.2 Packs / §7.3 Marketplace / §7.4 Rentals / §7.5 Gameplay / §7.6 Scoring / §7.7 Contests / §7.8 Onboarding / §7.9 Trust → covered by Phases 1–7 + verifier. (Contracts already implement the on-chain enforcement; this plan builds the off-chain + UI per FR-* not marked v1.5/v2.)
- v1.5 items (insurance UI 7.4, OnchainOS 7.5) included as low-priority since the contracts/SDK already support them.
- Deferred (explicit): bulk card-art → IPFS; mainnet/audit/legal/geofencing.
