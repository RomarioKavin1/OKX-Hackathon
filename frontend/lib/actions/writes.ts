import type { Account, Address, Hex, WalletClient } from "viem";
import { publicClient } from "../clients";
import { ACTIVE_CHAIN } from "../contracts/chain";
import { ADDRESSES } from "../contracts/addresses";
import {
  CardNFTAbi, ChipNFTAbi, PackSaleAbi, MarketplaceAbi, RentalMarketAbi,
  GameRegistryAbi, ScoreOracleAbi, ContestEscrowAbi, InsurancePoolAbi,
  SeasonLeaderboardAbi, MockUSDCAbi,
} from "../abis";
import { ChipId } from "../types";

/**
 * Resolve the signer. A script wallet client carries a local `Account` object — return that
 * so viem signs locally. A browser wallet client has no bound account, so the caller passes
 * `from` (an Address) and viem signs via the injected provider.
 */
function sender(wallet: WalletClient, from?: Address): Account | Address {
  const a = wallet.account ?? from;
  if (!a) throw new Error("no account: pass `from` or use a wallet client with a bound account");
  return a;
}

/** Wait for a tx to be mined and return its receipt. */
export function waitFor(hash: Hex) {
  return publicClient.waitForTransactionReceipt({ hash });
}

// ---------- USDC ----------
export function usdcFaucet(wallet: WalletClient, amount: bigint, from?: Address): Promise<Hex> {
  return wallet.writeContract({
    address: ADDRESSES.MockUSDC, abi: MockUSDCAbi, functionName: "faucet",
    args: [amount], account: sender(wallet, from), chain: ACTIVE_CHAIN,
  });
}
export function usdcApprove(wallet: WalletClient, spender: Address, amount: bigint, from?: Address): Promise<Hex> {
  return wallet.writeContract({
    address: ADDRESSES.MockUSDC, abi: MockUSDCAbi, functionName: "approve",
    args: [spender, amount], account: sender(wallet, from), chain: ACTIVE_CHAIN,
  });
}
export function usdcTransfer(wallet: WalletClient, to: Address, amount: bigint, from?: Address): Promise<Hex> {
  return wallet.writeContract({
    address: ADDRESSES.MockUSDC, abi: MockUSDCAbi, functionName: "transfer",
    args: [to, amount], account: sender(wallet, from), chain: ACTIVE_CHAIN,
  });
}

// ---------- Cards (admin) ----------
export function setPlayerStats(
  wallet: WalletClient, playerId: Hex, tier: number,
  stats: { pace: number; shooting: number; passing: number; defense: number; physical: number },
  from?: Address
): Promise<Hex> {
  return wallet.writeContract({
    address: ADDRESSES.CardNFT, abi: CardNFTAbi, functionName: "setPlayerStats",
    args: [playerId, tier, stats], account: sender(wallet, from), chain: ACTIVE_CHAIN,
  });
}
export function mintCard(
  wallet: WalletClient, to: Address, playerId: Hex, tier: number, mintBatch: number, from?: Address
): Promise<Hex> {
  return wallet.writeContract({
    address: ADDRESSES.CardNFT, abi: CardNFTAbi, functionName: "mint",
    args: [to, playerId, tier, mintBatch], account: sender(wallet, from), chain: ACTIVE_CHAIN,
  });
}
export function airdropStarterSquad(wallet: WalletClient, to: Address, playerIds: Hex[], from?: Address): Promise<Hex> {
  return wallet.writeContract({
    address: ADDRESSES.CardNFT, abi: CardNFTAbi, functionName: "airdropStarterSquad",
    args: [to, playerIds], account: sender(wallet, from), chain: ACTIVE_CHAIN,
  });
}

// ---------- Chips ----------
export function claimBaselineChips(wallet: WalletClient, from?: Address): Promise<Hex> {
  return wallet.writeContract({
    address: ADDRESSES.ChipNFT, abi: ChipNFTAbi, functionName: "claimBaseline",
    args: [], account: sender(wallet, from), chain: ACTIVE_CHAIN,
  });
}

// ---------- Packs ----------
export function setPackPrice(wallet: WalletClient, packType: number, price: bigint, from?: Address): Promise<Hex> {
  return wallet.writeContract({
    address: ADDRESSES.PackSale, abi: PackSaleAbi, functionName: "setPackPrice",
    args: [packType, price], account: sender(wallet, from), chain: ACTIVE_CHAIN,
  });
}
export function setPlayerPool(wallet: WalletClient, pool: Hex[], from?: Address): Promise<Hex> {
  return wallet.writeContract({
    address: ADDRESSES.PackSale, abi: PackSaleAbi, functionName: "setPlayerPool",
    args: [pool], account: sender(wallet, from), chain: ACTIVE_CHAIN,
  });
}
export function buyPack(wallet: WalletClient, packType: number, from?: Address): Promise<Hex> {
  return wallet.writeContract({
    address: ADDRESSES.PackSale, abi: PackSaleAbi, functionName: "buy",
    args: [packType], account: sender(wallet, from), chain: ACTIVE_CHAIN,
  });
}
export function revealPack(wallet: WalletClient, commitId: bigint, from?: Address): Promise<Hex> {
  return wallet.writeContract({
    address: ADDRESSES.PackSale, abi: PackSaleAbi, functionName: "reveal",
    args: [commitId], account: sender(wallet, from), chain: ACTIVE_CHAIN,
  });
}

// ---------- Marketplace ----------
export function approveCard(wallet: WalletClient, spender: Address, tokenId: bigint, from?: Address): Promise<Hex> {
  return wallet.writeContract({
    address: ADDRESSES.CardNFT, abi: CardNFTAbi, functionName: "approve",
    args: [spender, tokenId], account: sender(wallet, from), chain: ACTIVE_CHAIN,
  });
}
export function listForSale(wallet: WalletClient, tokenId: bigint, price: bigint, from?: Address): Promise<Hex> {
  return wallet.writeContract({
    address: ADDRESSES.Marketplace, abi: MarketplaceAbi, functionName: "list",
    args: [tokenId, price], account: sender(wallet, from), chain: ACTIVE_CHAIN,
  });
}
export function buyListing(wallet: WalletClient, tokenId: bigint, from?: Address): Promise<Hex> {
  return wallet.writeContract({
    address: ADDRESSES.Marketplace, abi: MarketplaceAbi, functionName: "buy",
    args: [tokenId], account: sender(wallet, from), chain: ACTIVE_CHAIN,
  });
}
/** Cancel a standing marketplace listing. Real ABI: Marketplace.cancel(uint256 tokenId). */
export function cancelListing(wallet: WalletClient, tokenId: bigint, from?: Address): Promise<Hex> {
  return wallet.writeContract({
    address: ADDRESSES.Marketplace, abi: MarketplaceAbi, functionName: "cancel",
    args: [tokenId], account: sender(wallet, from), chain: ACTIVE_CHAIN,
  });
}

// ---------- Rentals ----------
export function listForRent(wallet: WalletClient, tokenId: bigint, mode: number, priceValue: bigint, from?: Address): Promise<Hex> {
  return wallet.writeContract({
    address: ADDRESSES.RentalMarket, abi: RentalMarketAbi, functionName: "listForRent",
    args: [tokenId, mode, priceValue], account: sender(wallet, from), chain: ACTIVE_CHAIN,
  });
}
/** Remove a standing rental listing. Real ABI: RentalMarket.delist(uint256 tokenId). */
export function delistRental(wallet: WalletClient, tokenId: bigint, from?: Address): Promise<Hex> {
  return wallet.writeContract({
    address: ADDRESSES.RentalMarket, abi: RentalMarketAbi, functionName: "delist",
    args: [tokenId], account: sender(wallet, from), chain: ACTIVE_CHAIN,
  });
}
/** Refund renter when a matchday is postponed. Real ABI: RentalMarket.refundPostponed(uint256 tokenId, uint256 matchday). */
export function refundPostponed(wallet: WalletClient, tokenId: bigint, matchday: number, from?: Address): Promise<Hex> {
  return wallet.writeContract({
    address: ADDRESSES.RentalMarket, abi: RentalMarketAbi, functionName: "refundPostponed",
    args: [tokenId, BigInt(matchday)], account: sender(wallet, from), chain: ACTIVE_CHAIN,
  });
}
/** Set the floor price for a (player, tier) pair. Real ABI: RentalMarket.setFloorPrice(bytes32 player, uint8 tier, uint256 price). */
export function setFloorPrice(wallet: WalletClient, player: Hex, tier: number, price: bigint, from?: Address): Promise<Hex> {
  return wallet.writeContract({
    address: ADDRESSES.RentalMarket, abi: RentalMarketAbi, functionName: "setFloorPrice",
    args: [player, tier, price], account: sender(wallet, from), chain: ACTIVE_CHAIN,
  });
}
export function rentCard(wallet: WalletClient, tokenId: bigint, matchday: number, from?: Address): Promise<Hex> {
  return wallet.writeContract({
    address: ADDRESSES.RentalMarket, abi: RentalMarketAbi, functionName: "rent",
    args: [tokenId, BigInt(matchday)], account: sender(wallet, from), chain: ACTIVE_CHAIN,
  });
}
export function settleRental(wallet: WalletClient, tokenId: bigint, matchday: number, from?: Address): Promise<Hex> {
  return wallet.writeContract({
    address: ADDRESSES.RentalMarket, abi: RentalMarketAbi, functionName: "settle",
    args: [tokenId, BigInt(matchday)], account: sender(wallet, from), chain: ACTIVE_CHAIN,
  });
}
export function cancelRental(wallet: WalletClient, tokenId: bigint, matchday: number, from?: Address): Promise<Hex> {
  return wallet.writeContract({
    address: ADDRESSES.RentalMarket, abi: RentalMarketAbi, functionName: "cancel",
    args: [tokenId, BigInt(matchday)], account: sender(wallet, from), chain: ACTIVE_CHAIN,
  });
}

// ---------- Gameplay ----------
export function commitLineup(
  wallet: WalletClient, matchday: number, tokenIds: bigint[],
  formation: number, captainIdx: number, viceIdx: number, chipId: ChipId = ChipId.None, from?: Address
): Promise<Hex> {
  return wallet.writeContract({
    address: ADDRESSES.GameRegistry, abi: GameRegistryAbi, functionName: "commitLineup",
    args: [BigInt(matchday), tokenIds, formation, captainIdx, viceIdx, chipId],
    account: sender(wallet, from), chain: ACTIVE_CHAIN,
  });
}
export function configureMatchday(wallet: WalletClient, matchday: number, lock: bigint, from?: Address): Promise<Hex> {
  return wallet.writeContract({
    address: ADDRESSES.GameRegistry, abi: GameRegistryAbi, functionName: "configureMatchday",
    args: [BigInt(matchday), lock], account: sender(wallet, from), chain: ACTIVE_CHAIN,
  });
}
/**
 * Lock a matchday: prevents further lineup commits.
 * Real ABI: GameRegistry.lock(uint256 m).
 * Owner/controller-key gated — only the contract owner may call this.
 */
export function lockMatchday(wallet: WalletClient, matchday: number, from?: Address): Promise<Hex> {
  return wallet.writeContract({
    address: ADDRESSES.GameRegistry, abi: GameRegistryAbi, functionName: "lock",
    args: [BigInt(matchday)], account: sender(wallet, from), chain: ACTIVE_CHAIN,
  });
}
/**
 * Cancel a matchday (e.g. fixture postponed): marks it cancelled so renters can call
 * RentalMarket.refundPostponed().
 * Real ABI: GameRegistry.cancel(uint256 m).
 * Owner/controller-key gated — only the contract owner may call this.
 */
export function cancelMatchday(wallet: WalletClient, matchday: number, from?: Address): Promise<Hex> {
  return wallet.writeContract({
    address: ADDRESSES.GameRegistry, abi: GameRegistryAbi, functionName: "cancel",
    args: [BigInt(matchday)], account: sender(wallet, from), chain: ACTIVE_CHAIN,
  });
}
/**
 * Settle a matchday on GameRegistry: transitions status to Settled after the oracle
 * has posted its score root.
 * Real ABI: GameRegistry.settle(uint256 m).
 * Owner/controller-key gated — only the contract owner may call this.
 *
 * NOTE: RentalMarket does NOT expose a matchday-level bulk settle.  Individual rentals
 * must be settled via the existing `settleRental(wallet, tokenId, matchday)` wrapper,
 * one call per (tokenId, matchday) pair.
 */
export function settleMatchday(wallet: WalletClient, matchday: number, from?: Address): Promise<Hex> {
  return wallet.writeContract({
    address: ADDRESSES.GameRegistry, abi: GameRegistryAbi, functionName: "settle",
    args: [BigInt(matchday)], account: sender(wallet, from), chain: ACTIVE_CHAIN,
  });
}

// ---------- Contests ----------
export function createContest(
  wallet: WalletClient, matchday: number, entryFee: bigint, rakeBps: number, minTier: number, from?: Address
): Promise<Hex> {
  return wallet.writeContract({
    address: ADDRESSES.ContestEscrow, abi: ContestEscrowAbi, functionName: "createContest",
    args: [BigInt(matchday), entryFee, rakeBps, minTier], account: sender(wallet, from), chain: ACTIVE_CHAIN,
  });
}
export function enterContest(wallet: WalletClient, contestId: bigint, from?: Address): Promise<Hex> {
  return wallet.writeContract({
    address: ADDRESSES.ContestEscrow, abi: ContestEscrowAbi, functionName: "enter",
    args: [contestId], account: sender(wallet, from), chain: ACTIVE_CHAIN,
  });
}
export function takeRake(wallet: WalletClient, contestId: bigint, from?: Address): Promise<Hex> {
  return wallet.writeContract({
    address: ADDRESSES.ContestEscrow, abi: ContestEscrowAbi, functionName: "takeRake",
    args: [contestId], account: sender(wallet, from), chain: ACTIVE_CHAIN,
  });
}
export function claimContest(wallet: WalletClient, contestId: bigint, amount: bigint, proof: Hex[], from?: Address): Promise<Hex> {
  return wallet.writeContract({
    address: ADDRESSES.ContestEscrow, abi: ContestEscrowAbi, functionName: "claim",
    args: [contestId, amount, proof], account: sender(wallet, from), chain: ACTIVE_CHAIN,
  });
}

// ---------- Season ----------
export function claimSeason(wallet: WalletClient, amount: bigint, proof: Hex[], from?: Address): Promise<Hex> {
  return wallet.writeContract({
    address: ADDRESSES.SeasonLeaderboard, abi: SeasonLeaderboardAbi, functionName: "claim",
    args: [amount, proof], account: sender(wallet, from), chain: ACTIVE_CHAIN,
  });
}

// ---------- Insurance ----------
export function insureRental(wallet: WalletClient, matchday: number, tokenId: bigint, rentalCost: bigint, from?: Address): Promise<Hex> {
  return wallet.writeContract({
    address: ADDRESSES.InsurancePool, abi: InsurancePoolAbi, functionName: "insure",
    args: [BigInt(matchday), tokenId, rentalCost], account: sender(wallet, from), chain: ACTIVE_CHAIN,
  });
}
export function claimDnp(wallet: WalletClient, matchday: number, tokenId: bigint, rentalCost: bigint, proof: Hex[], from?: Address): Promise<Hex> {
  return wallet.writeContract({
    address: ADDRESSES.InsurancePool, abi: InsurancePoolAbi, functionName: "claimDnp",
    args: [BigInt(matchday), tokenId, rentalCost, proof], account: sender(wallet, from), chain: ACTIVE_CHAIN,
  });
}

// ---------- Oracle (signer) ----------
export function submitScoreRoot(wallet: WalletClient, matchday: number, scoreRoot: Hex, dnpRoot: Hex, from?: Address): Promise<Hex> {
  return wallet.writeContract({
    address: ADDRESSES.ScoreOracle, abi: ScoreOracleAbi, functionName: "submitRoot",
    args: [BigInt(matchday), scoreRoot, dnpRoot], account: sender(wallet, from), chain: ACTIVE_CHAIN,
  });
}
export function submitPayoutRoot(wallet: WalletClient, contestId: bigint, root: Hex, from?: Address): Promise<Hex> {
  return wallet.writeContract({
    address: ADDRESSES.ScoreOracle, abi: ScoreOracleAbi, functionName: "submitPayoutRoot",
    args: [contestId, root], account: sender(wallet, from), chain: ACTIVE_CHAIN,
  });
}
export function submitSeasonRoot(wallet: WalletClient, root: Hex, from?: Address): Promise<Hex> {
  return wallet.writeContract({
    address: ADDRESSES.ScoreOracle, abi: ScoreOracleAbi, functionName: "submitSeasonRoot",
    args: [root], account: sender(wallet, from), chain: ACTIVE_CHAIN,
  });
}
