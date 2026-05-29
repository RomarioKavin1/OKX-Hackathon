/**
 * run.ts — Indexer runner (the piece decode.ts always needed).
 *
 * Populates the Supabase tables the UI reads from on-chain state:
 *   - cards: enumerated directly via ownerOf(1..N) + on-chain card data (fast,
 *     avoids the RPC's 100-block getLogs cap).
 *   - marketplace_listings / rental_listings / rentals / packs / contests /
 *     contest_entries: from contract events (chunked to 100 blocks/request).
 *
 * On start it backfills, then TAILS new blocks every few seconds so actions
 * taken live during a demo show up in the UI within ~5s.
 *
 * Run alongside the dev server:
 *   cd frontend && npm run indexer
 *
 * Env (frontend/.env): NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 */
import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(process.cwd(), ".env") }); // frontend/.env

import { createClient } from "@supabase/supabase-js";
import { createPublicClient, http, type Address, type Hex } from "viem";
import { xLayerTestnet } from "@/lib/contracts/chain";
import { ADDRESSES } from "@/lib/contracts/addresses";
import {
  CardNFTAbi, MarketplaceAbi, RentalMarketAbi, PackSaleAbi, ContestEscrowAbi,
} from "@/lib/abis";
import {
  mapListed, mapSold, mapCancelled,
  mapListedForRent, mapRented, mapSettled, mapRentalCancelled,
  mapPackBought, mapPackRevealed,
  mapContestCreated, mapEntered, mapRakeTaken,
  type UpsertPayload,
} from "@/services/indexer/decode";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE) {
  console.error("[indexer] Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in frontend/.env");
  process.exit(1);
}
const db = createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false } });
const pub = createPublicClient({ chain: xLayerTestnet, transport: http() });

const START_BLOCK = 31509019n;
const MAX_RANGE = 100n;        // testrpc caps eth_getLogs at 100 blocks/request
const RECENT_WINDOW = 6000n;   // how far back to scan events on startup
const POLL_MS = 5000;
const ZERO = "0x0000000000000000000000000000000000000000";

const CONTRACTS = [
  { name: "CardNFT", address: ADDRESSES.CardNFT, abi: CardNFTAbi },
  { name: "Marketplace", address: ADDRESSES.Marketplace, abi: MarketplaceAbi },
  { name: "RentalMarket", address: ADDRESSES.RentalMarket, abi: RentalMarketAbi },
  { name: "PackSale", address: ADDRESSES.PackSale, abi: PackSaleAbi },
  { name: "ContestEscrow", address: ADDRESSES.ContestEscrow, abi: ContestEscrowAbi },
] as const;

async function upsert(p: UpsertPayload) {
  const { error } = await db.from(p.table).upsert(p.row, { onConflict: p.onConflict });
  if (error) console.warn(`[indexer] upsert ${p.table} failed: ${error.message}`);
}

const cardRead = (fn: string, id: bigint) =>
  pub.readContract({ address: ADDRESSES.CardNFT, abi: CardNFTAbi, functionName: fn, args: [id] } as never);

/** Read a card's full on-chain state and upsert a complete row. */
async function enrichCard(tokenId: bigint, block: bigint) {
  try {
    const card = (await cardRead("cards", tokenId)) as readonly [Hex, number, number, number];
    const owner = (await cardRead("ownerOf", tokenId).catch(() => ZERO)) as Address;
    const ob = (await cardRead("originalBuyer", tokenId).catch(() => ZERO)) as Address;
    const user = (await cardRead("userOf", tokenId).catch(() => ZERO)) as Address;
    const expires = (await cardRead("userExpires", tokenId).catch(() => 0n)) as bigint;
    await upsert({
      table: "cards",
      onConflict: "token_id",
      row: {
        token_id: tokenId.toString(),
        player_id: (card[0] as string).toLowerCase(),
        tier: Number(card[1]),
        serial_number: Number(card[2]),
        mint_batch: Number(card[3]),
        owner: owner.toLowerCase(),
        original_buyer: ob.toLowerCase(),
        user_addr: user.toLowerCase(),
        user_expires: Number(expires),
        updated_block: Number(block),
      },
    });
  } catch (e) {
    console.warn(`[indexer] enrichCard ${tokenId} failed:`, (e as Error).message);
  }
}

async function ownerOf(tokenId: bigint): Promise<string> {
  try {
    return ((await cardRead("ownerOf", tokenId)) as Address).toLowerCase();
  } catch {
    return ZERO;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleLog(log: any) {
  const a = log.args ?? {};
  const block = log.blockNumber as bigint;
  switch (log.eventName) {
    case "Transfer":
    case "UpdateUser":
      if (a.tokenId !== undefined) await enrichCard(a.tokenId as bigint, block);
      break;
    case "Listed":
      await upsert(mapListed(a, block));
      break;
    case "Sold":
      await upsert(mapSold(a, block));
      if (a.tokenId !== undefined) await enrichCard(a.tokenId as bigint, block);
      break;
    case "ListedForRent":
      await upsert(mapListedForRent(a, await ownerOf(a.tokenId as bigint), block));
      break;
    case "Rented":
      await upsert(mapRented(a, await ownerOf(a.tokenId as bigint), block));
      break;
    case "Settled":
      await upsert(mapSettled(a, block));
      break;
    case "PackBought":
      await upsert(mapPackBought(a, block));
      break;
    case "PackRevealed":
      await upsert(mapPackRevealed(a, block));
      for (const tid of (a.tokenIds ?? []) as bigint[]) await enrichCard(tid, block);
      break;
    case "ContestCreated":
      await upsert(mapContestCreated(a, block));
      break;
    case "Entered":
      await upsert(mapEntered(a, block));
      break;
    case "RakeTaken":
      await upsert(mapRakeTaken(a, block));
      break;
    case "Cancelled":
      if (a.matchday !== undefined) await upsert(mapRentalCancelled(a, block));
      else await upsert(mapCancelled(a, block));
      break;
    default:
      break;
  }
}

/** Scan one <=100-block sub-range across all contracts, ordered by (block, logIndex). */
async function scanSub(fromBlock: bigint, toBlock: bigint): Promise<number> {
  const all: { log: unknown; key: number }[] = [];
  for (const c of CONTRACTS) {
    const logs = await pub
      .getContractEvents({ address: c.address, abi: c.abi as never, fromBlock, toBlock })
      .catch((e) => {
        console.warn(`[indexer] getLogs ${c.name}: ${(e as Error).message.split("\n")[0]}`);
        return [] as unknown[];
      });
    for (const log of logs) {
      const bn = Number((log as { blockNumber: bigint }).blockNumber);
      const li = Number((log as { logIndex: number }).logIndex ?? 0);
      all.push({ log, key: bn * 1000 + li });
    }
  }
  all.sort((x, y) => x.key - y.key);
  for (const { log } of all) await handleLog(log);
  return all.length;
}

/** Scan an arbitrary range, internally chunked to MAX_RANGE. */
async function scanRange(fromBlock: bigint, toBlock: bigint): Promise<number> {
  let total = 0;
  for (let from = fromBlock; from <= toBlock; from += MAX_RANGE) {
    const to = from + MAX_RANGE - 1n > toBlock ? toBlock : from + MAX_RANGE - 1n;
    total += await scanSub(from, to);
  }
  return total;
}

/** Enumerate cards by probing ownerOf(1..N) until enough consecutive misses. */
async function backfillCards(block: bigint) {
  let id = 1n, misses = 0, found = 0;
  while (misses < 10 && id < 100_000n) {
    const owner = await ownerOf(id);
    if (owner === ZERO) {
      misses++;
    } else {
      await enrichCard(id, block);
      found++;
      misses = 0;
    }
    id++;
  }
  console.log(`[indexer] enumerated ${found} card(s).`);
}

async function main() {
  console.log("[indexer] starting against X Layer testnet (chain 1952)");
  const latest = await pub.getBlockNumber();

  await backfillCards(latest);
  const from = latest > RECENT_WINDOW ? latest - RECENT_WINDOW : START_BLOCK;
  console.log(`[indexer] scanning recent events ${from} → ${latest} …`);
  const n = await scanRange(from, latest);
  console.log(`[indexer] initial sync done (${n} recent events). Tailing every ${POLL_MS / 1000}s …`);

  let cursor = latest;
  setInterval(async () => {
    try {
      const head = await pub.getBlockNumber();
      if (head <= cursor) return;
      const got = await scanRange(cursor + 1n, head);
      if (got > 0) console.log(`[indexer] +${got} event(s) (blocks ${cursor + 1n}–${head})`);
      cursor = head;
    } catch (e) {
      console.warn("[indexer] tail error:", (e as Error).message);
    }
  }, POLL_MS);
}

main().catch((e) => {
  console.error("[indexer] fatal:", e);
  process.exit(1);
});
