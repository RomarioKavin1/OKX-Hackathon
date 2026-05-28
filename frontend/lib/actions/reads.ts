import type { Address, Hex } from "viem";
import { publicClient } from "../clients";
import { ADDRESSES } from "../contracts/addresses";
import {
  CardNFTAbi, ChipNFTAbi, PackSaleAbi, MarketplaceAbi, RentalMarketAbi,
  GameRegistryAbi, ScoreOracleAbi, ContestEscrowAbi, MockUSDCAbi, InsurancePoolAbi,
} from "../abis";
import { Tier, ChipId, type Stats, type Lineup } from "../types";

export async function usdcBalance(account: Address): Promise<bigint> {
  return publicClient.readContract({
    address: ADDRESSES.MockUSDC, abi: MockUSDCAbi, functionName: "balanceOf", args: [account],
  });
}

export async function usdcAllowance(owner: Address, spender: Address): Promise<bigint> {
  return publicClient.readContract({
    address: ADDRESSES.MockUSDC, abi: MockUSDCAbi, functionName: "allowance", args: [owner, spender],
  });
}

export async function cardOwner(tokenId: bigint): Promise<Address> {
  return publicClient.readContract({
    address: ADDRESSES.CardNFT, abi: CardNFTAbi, functionName: "ownerOf", args: [tokenId],
  });
}

export async function cardUser(tokenId: bigint): Promise<Address> {
  return publicClient.readContract({
    address: ADDRESSES.CardNFT, abi: CardNFTAbi, functionName: "userOf", args: [tokenId],
  });
}

/** The address allowed to play a card: the active renter if set, else the owner. */
export async function cardController(tokenId: bigint): Promise<Address> {
  const user = await cardUser(tokenId);
  if (user !== "0x0000000000000000000000000000000000000000") return user;
  return cardOwner(tokenId);
}

export async function cardMeta(tokenId: bigint): Promise<{ playerId: Hex; tier: Tier; serial: number; mintBatch: number }> {
  const [playerId, tier, serial, mintBatch] = await publicClient.readContract({
    address: ADDRESSES.CardNFT, abi: CardNFTAbi, functionName: "cards", args: [tokenId],
  });
  return { playerId, tier: tier as Tier, serial: Number(serial), mintBatch: Number(mintBatch) };
}

export async function cardStats(tokenId: bigint): Promise<Stats> {
  const [pace, shooting, passing, defense, physical] = await publicClient.readContract({
    address: ADDRESSES.CardNFT, abi: CardNFTAbi, functionName: "statsOf", args: [tokenId],
  });
  return { pace, shooting, passing, defense, physical };
}

export async function chipBalance(account: Address, chipId: number): Promise<bigint> {
  return publicClient.readContract({
    address: ADDRESSES.ChipNFT, abi: ChipNFTAbi, functionName: "balanceOf", args: [account, BigInt(chipId)],
  });
}

export async function staminaOf(tokenId: bigint): Promise<number> {
  const s = await publicClient.readContract({
    address: ADDRESSES.GameRegistry, abi: GameRegistryAbi, functionName: "staminaOf", args: [tokenId],
  });
  return Number(s);
}

export async function hasLineup(matchday: number, wallet: Address): Promise<boolean> {
  return publicClient.readContract({
    address: ADDRESSES.GameRegistry, abi: GameRegistryAbi, functionName: "hasLineup",
    args: [BigInt(matchday), wallet],
  });
}

export async function matchdayIsOpen(matchday: number): Promise<boolean> {
  return publicClient.readContract({
    address: ADDRESSES.GameRegistry, abi: GameRegistryAbi, functionName: "isOpen", args: [BigInt(matchday)],
  });
}

export async function rentalListing(tokenId: bigint) {
  const [owner, mode, priceValue, active] = await publicClient.readContract({
    address: ADDRESSES.RentalMarket, abi: RentalMarketAbi, functionName: "listings", args: [tokenId],
  });
  return { owner, mode: Number(mode), priceValue, active };
}

export async function marketListing(tokenId: bigint) {
  const [seller, price] = await publicClient.readContract({
    address: ADDRESSES.Marketplace, abi: MarketplaceAbi, functionName: "listings", args: [tokenId],
  });
  return { seller, price };
}

export async function packCommit(commitId: bigint) {
  const [buyer, targetBlock, packType, opened, pricePaid] = await publicClient.readContract({
    address: ADDRESSES.PackSale, abi: PackSaleAbi, functionName: "commits", args: [commitId],
  });
  return { buyer, targetBlock, packType: Number(packType), opened, pricePaid };
}

export async function contestInfo(contestId: bigint) {
  const [matchday, entryFee, rakeBps, minTier, pool, rakeTaken] = await publicClient.readContract({
    address: ADDRESSES.ContestEscrow, abi: ContestEscrowAbi, functionName: "contests", args: [contestId],
  });
  return {
    matchday: Number(matchday), entryFee, rakeBps: Number(rakeBps),
    minTier: Number(minTier) as Tier, pool, rakeTaken,
  };
}

export async function scoreRoot(matchday: number): Promise<Hex> {
  return publicClient.readContract({
    address: ADDRESSES.ScoreOracle, abi: ScoreOracleAbi, functionName: "roots", args: [BigInt(matchday)],
  });
}

export async function payoutRootFinalized(contestId: bigint): Promise<boolean> {
  return publicClient.readContract({
    address: ADDRESSES.ScoreOracle, abi: ScoreOracleAbi, functionName: "payoutFinalized", args: [contestId],
  });
}

// ---------- Task 1.3 read wrappers ----------

/**
 * Fetch the committed lineup for (matchday, wallet) from GameRegistry.
 * Returns null when no lineup has been committed (exists === false).
 * Real ABI function: getLineup(uint256 m, address w) → Lineup tuple
 * Tuple shape: { tokenIds: uint256[], formation: uint8, captainIdx: uint8, viceIdx: uint8, chipId: uint8, exists: bool }
 */
export async function getLineup(matchday: number, wallet: Address): Promise<Lineup | null> {
  const result = await publicClient.readContract({
    address: ADDRESSES.GameRegistry, abi: GameRegistryAbi, functionName: "getLineup",
    args: [BigInt(matchday), wallet],
  });
  if (!result.exists) return null;
  return {
    matchday,
    wallet,
    tokenIds: result.tokenIds as bigint[],
    formation: Number(result.formation),
    captainIdx: Number(result.captainIdx),
    viceIdx: Number(result.viceIdx),
    chipId: Number(result.chipId) as ChipId,
  };
}

/**
 * Whether the season root has been finalized on ScoreOracle.
 * Real ABI function: seasonFinalized() → bool
 */
export async function seasonFinalized(): Promise<boolean> {
  return publicClient.readContract({
    address: ADDRESSES.ScoreOracle, abi: ScoreOracleAbi, functionName: "seasonFinalized", args: [],
  });
}

/**
 * The season Merkle root from ScoreOracle.
 * Real ABI function: seasonRoot() → bytes32
 */
export async function seasonRoot(): Promise<Hex> {
  return publicClient.readContract({
    address: ADDRESSES.ScoreOracle, abi: ScoreOracleAbi, functionName: "seasonRoot", args: [],
  });
}

/**
 * The DNP (Did Not Play) Merkle root for a matchday from ScoreOracle.
 * Real ABI function: dnpRoots(uint256) → bytes32
 * Note: plan named this `dnpRoot`; real mapping name is `dnpRoots`.
 */
export async function dnpRoot(matchday: number): Promise<Hex> {
  return publicClient.readContract({
    address: ADDRESSES.ScoreOracle, abi: ScoreOracleAbi, functionName: "dnpRoots", args: [BigInt(matchday)],
  });
}

/**
 * Whether the score root for a specific matchday has been finalized on ScoreOracle.
 * Real ABI function: finalized(uint256) → bool
 * (Bonus wrapper — not in the original plan but present in the real ABI alongside seasonFinalized.)
 */
export async function matchdayScoreFinalized(matchday: number): Promise<boolean> {
  return publicClient.readContract({
    address: ADDRESSES.ScoreOracle, abi: ScoreOracleAbi, functionName: "finalized", args: [BigInt(matchday)],
  });
}

/**
 * Fetch an insurance policy from InsurancePool.
 * Real ABI function: policies(uint256 matchday, uint256 tokenId) → (renter, rentalCost, premium, resolved)
 */
export async function insurancePolicy(matchday: number, tokenId: bigint): Promise<{
  renter: Address;
  rentalCost: bigint;
  premium: bigint;
  resolved: boolean;
}> {
  const [renter, rentalCost, premium, resolved] = await publicClient.readContract({
    address: ADDRESSES.InsurancePool, abi: InsurancePoolAbi, functionName: "policies",
    args: [BigInt(matchday), tokenId],
  });
  return { renter, rentalCost, premium, resolved };
}

/**
 * Whether a specific card was used in a specific matchday.
 * Real ABI function: cardUsedInMatchday(uint256 matchday, uint256 tokenId) → bool  (on GameRegistry)
 */
export async function cardUsedInMatchday(matchday: number, tokenId: bigint): Promise<boolean> {
  return publicClient.readContract({
    address: ADDRESSES.GameRegistry, abi: GameRegistryAbi, functionName: "cardUsedInMatchday",
    args: [BigInt(matchday), tokenId],
  });
}

/**
 * The last matchday in which a card was used.
 * Real ABI function: lastUsedMatchday(uint256 tokenId) → uint256  (on GameRegistry)
 */
export async function lastUsedMatchday(tokenId: bigint): Promise<number> {
  const v = await publicClient.readContract({
    address: ADDRESSES.GameRegistry, abi: GameRegistryAbi, functionName: "lastUsedMatchday",
    args: [tokenId],
  });
  return Number(v);
}

/**
 * The ERC-4907 userExpires timestamp for a card.
 * Real ABI function: userExpires(uint256 tokenId) → uint256  (on CardNFT)
 * Returns 0n when there is no active rental.
 */
export async function userExpires(tokenId: bigint): Promise<bigint> {
  return publicClient.readContract({
    address: ADDRESSES.CardNFT, abi: CardNFTAbi, functionName: "userExpires", args: [tokenId],
  });
}

/**
 * Whether a wallet has already claimed their payout for a specific contest.
 * Real ABI function: claimed(uint256 contestId, address wallet) → bool  (on ContestEscrow)
 */
export async function contestClaimed(contestId: bigint, wallet: Address): Promise<boolean> {
  return publicClient.readContract({
    address: ADDRESSES.ContestEscrow, abi: ContestEscrowAbi, functionName: "claimed",
    args: [contestId, wallet],
  }) as Promise<boolean>;
}
