/**
 * fix-pool.ts — Force the PackSale player pool to the current frontend catalog.
 *
 * The seed's setPlayerPool is idempotent (skips if the pool is already non-empty),
 * so a stale pool from an earlier deploy never gets corrected — pack cards then
 * mint player IDs the UI can't resolve. This overrides the pool unconditionally
 * with the 52 catalog players (all of which already have stats set by the seed).
 *
 * Owner-only. Run with the deployer key:
 *   cd frontend && PRIVATE_KEY=<deployer key for 0xA3327d90> npm run fix-pool
 */
import { wallet } from "./_env";
import { PLAYERS } from "../lib/data/players";
import { setPlayerPool, waitFor } from "../lib/actions/writes";

async function main() {
  const pool = PLAYERS.map((p) => p.playerId);
  console.log(`[fix-pool] setting PackSale pool to ${pool.length} catalog players …`);
  const tx = await setPlayerPool(wallet, pool);
  console.log(`[fix-pool] tx: ${tx} — waiting for confirmation …`);
  await waitFor(tx);
  console.log("[fix-pool] ✓ pool updated. New packs now mint catalog players (resolvable in the UI).");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("[fix-pool] failed:", e instanceof Error ? e.message : e);
    process.exit(1);
  });
