/**
 * smoke-e2e.ts — End-to-end pipeline smoke test against X Layer testnet.
 *
 * Runs: ingestFixture(SMOKE_FIXTURE_ID, SMOKE_MATCHDAY)
 *    -> publishMatchday(SMOKE_MATCHDAY)
 *
 * Prereqs (all in repo-root .env):
 *   - API_FOOTBALL_KEY            (data feed)
 *   - SUPABASE_SERVICE_ROLE_KEY   (upsert match_events)
 *   - PRIVATE_KEY or SIGNER_KEYS  (oracle signer for root submission)
 *
 * The chosen matchday must already have at least one committed lineup in the
 * `lineups` table; otherwise publishMatchday() exits early with a warning.
 *
 * Usage:
 *   cd frontend
 *   SMOKE_FIXTURE_ID=<id> SMOKE_MATCHDAY=<n> npx tsx scripts/smoke-e2e.ts
 */

import "./_env";
import { ingestFixture } from "../services/oracle/ingest";
import { publishMatchday } from "../services/oracle/publish";

const FIXTURE_ID = Number(process.env.SMOKE_FIXTURE_ID);
const MATCHDAY = Number(process.env.SMOKE_MATCHDAY);

if (!Number.isFinite(FIXTURE_ID) || FIXTURE_ID <= 0 ||
    !Number.isFinite(MATCHDAY) || MATCHDAY <= 0) {
  console.error(
    "Usage: SMOKE_FIXTURE_ID=<n> SMOKE_MATCHDAY=<n> npx tsx scripts/smoke-e2e.ts",
  );
  console.error("  Both env vars must be positive integers.");
  process.exit(1);
}

async function main(): Promise<void> {
  console.log(`[smoke-e2e] ingesting fixture ${FIXTURE_ID} into matchday ${MATCHDAY}...`);
  await ingestFixture(FIXTURE_ID, MATCHDAY);

  console.log(`[smoke-e2e] publishing matchday ${MATCHDAY}...`);
  await publishMatchday(MATCHDAY);

  console.log("[smoke-e2e] done.");
}

main().catch((e) => {
  console.error("[smoke-e2e] fatal:", e);
  process.exit(1);
});
