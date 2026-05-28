/**
 * cron.ts — Matchday lifecycle scheduler (Task 7.2)
 *
 * Drives every fixture in `lib/data/fixtures` through its on-chain lifecycle:
 *
 *   T−12h  configureMatchday(open) — opens lineup submission
 *   T−10m  lockMatchday            — closes lineup submission
 *   T+FT   publishMatchday         — posts score/DNP/payout Merkle roots (oracle/publish.ts)
 *   T+FT   settleMatchday          — advances GameRegistry status to Settled
 *   T+FT   settleRental(×n)        — settles each active rental for the matchday
 *
 * Additionally (idempotent per matchday):
 *   - createContest × 2  — free contest (entryFee=0) + Common Open ($1 USDC)
 *   - setFloorPrice feed — periodic update from indexed rental medians (Supabase)
 *
 * ⚠️  OWNER / ORACLE-KEY GATE
 * ─────────────────────────────────────────────────────────────────────────────
 * All on-chain transitions (configureMatchday, lockMatchday, cancelMatchday,
 * settleMatchday, createContest, setFloorPrice) are restricted to the contract
 * OWNER (deployer key: 0xA3327d90d087cdddfB99E598E50B5Bdee7fC55bD) via
 * OpenZeppelin's `Ownable.onlyOwner`.  publishMatchday additionally requires
 * the ScoreOracle SIGNER role.  PRIVATE_KEY in the repo-root .env must
 * correspond to the deployer / oracle-signer account or all writes will revert.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Fast-forward (demo mode):
 *   npx tsx services/lifecycle/cron.ts --matchday <m> --now
 *   Executes all pending transitions for matchday <m> immediately, regardless of
 *   wall-clock time.  Useful for the demo without waiting for real-world kickoffs.
 *
 * Normal (production) mode:
 *   npx tsx services/lifecycle/cron.ts
 *   Schedules setInterval loops; each tick checks every fixture in FIXTURES and
 *   applies any transition that has become due.  The process stays alive.
 *
 * Idempotency:
 *   Before every transition the current GameRegistry.matchdays(m) status is read.
 *   A transition is only attempted when the matchday is in the expected predecessor
 *   state; duplicate calls are silently skipped.
 *
 * DO NOT run this script with `npm run dev`.  Use `npx tsx` or the `lifecycle`
 * npm script once `package.json` is updated by the controller agent.
 */

import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
import type { Hex } from "viem";
import { publicClient } from "@/lib/clients";
import { getScriptWalletClient } from "@/lib/clients";
import { ADDRESSES } from "@/lib/contracts/addresses";
import { GameRegistryAbi } from "@/lib/abis/GameRegistry";
import { FIXTURES, type Fixture } from "@/lib/data/fixtures";
import { toUsdc } from "@/lib/business/format";
import {
  configureMatchday,
  lockMatchday,
  settleMatchday,
  cancelMatchday,
  createContest,
  setFloorPrice,
  settleRental,
  waitFor,
} from "@/lib/actions/writes";
import { publishMatchday } from "@/services/oracle/publish";
import { supabaseAdmin } from "@/lib/supabase/server";

// Re-export cancelMatchday so it is accessible to callers importing from this file.
export { cancelMatchday };

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/** Seconds before kickoff at which we open the matchday (T−12h). */
const OPEN_LEAD_SECS = 12 * 60 * 60;
/** Seconds before kickoff at which we lock the matchday (T−10m). */
const LOCK_LEAD_SECS = 10 * 60;
/** Poll interval for the main scheduler loop (ms). */
const POLL_INTERVAL_MS = 60_000;
/** Poll interval for the floor-price feeder (ms). Runs independently. */
const FLOOR_PRICE_INTERVAL_MS = 5 * 60_000;

/**
 * Default contest entry fee for the "Common Open" contest: 1 USDC.
 * Uses the same 6-decimal precision as MockUSDC.
 */
const COMMON_OPEN_ENTRY_FEE = toUsdc(1);
/** Rake for both demo contests (800 bps = 8%). */
const RAKE_BPS = 800;
/** minTier=0 → Common cards accepted (no restriction). */
const MIN_TIER_COMMON = 0;

// ─────────────────────────────────────────────────────────────────────────────
// GameRegistry matchday status enum (mirrors Solidity enum GameRegistry.Status)
// ─────────────────────────────────────────────────────────────────────────────

/** Mirrors `enum GameRegistry.Status { Uninitialised, Open, Locked, Settled, Cancelled }`. */
export const enum MatchdayStatus {
  Uninitialised = 0,
  Open = 1,
  Locked = 2,
  Settled = 3,
  Cancelled = 4,
}

// ─────────────────────────────────────────────────────────────────────────────
// On-chain status helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Read the raw `matchdays(m)` struct from GameRegistry. */
async function readMatchdayStatus(matchday: number): Promise<{ lock: bigint; status: number }> {
  const result = await publicClient.readContract({
    address: ADDRESSES.GameRegistry,
    abi: GameRegistryAbi,
    functionName: "matchdays",
    args: [BigInt(matchday)],
  });
  return { lock: result[0], status: Number(result[1]) };
}

/**
 * True if the matchday has been cancelled on-chain.
 * Exported so callers (e.g. a postponement handler) can skip settlement.
 */
export async function isMatchdayCancelled(matchday: number): Promise<boolean> {
  const s = await readMatchdayStatus(matchday);
  return s.status === MatchdayStatus.Cancelled;
}

// ─────────────────────────────────────────────────────────────────────────────
// API-Football status check
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Check whether the API-Football fixture has reached its final whistle.
 * Returns `true` when status is one of the "finished" codes.
 *
 * API-Football v3 fixture status codes that indicate a finished match:
 *   FT  — Full Time (normal)
 *   AET — After Extra Time
 *   PEN — After Penalties
 *   AWD — Awarded
 *   WO  — Walk Over
 *
 * If `API_FOOTBALL_KEY` is not set, falls back to the static `Fixture.status`
 * value from `lib/data/fixtures.ts` so the demo works without a live key.
 */
async function isFixtureFinished(fixture: Fixture): Promise<boolean> {
  const apiKey = process.env.API_FOOTBALL_KEY;
  if (!apiKey || fixture.fixtureId === 0) {
    // Fallback: trust the static status baked into fixtures.ts.
    return fixture.status === "FINISHED";
  }
  try {
    const url = `https://v3.football.api-sports.io/fixtures?id=${fixture.fixtureId}`;
    const res = await fetch(url, {
      headers: { "x-apisports-key": apiKey },
    });
    if (!res.ok) {
      console.warn(`[lifecycle] API-Football returned ${res.status} for fixture ${fixture.fixtureId} — falling back to static status`);
      return fixture.status === "FINISHED";
    }
    const json = (await res.json()) as {
      response?: Array<{ fixture?: { status?: { short?: string } } }>;
    };
    const short = json.response?.[0]?.fixture?.status?.short ?? "";
    return ["FT", "AET", "PEN", "AWD", "WO"].includes(short);
  } catch (err) {
    console.warn(`[lifecycle] API-Football fetch failed for fixture ${fixture.fixtureId}:`, err);
    return fixture.status === "FINISHED";
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Contest creation (idempotent via Supabase check)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create the two standard contests for a matchday (free + Common Open $1).
 * Idempotent: skips creation if the Supabase `contests` table already has rows
 * for this matchday.
 */
async function ensureContests(
  matchday: number,
  wallet: ReturnType<typeof getScriptWalletClient>,
): Promise<void> {
  const db = supabaseAdmin();
  const { data: existing } = await db
    .from("contests")
    .select("contest_id")
    .eq("matchday", matchday)
    .limit(1);

  if (existing && existing.length > 0) {
    console.log(`[lifecycle] contests already exist for matchday ${matchday} — skipping`);
    return;
  }

  // Free contest (entry fee = 0, rake = 0)
  console.log(`[lifecycle] creating free contest for matchday ${matchday}`);
  const freeTx = await createContest(wallet, matchday, 0n, 0, MIN_TIER_COMMON);
  await waitFor(freeTx);
  console.log(`[lifecycle] free contest tx mined: ${freeTx}`);

  // Common Open ($1 USDC entry fee, RAKE_BPS)
  console.log(`[lifecycle] creating Common Open contest for matchday ${matchday}`);
  const openTx = await createContest(wallet, matchday, COMMON_OPEN_ENTRY_FEE, RAKE_BPS, MIN_TIER_COMMON);
  await waitFor(openTx);
  console.log(`[lifecycle] Common Open contest tx mined: ${openTx}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Floor-price feeder
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Pull median rental prices from the Supabase `rental_listings` table and push
 * them on-chain via `RentalMarket.setFloorPrice`.
 *
 * Schema assumed: rental_listings(player_key bytes32 text, tier int, price_value numeric).
 * If no Supabase data is available the step is silently skipped.
 */
async function feedFloorPrices(
  wallet: ReturnType<typeof getScriptWalletClient>,
): Promise<void> {
  const db = supabaseAdmin();

  // Aggregate median per (player_key, tier) pair.  Using avg as a proxy for median
  // since Supabase PostgREST does not expose a MEDIAN aggregate directly.
  const { data, error } = await db
    .from("rental_listings")
    .select("player_key, tier, price_value")
    .eq("active", true);

  if (error) {
    console.warn(`[lifecycle] floor-price feed: query error — ${error.message}`);
    return;
  }
  if (!data || data.length === 0) {
    console.log(`[lifecycle] floor-price feed: no active listings — skipping`);
    return;
  }

  // Group and compute per-(player, tier) median.
  type RowShape = { player_key: string; tier: number; price_value: string };
  const groups = new Map<string, { prices: bigint[]; player: string; tier: number }>();
  for (const row of data as RowShape[]) {
    const key = `${row.player_key}:${row.tier}`;
    if (!groups.has(key)) {
      groups.set(key, { prices: [], player: row.player_key, tier: row.tier });
    }
    groups.get(key)!.prices.push(BigInt(row.price_value));
  }

  for (const { prices, player, tier } of groups.values()) {
    const sorted = [...prices].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    const mid = Math.floor(sorted.length / 2);
    const median =
      sorted.length % 2 === 1
        ? sorted[mid]
        : (sorted[mid - 1] + sorted[mid]) / 2n;

    try {
      const tx = await setFloorPrice(wallet, player as Hex, tier, median);
      await waitFor(tx);
      console.log(`[lifecycle] setFloorPrice player=${player} tier=${tier} price=${median} mined: ${tx}`);
    } catch (err) {
      console.warn(`[lifecycle] setFloorPrice failed for player=${player} tier=${tier}:`, err);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Active rental settlement
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Settle all active (unsettled) rentals for the given matchday.
 * Reads the `rentals` table from Supabase to get (token_id, matchday) pairs.
 */
async function settleActiveRentals(
  matchday: number,
  wallet: ReturnType<typeof getScriptWalletClient>,
): Promise<void> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("rentals")
    .select("token_id")
    .eq("matchday", matchday)
    .eq("settled", false);

  if (error) {
    console.warn(`[lifecycle] rental settle query error — ${error.message}`);
    return;
  }
  if (!data || data.length === 0) {
    console.log(`[lifecycle] no unsettled rentals for matchday ${matchday}`);
    return;
  }

  type RentalRow = { token_id: string };
  for (const row of data as RentalRow[]) {
    const tokenId = BigInt(row.token_id);
    try {
      const tx = await settleRental(wallet, tokenId, matchday);
      await waitFor(tx);
      console.log(`[lifecycle] settleRental tokenId=${tokenId} matchday=${matchday} mined: ${tx}`);
    } catch (err) {
      // A rental may already be settled on-chain (idempotent failure from the contract).
      // Log and continue rather than crashing the whole batch.
      console.warn(`[lifecycle] settleRental failed tokenId=${tokenId} matchday=${matchday}:`, err);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Single-fixture lifecycle runner
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run all lifecycle transitions that are now due for a single fixture.
 * Each transition is idempotent — if the matchday is already in the expected
 * predecessor state the call is skipped with a log line.
 *
 * @param fixture  The fixture from lib/data/fixtures.ts
 * @param nowMs    Current epoch time in milliseconds (pass Date.now() or override in --now mode)
 * @param wallet   Script wallet client (PRIVATE_KEY account)
 * @param fastForward  If true, skip time-gate checks and run all remaining transitions now
 */
export async function runFixtureLifecycle(
  fixture: Fixture,
  nowMs: number,
  wallet: ReturnType<typeof getScriptWalletClient>,
  fastForward = false,
): Promise<void> {
  const { matchday, kickoff, fixtureId } = fixture;
  const kickoffSecs = Math.floor(new Date(kickoff).getTime() / 1000);
  const nowSecs = Math.floor(nowMs / 1000);

  const { status } = await readMatchdayStatus(matchday);

  console.log(`[lifecycle] fixture ${fixtureId} matchday=${matchday} status=${status} kickoff=${kickoff}`);

  // ── Step 1: configureMatchday (T−12h → Open) ─────────────────────────────
  if (status === MatchdayStatus.Uninitialised) {
    const openAt = kickoffSecs - OPEN_LEAD_SECS;
    if (fastForward || nowSecs >= openAt) {
      // Lock time = kickoff - 10 minutes (unix timestamp as uint64)
      const lockTs = BigInt(kickoffSecs - LOCK_LEAD_SECS);
      console.log(`[lifecycle] configureMatchday matchday=${matchday} lockTs=${lockTs}`);
      const tx = await configureMatchday(wallet, matchday, lockTs);
      await waitFor(tx);
      console.log(`[lifecycle] configureMatchday mined: ${tx}`);
      // Create contests immediately after opening.
      await ensureContests(matchday, wallet);
      return; // Re-evaluate status on next tick.
    } else {
      console.log(`[lifecycle] matchday=${matchday} not ready to open yet (in ${openAt - nowSecs}s)`);
      return;
    }
  }

  // ── Step 2: lockMatchday (T−10m → Locked) ────────────────────────────────
  if (status === MatchdayStatus.Open) {
    const lockAt = kickoffSecs - LOCK_LEAD_SECS;
    if (fastForward || nowSecs >= lockAt) {
      console.log(`[lifecycle] lockMatchday matchday=${matchday}`);
      const tx = await lockMatchday(wallet, matchday);
      await waitFor(tx);
      console.log(`[lifecycle] lockMatchday mined: ${tx}`);
      return; // Re-evaluate on next tick.
    } else {
      console.log(`[lifecycle] matchday=${matchday} not ready to lock yet (in ${lockAt - nowSecs}s)`);
      return;
    }
  }

  // ── Step 3+4+5: publish, settle, settle rentals (post final-whistle) ─────
  if (status === MatchdayStatus.Locked) {
    const finished = fastForward ? true : await isFixtureFinished(fixture);
    if (!finished) {
      console.log(`[lifecycle] matchday=${matchday} fixture not finished yet — waiting`);
      return;
    }

    // 3. Publish score/DNP/payout roots.
    console.log(`[lifecycle] publishMatchday matchday=${matchday}`);
    try {
      await publishMatchday(matchday);
    } catch (err) {
      console.error(`[lifecycle] publishMatchday failed for matchday=${matchday}:`, err);
      // Do NOT advance to settle if publish failed — the oracle root is not posted.
      return;
    }

    // 4. Settle the matchday on GameRegistry.
    console.log(`[lifecycle] settleMatchday matchday=${matchday}`);
    const tx = await settleMatchday(wallet, matchday);
    await waitFor(tx);
    console.log(`[lifecycle] settleMatchday mined: ${tx}`);

    // 5. Settle all active rentals for this matchday.
    await settleActiveRentals(matchday, wallet);
    return;
  }

  // Already Settled or Cancelled — nothing left to do.
  if (status === MatchdayStatus.Settled) {
    console.log(`[lifecycle] matchday=${matchday} already settled — no action needed`);
  } else if (status === MatchdayStatus.Cancelled) {
    console.log(`[lifecycle] matchday=${matchday} is cancelled — no action needed`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Scheduler loop
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run one scheduler tick: iterate every fixture and apply any due transitions.
 */
async function schedulerTick(
  wallet: ReturnType<typeof getScriptWalletClient>,
): Promise<void> {
  for (const fixture of FIXTURES) {
    try {
      await runFixtureLifecycle(fixture, Date.now(), wallet, false);
    } catch (err) {
      console.error(`[lifecycle] error processing fixture ${fixture.fixtureId}:`, err);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Fast-forward (demo mode)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fast-forward all pending transitions for a single matchday number, bypassing
 * all time gates.  Intended for the hackathon demo.
 *
 * Usage: `npx tsx services/lifecycle/cron.ts --matchday <m> --now`
 */
async function fastForwardMatchday(
  matchdayNum: number,
  wallet: ReturnType<typeof getScriptWalletClient>,
): Promise<void> {
  const fixture = FIXTURES.find((f) => f.matchday === matchdayNum);
  if (!fixture) {
    throw new Error(`No fixture found for matchday=${matchdayNum} in lib/data/fixtures.ts`);
  }

  console.log(`[lifecycle] --now fast-forward for matchday=${matchdayNum}`);

  // Run up to 5 transition steps so the entire lifecycle can be driven
  // with a single command invocation (Uninitialised → Open → Locked → Settled).
  let steps = 0;
  const MAX_STEPS = 5;
  while (steps < MAX_STEPS) {
    const { status } = await readMatchdayStatus(matchdayNum);
    if (status === MatchdayStatus.Settled || status === MatchdayStatus.Cancelled) {
      console.log(`[lifecycle] matchday=${matchdayNum} reached terminal state (${status}) after ${steps} steps`);
      break;
    }
    await runFixtureLifecycle(fixture, Date.now(), wallet, true);
    steps++;
  }

  console.log(`[lifecycle] fast-forward complete for matchday=${matchdayNum}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Main entry point
// ─────────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  // Load repo-root .env (PRIVATE_KEY, SUPABASE_*, API_FOOTBALL_KEY, etc.)
  loadEnv({ path: resolve(process.cwd(), "../.env") });

  const pk = process.env.PRIVATE_KEY as `0x${string}` | undefined;
  if (!pk) {
    console.error("[lifecycle] PRIVATE_KEY (0x-prefixed) not set in env — aborting");
    process.exit(1);
  }
  const wallet = getScriptWalletClient(pk);

  // Argv parsing
  const args = process.argv.slice(2);
  const matchdayFlagIdx = args.indexOf("--matchday");
  const nowFlag = args.includes("--now");

  if (matchdayFlagIdx !== -1 && nowFlag) {
    // Demo fast-forward mode: --matchday <m> --now
    const matchdayArg = args[matchdayFlagIdx + 1];
    const matchdayNum = matchdayArg ? parseInt(matchdayArg, 10) : NaN;
    if (isNaN(matchdayNum) || matchdayNum < 1) {
      console.error("[lifecycle] --matchday requires a positive integer argument");
      process.exit(1);
    }
    await fastForwardMatchday(matchdayNum, wallet);
    return;
  }

  // Production mode: run a persistent scheduler.
  console.log("[lifecycle] starting matchday lifecycle scheduler");
  console.log(`[lifecycle] monitoring ${FIXTURES.length} fixture(s)`);
  console.log("[lifecycle] IMPORTANT: PRIVATE_KEY must be the contract owner / oracle signer");

  // Run an immediate first tick so the process does something visible on startup.
  await schedulerTick(wallet);

  // Main lifecycle polling loop.
  setInterval(() => {
    schedulerTick(wallet).catch((err) => {
      console.error("[lifecycle] scheduler tick error:", err);
    });
  }, POLL_INTERVAL_MS);

  // Independent floor-price feeder loop.
  setInterval(() => {
    feedFloorPrices(wallet).catch((err) => {
      console.warn("[lifecycle] floor-price feeder error:", err);
    });
  }, FLOOR_PRICE_INTERVAL_MS);

  console.log(`[lifecycle] scheduler running — tick every ${POLL_INTERVAL_MS / 1000}s, floor-price feed every ${FLOOR_PRICE_INTERVAL_MS / 1000}s`);
  // Keep the process alive (Node exits when event loop is empty).
}

// Guard: only run when this file is the main script.
if (
  typeof process !== "undefined" &&
  process.argv[1] !== undefined &&
  (process.argv[1].endsWith("cron.ts") || process.argv[1].endsWith("cron.js"))
) {
  main().catch((err) => {
    console.error("[lifecycle] fatal:", err);
    process.exit(1);
  });
}
