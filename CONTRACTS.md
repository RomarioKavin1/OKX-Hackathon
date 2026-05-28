# ManagerCup — Smart Contract Reference

> 11 deployables (10 product contracts + `MockUSDC` testnet stand-in) on X Layer. Scoring is computed off-chain and committed on-chain only as Merkle roots. Full build plan: `docs/superpowers/plans/2026-05-28-contracts-implementation.md`.

## At a glance

| Contract | Standard | One-liner |
|---|---|---|
| `MockUSDC` | ERC-20 | 6-decimal testnet USDC with public faucet |
| `CardNFT` | ERC-721 + ERC-4907 | Player cards, supply caps, deterministic stats, rentable, transfer-locked while rented |
| `ChipNFT` | ERC-1155 | 4 chip types, one-time baseline claim, authorized burn-on-use |
| `PackSale` | — | Commit-reveal pack purchase, weighted tier pulls, mints cards |
| `Marketplace` | — | Fixed-price USDC sales, 5% royalty split |
| `RentalMarket` | — | Per-matchday ERC-4907 leases, USDC escrow, 88/10/2 split, refunds |
| `GameRegistry` | — | Matchday clock, lineup commit, stamina, chip burn, per-matchday card exclusivity |
| `ScoreOracle` | — | N-of-M signer voting, finalizes score + DNP Merkle roots |
| `ContestEscrow` | — | Contest entry escrow, rake, Merkle-proof payout claims |
| `InsurancePool` | — | DNP-insurance premium escrow, oracle-attested refunds |
| `SeasonLeaderboard` | — | Season-aggregate Merkle payout |

---

## MockUSDC.sol
Testnet stand-in for USDC (replaced by real USDC address on mainnet).

| Function | Access | What it does |
|---|---|---|
| `decimals()` | view | Returns `6` (USDC convention) |
| `faucet(uint256 amount)` | public | Mints `amount` to caller — testnet only |

---

## CardNFT.sol
ERC-721 with inlined ERC-4907 rental extension. Foundational — every other contract reads it.

**State:** `cards[id]` (playerId/tier/serial/batch), `statsOf[id]`, `originalBuyer[id]`, `tierStats[player][tier]`, `mintedCount[player][tier]`, `tierSupplyCap = [∞,1000,100,1]`, `isMinter[addr]`, `rentalMarket`.

| Function | Access | What it does |
|---|---|---|
| `setMinter(addr, bool)` | owner | Grant/revoke mint rights (PackSale, deployer airdrops) |
| `setRentalMarket(addr)` | owner | Authorize the RentalMarket to call `setRentalUser` |
| `setPlayerStats(playerId, tier, Stats)` | owner | Set deterministic stats for a (player,tier) — required before mint |
| `mint(to, playerId, tier, mintBatch)` | minter | Mint a card; enforces supply cap, copies tier stats, sets originalBuyer; returns tokenId |
| `airdropStarterSquad(to, playerIds[])` | minter | Batch-mint Common cards to a new wallet (free Starter Squad, D2) |
| `tierOf(id)` / `serialOf(id)` | view | Tier (0–3) / serial number within tier |
| `originalBuyer(id)` | view | First owner — receives royalty share on resale/rental |
| `setUser(id, user, expires)` | owner/approved | ERC-4907: grant lineup rights until `expires` |
| `setRentalUser(id, user, expires)` | rentalMarket | RentalMarket-only path to lease without per-token approval |
| `userOf(id)` | view | Current renter (address(0) if expired/none) |
| `userExpires(id)` | view | Rental expiry timestamp |
| `_update(...)` | internal | Transfer hook — reverts `TransferWhileRented` if active 4907 user (spec §3.7) |
| `supportsInterface(id)` | view | Advertises ERC-4907 + ERC-721 |

---

## ChipNFT.sol
ERC-1155 gameplay boosters. IDs: `0`=TripleCaptain, `1`=Doubler, `2`=Wildcard, `3`=FreeHit.

| Function | Access | What it does |
|---|---|---|
| `setBurner(addr, bool)` | owner | Authorize GameRegistry to burn chips on use |
| `setMinter(addr, bool)` | owner | Authorize earned-drop minters (v1.5) |
| `setMintCap(id, cap)` | owner | Per-chipId cap for earned drops (0 = unlimited) |
| `claimBaseline()` | public | One-time mint of 1× each of the 4 chips per wallet |
| `mint(to, id, amount)` | minter | Mint extra chips (v1.5 drops); enforces mintCap if set |
| `burnFrom(account, id, amount)` | burner | Burn a chip when used in a lineup |
| `balanceOf(account, id)` | view | Chip balance (ERC-1155) |

---

## PackSale.sol
Commit-reveal pack opening. Pack types: `0`=Bronze, `1`=Silver, `2`=Gold. 5 cards/pack.

**State:** `commits[id]` (buyer/targetBlock/packType/opened/pricePaid), `packPrice[type]`, `tierCum[type]` (cumulative pull thresholds /10000), `playerPool[]`, `treasury`. `DELAY = 16` blocks.

| Function | Access | What it does |
|---|---|---|
| `setPackPrice(type, price)` | owner | Set USDC price per pack type |
| `setTierCum(type, uint16[4])` | owner | Set cumulative tier pull rates (on-chain verifiable) |
| `setPlayerPool(bytes32[])` | owner | Set eligible playerIds for pulls |
| `setMintBatch(uint32)` | owner | Tag minted cards with a batch id |
| `withdraw(amount)` | owner | Move escrowed USDC to treasury |
| `buy(packType)` | public | Pay USDC, store commit at `block.number + 16` (records pricePaid); returns commitId |
| `reveal(commitId)` | public | After target block: seed from `blockhash`, pull 5 tiers+players, mint cards. If blockhash too old (>256), refunds buyer. Guards empty pool |
| `_mintWithDowngrade(...)` | internal | On supply-cap exhaustion, step tier down toward Common (always mintable) |

---

## Marketplace.sol
Fixed-price secondary sales in USDC. NFT escrowed on listing. Split: seller 95% / platform 4% / original buyer 1%.

| Function | Access | What it does |
|---|---|---|
| `setTreasury(addr)` | owner | Set platform fee recipient |
| `list(tokenId, price)` | public | Escrow NFT, create listing |
| `cancel(tokenId)` | seller | Reclaim escrowed NFT, delete listing |
| `buy(tokenId)` | public | Pay USDC, split 9500/400/100 bps, transfer NFT to buyer |

---

## RentalMarket.sol
Per-matchday card leases via ERC-4907 + USDC escrow. Pricing modes: `0`=Fixed, `1`=FloorPegged, `2`=Suggested. Split: owner 88% / platform 10% / original buyer 2%.

**State:** `listings[tokenId]`, `rentals[matchday][tokenId]`, `floorPrice[player][tier]`, `clock` (GameRegistry), `treasury`. Constants: `MATCH_WINDOW = 6h`, `CANCEL_REFUND_BPS = 9000`.

| Function | Access | What it does |
|---|---|---|
| `setTreasury(addr)` | owner | Set platform fee recipient |
| `setFloorPrice(player, tier, price)` | owner | Feed floor for FloorPegged mode (off-chain oracle) |
| `listForRent(tokenId, mode, priceValue)` | owner | List a card for rent in one of 3 modes |
| `delist(tokenId)` | owner | Deactivate a rental listing |
| `rent(tokenId, matchday)` | public | Pay USDC into escrow, set 4907 user = renter until lock+window; per-matchday exclusivity |
| `settle(tokenId, matchday)` | public | After lock: pay owner 88% / platform 10% / original buyer 2% |
| `cancel(tokenId, matchday)` | renter | Pre-lock cancel: 90% refund renter, 10% to owner, clear 4907 user |
| `refundPostponed(tokenId, matchday)` | public | If matchday cancelled: 100% refund renter, clear 4907 user |
| `_resolvePrice(...)` | internal | Compute concrete price (FloorPegged = bps of floor) |

`rent` re-verifies live ownership; `settle`/`cancel` pay the owner recorded at rent-time (not the live listing owner). `delist` only removes future availability — in-flight rentals persist until settle/refund (D3). `settle` only after lock and only if not cancelled (D4). 4907 expiry = lockTime + MATCH_WINDOW (D5).

---

## GameRegistry.sol
Matchday lifecycle clock + lineup commitment. Also implements `IMatchdayClock` for RentalMarket/InsurancePool. Chip none = `255`.

**State:** `matchdays[m]` (lock/status), `_lineups[m][wallet]`, `cardUsedInMatchday[m][tokenId]`, `staminaOf[tokenId]`, `lastUsedMatchday[tokenId]`. Status enum: `None/Open/Locked/Cancelled/Settled`. Stamina: max 100, cost 30, regen 50.

| Function | Access | What it does |
|---|---|---|
| `configureMatchday(m, lock)` | owner | Open a matchday with a lock timestamp |
| `lock(m)` / `cancel(m)` / `settle(m)` | owner | Advance matchday status |
| `lockTime(m)` | view | Lock timestamp (IMatchdayClock) |
| `isOpen(m)` / `isCancelled(m)` / `isSettled(m)` | view | Status checks (IMatchdayClock) |
| `hasLineup(m, wallet)` | view | Whether wallet committed a lineup |
| `getLineup(m, wallet)` | view | Full lineup struct |
| `commitLineup(m, tokenIds[11], formation, captainIdx, viceIdx, chipId)` | public | Validate controller per card, enforce exclusivity, apply stamina, burn chip, store lineup |
| `_applyStamina(...)` | internal | Lazy regen + 30 cost; Wildcard resets to 100 (scoped to today's 11); FreeHit skips cost |

Controller rule: a card with an active 4907 user can only be committed by that renter (owner locked out for the rental). One lineup per (matchday, wallet) applies to all contests entered for that matchday.

---

## ScoreOracle.sol
N-of-M signer voting that finalizes Merkle roots for scores, contest payouts, and the season. Single trust model for everything money depends on — read by ContestEscrow / InsurancePool / SeasonLeaderboard.

**State:** `isSigner[addr]`, `threshold`, `roots[matchday]` + `dnpRoots[matchday]` + `finalized[matchday]`, `payoutRoots[contestId]` + `payoutFinalized`, `seasonRoot` + `seasonFinalized`, vote tallies.

| Function | Access | What it does |
|---|---|---|
| `setSigner(addr, bool)` | owner | Add/remove a signer |
| `setThreshold(uint256)` | owner | Set required votes (e.g. 3-of-5) |
| `submitRoot(matchday, scoreRoot, dnpRoot)` | signer | Vote for a score+DNP root pair; finalizes when votes ≥ threshold |
| `submitPayoutRoot(contestId, root)` | signer | Vote for a contest payout root; finalizes when votes ≥ threshold |
| `submitSeasonRoot(root)` | signer | Vote for the season payout root; finalizes when votes ≥ threshold |
| `roots(m)` / `dnpRoots(m)` / `finalized(m)` | view | Finalized score root / DNP root / finalize flag |
| `payoutRoots(id)` / `payoutFinalized(id)` | view | Finalized contest payout root / flag |
| `seasonRoot()` / `seasonFinalized()` | view | Finalized season root / flag |

---

## ContestEscrow.sol
Contest entry escrow + Merkle-proof payouts. Payout root comes from the ScoreOracle multi-sig (not a single owner). Leaf = `keccak256(abi.encodePacked(account, amount))`. Free contest = `entryFee 0`.

**State:** `contests[id]` (matchday/entryFee/rakeBps/minTier/pool/rakeTaken), `entered[id][wallet]`, `claimed[id][wallet]`, `oracle`, `treasury`.

| Function | Access | What it does |
|---|---|---|
| `setTreasury(addr)` | owner | Set rake recipient |
| `createContest(matchday, entryFee, rakeBps, minTier)` | owner | Open a contest (minTier = off-chain eligibility gate); returns contestId |
| `enter(id)` | public | Pay entry fee into escrow; one entry per wallet |
| `takeRake(id)` | public | Once oracle payout root finalized, send rake to treasury (once) |
| `claim(id, amount, proof)` | public | After rake taken, verify proof against oracle payout root, pay winner once |

minTier is enforced off-chain in the payout tree (ineligible lineups score 0). Off-chain tree built on net pool (pool − rake).

---

## InsurancePool.sol
DNP (did-not-play) insurance. Premium = 20% of rental cost; payout = 100% rental + 50% premium back. Reads `ScoreOracle.dnpRoots`.

**State:** `policies[matchday][tokenId]` (renter/rentalCost/premium/resolved), `openExposure`, `reserveRatioBps`, `oracle`, `treasury`. DNP leaf = `keccak256(abi.encodePacked(tokenId))`.

| Function | Access | What it does |
|---|---|---|
| `setTreasury(addr)` | owner | Set surplus recipient |
| `setReserveRatioBps(bps)` | owner | Set extra reserve buffer above full collateral |
| `withdrawSurplus(amount)` | owner | Move surplus to treasury (only beyond open exposure + buffer) |
| `insure(matchday, tokenId, rentalCost)` | renter | Pay 20% premium; reverts if pool can't cover open exposure + this policy + buffer (solvency guard) |
| `claimDnp(matchday, tokenId, rentalCost, proof)` | renter | If DNP proven, pay rental + half premium; releases exposure |
| `releasePolicy(matchday, tokenId)` | owner | Free exposure for a resolved-no-DNP policy (premium stays as surplus) |

---

## SeasonLeaderboard.sol
End-of-Cup aggregate payout. Season root comes from the ScoreOracle multi-sig. Leaf = `keccak256(abi.encodePacked(account, amount))`.

**State:** `oracle`, `claimed[wallet]`.

| Function | Access | What it does |
|---|---|---|
| `claim(amount, proof)` | public | After oracle season root finalized, verify proof, pay season winner once |

---

## Cross-contract wiring (post-deploy)

```
CardNFT.setMinter(PackSale, true)        // packs mint cards
CardNFT.setMinter(deployer, true)        // starter-squad airdrops
CardNFT.setRentalMarket(RentalMarket)    // rentals set 4907 user
ChipNFT.setBurner(GameRegistry, true)    // lineups burn chips
RentalMarket(clock = GameRegistry)       // reads matchday lock/cancel
ContestEscrow(oracle) / InsurancePool(oracle) / SeasonLeaderboard(oracle) read ScoreOracle roots
```

## Off-chain (NOT in contracts, by design)
Scoring multipliers (§4.9), trait/formation/country synergies, position legality, live scoring, day-after analytics, wash-trade detection, geofencing, contest minTier eligibility. Live in the score engine + indexer + frontend.
