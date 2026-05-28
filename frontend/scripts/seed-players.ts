/**
 * seed-players.ts — On-chain player-stats seed script (Task 2.5).
 *
 * DEFAULT: dry-run (no transactions). Set DRY=0 to send real txs.
 *
 *   npm run seed:dry    →  DRY=1  (safe, read-only report)
 *   npm run seed        →  DRY=0  (REAL txs — costs OKB gas; confirm first)
 *
 * What it seeds:
 *   • CardNFT.setPlayerStats  for every PlayerDef × 4 tiers  (idempotent via statsSet())
 *   • PackSale.setPlayerPool  (idempotent: read playerPool[0] to detect existing pool)
 *   • PackSale.setPackPrice   for Bronze/Silver/Gold  (idempotent: skip if price matches)
 *   • PackSale.setTierCum     for Bronze/Silver/Gold  (idempotent: skip if cum matches)
 */

// Bootstrap env FIRST — dotenv must run before anything imports lib/clients.
import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(process.cwd(), "../.env") });

import { wallet, account, publicClient } from "./_env";
import { PLAYERS, tierStats as computeTierStats } from "../lib/data/players";
import { Tier, TIER_NAME } from "../lib/types";
import { PACK_TIER_CUM, PACK_NAME, USDC_DECIMALS } from "../lib/constants";
import {
  setPlayerStats,
  setPackPrice,
  setPlayerPool,
  waitFor,
} from "../lib/actions/writes";
import { ADDRESSES } from "../lib/contracts/addresses";
import { CardNFTAbi, PackSaleAbi } from "../lib/abis";
import { formatEther } from "viem";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const DRY = process.env.DRY !== "0"; // default dry; real run requires DRY=0

/** Pack prices in USDC (6-decimal). Bronze=5, Silver=15, Gold=40 */
function toUsdc(units: number): bigint {
  return BigInt(units) * BigInt(10 ** USDC_DECIMALS);
}
const PACK_PRICES: Record<number, bigint> = {
  0: toUsdc(5),   // Bronze
  1: toUsdc(15),  // Silver
  2: toUsdc(40),  // Gold
};

const TIERS = [Tier.Common, Tier.Rare, Tier.SuperRare, Tier.Unique] as const;
const PACK_TYPES = [0, 1, 2] as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Read whether stats are already set for (playerId, tier) via CardNFT.statsSet mapping. */
async function isStatsSet(pid: `0x${string}`, tier: Tier): Promise<boolean> {
  return publicClient.readContract({
    address: ADDRESSES.CardNFT,
    abi: CardNFTAbi,
    functionName: "statsSet",
    args: [pid, tier],
  });
}

/** Read on-chain pack price for a pack type. */
async function onchainPackPrice(packType: number): Promise<bigint> {
  return publicClient.readContract({
    address: ADDRESSES.PackSale,
    abi: PackSaleAbi,
    functionName: "packPrice",
    args: [packType],
  });
}

/** Read one element of tierCum[packType][index] on PackSale. */
async function onchainTierCum(packType: number, idx: number): Promise<number> {
  const v = await publicClient.readContract({
    address: ADDRESSES.PackSale,
    abi: PackSaleAbi,
    functionName: "tierCum",
    args: [packType, BigInt(idx)],
  });
  return Number(v);
}

/** Read first element of playerPool (index 0) to detect whether pool is set. */
async function poolFirstEntry(): Promise<`0x${string}` | null> {
  try {
    const v = await publicClient.readContract({
      address: ADDRESSES.PackSale,
      abi: PackSaleAbi,
      functionName: "playerPool",
      args: [0n],
    });
    return v as `0x${string}`;
  } catch {
    // Reverts when pool is empty (index out of bounds).
    return null;
  }
}

/** setTierCum wrapper (not in writes.ts — call directly). */
function setTierCum(packType: number, cum: [number, number, number, number]) {
  return wallet.writeContract({
    address: ADDRESSES.PackSale,
    abi: PackSaleAbi,
    functionName: "setTierCum",
    args: [packType, cum],
    account: wallet.account!,
    chain: wallet.chain,
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("=".repeat(60));
  if (DRY) {
    console.log("  DRY RUN — no transactions sent");
  } else {
    console.log("  REAL RUN — transactions WILL be broadcast");
  }
  console.log("=".repeat(60));

  // ── Deployer info ──────────────────────────────────────────────────────────
  const okbBalance = await publicClient.getBalance({ address: account });
  console.log(`\nDeployer : ${account}`);
  console.log(`OKB gas  : ${formatEther(okbBalance)} OKB`);

  // ── Scan setPlayerStats idempotency ───────────────────────────────────────
  console.log(`\nScanning ${PLAYERS.length} players × ${TIERS.length} tiers…`);

  type PendingStats = {
    name: string;
    pid: `0x${string}`;
    tier: Tier;
    stats: ReturnType<typeof computeTierStats>;
  };

  const pendingStats: PendingStats[] = [];
  const alreadySet: { name: string; tier: Tier }[] = [];

  for (const p of PLAYERS) {
    for (const tier of TIERS) {
      const set = await isStatsSet(p.playerId, tier);
      const stats = computeTierStats(p.base, tier);
      if (set) {
        alreadySet.push({ name: p.name, tier });
      } else {
        pendingStats.push({ name: p.name, pid: p.playerId, tier, stats });
      }
    }
  }

  console.log(`  Already set : ${alreadySet.length}`);
  console.log(`  Needs set   : ${pendingStats.length}`);

  // ── Scan setPackPrice idempotency ─────────────────────────────────────────
  const pendingPrices: number[] = [];
  for (const pt of PACK_TYPES) {
    const current = await onchainPackPrice(pt);
    const wanted = PACK_PRICES[pt];
    if (current === wanted) {
      console.log(`  Pack price ${PACK_NAME[pt]}: already set (${Number(current) / 10 ** USDC_DECIMALS} USDC)`);
    } else {
      console.log(`  Pack price ${PACK_NAME[pt]}: needs set → ${Number(wanted) / 10 ** USDC_DECIMALS} USDC (on-chain: ${Number(current) / 10 ** USDC_DECIMALS})`);
      pendingPrices.push(pt);
    }
  }

  // ── Scan setTierCum idempotency ───────────────────────────────────────────
  const pendingCum: number[] = [];
  for (const pt of PACK_TYPES) {
    const wanted = PACK_TIER_CUM[pt];
    const onchain = await Promise.all([0, 1, 2, 3].map((i) => onchainTierCum(pt, i)));
    const matches = wanted.every((v, i) => v === onchain[i]);
    if (matches) {
      console.log(`  tierCum ${PACK_NAME[pt]}: already set`);
    } else {
      console.log(`  tierCum ${PACK_NAME[pt]}: needs set → [${wanted.join(",")}] (on-chain: [${onchain.join(",")}])`);
      pendingCum.push(pt);
    }
  }

  // ── Scan playerPool idempotency ───────────────────────────────────────────
  const poolEntry = await poolFirstEntry();
  const poolSet = poolEntry !== null && poolEntry !== "0x0000000000000000000000000000000000000000000000000000000000000000";
  if (poolSet) {
    console.log(`  Player pool : already set (first entry: ${poolEntry})`);
  } else {
    console.log(`  Player pool : needs set (${PLAYERS.length} players)`);
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  const totalTx =
    pendingStats.length +
    pendingPrices.length +
    pendingCum.length +
    (poolSet ? 0 : 1);

  console.log("\n" + "-".repeat(60));
  console.log("TRANSACTION SUMMARY (real run would send):");
  console.log(`  setPlayerStats  : ${pendingStats.length} txs`);
  console.log(`  setPackPrice    : ${pendingPrices.length} txs`);
  console.log(`  setTierCum      : ${pendingCum.length} txs`);
  console.log(`  setPlayerPool   : ${poolSet ? 0 : 1} tx`);
  console.log(`  TOTAL           : ${totalTx} txs`);
  console.log("-".repeat(60));

  if (DRY) {
    console.log("\n  DRY RUN complete — zero transactions sent.\n");
    return;
  }

  // ==========================================================================
  // REAL RUN — only reached when DRY=0
  // ==========================================================================

  console.log("\nStarting real run…\n");

  // 1. setPlayerStats (idempotent: only pending)
  for (const { name, pid, tier, stats } of pendingStats) {
    process.stdout.write(`  setPlayerStats ${name} / ${TIER_NAME[tier]}… `);
    const hash = await setPlayerStats(wallet, pid, tier, stats);
    await waitFor(hash);
    console.log(`done (${hash})`);
  }

  // 2. setPackPrice (idempotent: only pending)
  for (const pt of pendingPrices) {
    process.stdout.write(`  setPackPrice ${PACK_NAME[pt]}… `);
    const hash = await setPackPrice(wallet, pt, PACK_PRICES[pt]);
    await waitFor(hash);
    console.log(`done (${hash})`);
  }

  // 3. setTierCum (idempotent: only pending)
  for (const pt of pendingCum) {
    process.stdout.write(`  setTierCum ${PACK_NAME[pt]}… `);
    const cum = PACK_TIER_CUM[pt] as [number, number, number, number];
    const hash = await setTierCum(pt, cum);
    await waitFor(hash);
    console.log(`done (${hash})`);
  }

  // 4. setPlayerPool (idempotent: skip if already set)
  if (!poolSet) {
    process.stdout.write(`  setPlayerPool (${PLAYERS.length} players)… `);
    const pool = PLAYERS.map((p) => p.playerId);
    const hash = await setPlayerPool(wallet, pool);
    await waitFor(hash);
    console.log(`done (${hash})`);
  }

  console.log("\n  Real run complete.\n");
}

main().catch((err) => {
  console.error("SEED ERROR:", err);
  process.exit(1);
});
