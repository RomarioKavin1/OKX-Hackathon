/**
 * Demo lifecycle phases — each is a button on /demo. Every phase makes REAL transactions
 * on X Layer testnet through the connected Privy wallet. The connected account must own the
 * contracts (admin/minter/oracle signer) for the admin steps, and hold OKB gas.
 *
 * Shared mutable `DemoState` carries ids between phases (minted lineup, rental, contest).
 */
import { keccak256, toHex, parseEventLogs, type Address, type Hex, type WalletClient } from "viem";
import { publicClient } from "../clients";
import { ADDRESSES } from "../contracts/addresses";
import { CardNFTAbi, PackSaleAbi, ContestEscrowAbi, ScoreOracleAbi } from "../abis";
import * as W from "../actions/writes";
import * as R from "../actions/reads";
import { buildPayoutTree, dnpLeaf } from "../business/merkle";
import { toUsdc, fmtUsdc } from "../business/format";
import { ChipId } from "../types";

export interface DemoState {
  matchday: number;
  lock: bigint;
  lineup: bigint[];
  rentedId?: bigint;
  contestId?: bigint;
}
export type Push = (note: string, hash?: Hex) => void;
export interface Phase {
  id: string;
  label: string;
  run: (wallet: WalletClient, account: Address, st: DemoState, push: Push) => Promise<void>;
}

export function newState(): DemoState {
  return { matchday: Math.floor(Date.now() / 1000) % 1_000_000, lock: 0n, lineup: [] };
}

const pid = (i: number): Hex => keccak256(toHex(`DEMO-PLAYER-${i}`));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const STAT = { pace: 80, shooting: 80, passing: 80, defense: 50, physical: 70 };
const LOCK_LEAD = 120; // seconds the open window stays before lock

function sender(push: Push) {
  // 2 confirmations: X Layer RPC read-after-write lag would otherwise stale the next pre-flight
  return async (note: string, p: Promise<Hex>): Promise<Hex> => {
    const hash = await p;
    const rcpt = await publicClient.waitForTransactionReceipt({ hash, confirmations: 2 });
    if (rcpt.status !== "success") throw new Error(`"${note}" reverted (${hash})`);
    push(note, hash);
    return hash;
  };
}

async function mintAndId(wallet: WalletClient, to: Address, playerId: Hex, tier: number): Promise<bigint> {
  const hash = await W.mintCard(wallet, to, playerId, tier, 1);
  const rcpt = await publicClient.waitForTransactionReceipt({ hash, confirmations: 2 });
  return parseEventLogs({ abi: CardNFTAbi, eventName: "Transfer", logs: rcpt.logs })[0].args.tokenId;
}

export const PHASES: Phase[] = [
  {
    id: "onboard",
    label: "1 · Onboard (faucet, approvals, chips, starter squad)",
    run: async (wallet, account, _st, push) => {
      const send = sender(push);
      await send("faucet 10,000 USDC", W.usdcFaucet(wallet, toUsdc(10_000)));
      for (const [name, addr] of [
        ["RentalMarket", ADDRESSES.RentalMarket], ["ContestEscrow", ADDRESSES.ContestEscrow],
        ["InsurancePool", ADDRESSES.InsurancePool], ["PackSale", ADDRESSES.PackSale],
        ["Marketplace", ADDRESSES.Marketplace],
      ] as const) {
        await send(`approve ${name}`, W.usdcApprove(wallet, addr, toUsdc(1e9)));
      }
      try { await send("claim baseline chips", W.claimBaselineChips(wallet)); }
      catch { push("chips already claimed (skip)"); }
      const squad = [pid(100), pid(101), pid(102)];
      for (const p of squad) await send("set stats (squad)", W.setPlayerStats(wallet, p, 0, STAT));
      await send("airdrop starter squad (3 cards)", W.airdropStarterSquad(wallet, account, squad));
    },
  },
  {
    id: "packs",
    label: "2 · Packs (commit-reveal)",
    run: async (wallet, _account, _st, push) => {
      const send = sender(push);
      for (let i = 0; i < 3; i++)
        for (let t = 0; t < 4; t++) await send(`stats p${i} t${t}`, W.setPlayerStats(wallet, pid(i), t, STAT));
      await send("setPackPrice Bronze=5 USDC", W.setPackPrice(wallet, 0, toUsdc(5)));
      await send("set player pool", W.setPlayerPool(wallet, [pid(0), pid(1), pid(2)]));
      const buyHash = await W.buyPack(wallet, 0);
      const rcpt = await publicClient.waitForTransactionReceipt({ hash: buyHash, confirmations: 2 });
      push("buy Bronze pack", buyHash);
      const commitId = parseEventLogs({ abi: PackSaleAbi, eventName: "PackBought", logs: rcpt.logs })[0].args.commitId;
      push(`waiting 16 blocks for reveal…`);
      const target = await publicClient.getBlockNumber();
      while ((await publicClient.getBlockNumber()) <= target + 17n) await sleep(1500);
      await send(`reveal pack #${commitId}`, W.revealPack(wallet, commitId));
    },
  },
  {
    id: "market",
    label: "3 · Marketplace (list + buy, royalty split)",
    run: async (wallet, account, _st, push) => {
      const send = sender(push);
      await send("stats p0 t1 (Rare)", W.setPlayerStats(wallet, pid(0), 1, STAT));
      const id = await mintAndId(wallet, account, pid(0), 1);
      push(`minted Rare card #${id}`);
      await send("approve Marketplace for card", W.approveCard(wallet, ADDRESSES.Marketplace, id));
      await send("list @100 USDC", W.listForSale(wallet, id, toUsdc(100)));
      await send("buy listed card", W.buyListing(wallet, id));
    },
  },
  {
    id: "cards",
    label: "4 · Mint 11 lineup cards",
    run: async (wallet, account, st, push) => {
      const send = sender(push);
      st.lineup = [];
      for (let i = 0; i < 11; i++) {
        await send(`stats p${i} t0`, W.setPlayerStats(wallet, pid(i), 0, STAT));
        st.lineup.push(await mintAndId(wallet, account, pid(i), 0));
      }
      push(`lineup: ${st.lineup.map(String).join(",")}`);
    },
  },
  {
    id: "rental",
    label: "5 · Matchday + rent + insure",
    run: async (wallet, account, st, push) => {
      const send = sender(push);
      st.lock = BigInt(Math.floor(Date.now() / 1000) + LOCK_LEAD);
      await send(`configureMatchday ${st.matchday} (locks in ${LOCK_LEAD}s)`, W.configureMatchday(wallet, st.matchday, st.lock));
      await send("stats p12 t0", W.setPlayerStats(wallet, pid(12), 0, STAT));
      st.rentedId = await mintAndId(wallet, account, pid(12), 0);
      await send("list card for rent @1 USDC", W.listForRent(wallet, st.rentedId, 0, toUsdc(1)));
      await send("rent card for matchday", W.rentCard(wallet, st.rentedId, st.matchday));
      await send("seed insurance pool 100 USDC", W.usdcTransfer(wallet, ADDRESSES.InsurancePool, toUsdc(100)));
      await send("insure the rental (DNP)", W.insureRental(wallet, st.matchday, st.rentedId, toUsdc(1)));
    },
  },
  {
    id: "lineup",
    label: "6 · Commit lineup (Free Hit chip)",
    run: async (wallet, account, st, push) => {
      const send = sender(push);
      if (st.lineup.length !== 11) throw new Error("run phase 4 (mint lineup) first");
      await send("commitLineup", W.commitLineup(wallet, st.matchday, st.lineup, 0, 0, 1, ChipId.FreeHit));
      push(`hasLineup=${await R.hasLineup(st.matchday, account)}`);
    },
  },
  {
    id: "contest",
    label: "7 · Create + enter contest ($10, 8% rake)",
    run: async (wallet, _account, st, push) => {
      const send = sender(push);
      const hash = await W.createContest(wallet, st.matchday, toUsdc(10), 800, 0);
      const rcpt = await publicClient.waitForTransactionReceipt({ hash, confirmations: 2 });
      push("create contest", hash);
      st.contestId = parseEventLogs({ abi: ContestEscrowAbi, eventName: "ContestCreated", logs: rcpt.logs })[0].args.id;
      await send(`enter contest #${st.contestId}`, W.enterContest(wallet, st.contestId));
    },
  },
  {
    id: "settle",
    label: "8 · Oracle root + rake + payout + settle (waits for lock)",
    run: async (wallet, account, st, push) => {
      const send = sender(push);
      if (st.contestId == null || st.rentedId == null) throw new Error("run phases 5 & 7 first");
      push("waiting for matchday lock…");
      for (;;) {
        const blk = await publicClient.getBlock();
        if (blk.timestamp >= st.lock) break;
        await sleep(3000);
      }
      await send("submit score+DNP roots", W.submitScoreRoot(wallet, st.matchday, keccak256(toHex(`s-${st.matchday}`)), dnpLeaf(st.rentedId)));
      const net = toUsdc(10) - (toUsdc(10) * 800n) / 10000n;
      const payout = buildPayoutTree([{ account, amount: net }]);
      await send("submit payout root", W.submitPayoutRoot(wallet, st.contestId, payout.root));
      await send("take rake", W.takeRake(wallet, st.contestId));
      const before = await R.usdcBalance(account);
      await send("claim contest payout", W.claimContest(wallet, st.contestId, net, payout.claims[0].proof));
      push(`payout received: ${fmtUsdc((await R.usdcBalance(account)) - before)} USDC`);
      await send("settle rental", W.settleRental(wallet, st.rentedId, st.matchday));
    },
  },
  {
    id: "insure",
    label: "9 · Claim DNP insurance",
    run: async (wallet, account, st, push) => {
      const send = sender(push);
      if (st.rentedId == null) throw new Error("run phase 5 first");
      const before = await R.usdcBalance(account);
      await send("claim DNP", W.claimDnp(wallet, st.matchday, st.rentedId, toUsdc(1), []));
      push(`DNP payout: ${fmtUsdc((await R.usdcBalance(account)) - before)} USDC`);
    },
  },
  {
    id: "season",
    label: "10 · Season payout",
    run: async (wallet, account, _st, push) => {
      const send = sender(push);
      const done = await publicClient.readContract({
        address: ADDRESSES.ScoreOracle, abi: ScoreOracleAbi, functionName: "seasonFinalized",
      });
      if (done) { push("season root already finalized on this deployment (skip)"); return; }
      await send("fund season pool 500 USDC", W.usdcTransfer(wallet, ADDRESSES.SeasonLeaderboard, toUsdc(500)));
      const tree = buildPayoutTree([{ account, amount: toUsdc(500) }]);
      await send("submit season root", W.submitSeasonRoot(wallet, tree.root));
      const before = await R.usdcBalance(account);
      await send("claim season payout", W.claimSeason(wallet, toUsdc(500), tree.claims[0].proof));
      push(`season payout: ${fmtUsdc((await R.usdcBalance(account)) - before)} USDC`);
    },
  },
];
