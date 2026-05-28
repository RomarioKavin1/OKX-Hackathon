# ManagerCup — End-to-End Lifecycle & Flow

How a user moves through ManagerCup, which contract function each step calls, and what
the contracts do in response. Backed by an executable Foundry test that walks the whole
journey in one flow.

- **Lifecycle test:** [`contracts/test/E2ELifecycle.t.sol`](../contracts/test/E2ELifecycle.t.sol) — `test_fullLifecycle` (12 phases, every external function).
- **Per-contract unit tests:** one suite per contract under `contracts/test/`.
- **Live testnet script:** [`frontend/scripts/demo-flow.ts`](../frontend/scripts/demo-flow.ts) — same flow against X Layer testnet via the TypeScript SDK.

**Result:** `forge test` → **50 passed / 0 failed** across 13 suites (49 unit/integration + 1 full lifecycle).

```
forge test                                   # everything
forge test --match-contract E2ELifecycleTest -vv   # the lifecycle, with phase logs
```

---

## Actors

| Actor | Role |
|---|---|
| **admin** | contract owner: minter, oracle signer (1-of-1 on testnet), matchday operator |
| **collector** | owns cards, buys packs, lists for sale/rent, earns rental income |
| **manager** | rents cards, builds lineups, enters contests, claims prizes, insures |
| **buyer** | buys a card on the marketplace |
| **friend** | receives a direct ERC-4907 delegation |
| **treasury** | platform fee / rake recipient |

---

## The flow, step by step

### 1. Onboarding — free to start
A new user lands and gets a free squad and chips.

| Step | Actor | Call | Effect |
|---|---|---|---|
| Claim chips | manager | `ChipNFT.claimBaseline()` | 1× each of Triple Captain, Doubler, Wildcard, Free Hit |
| Free squad | admin (minter) | `CardNFT.airdropStarterSquad(to, playerIds[])` | batch-mints 5 Common cards to the new wallet |

> Onboarding requires no spend — the user can field a lineup with these + cheap rentals.

### 2. Card supply — packs (commit-reveal)
Collectors buy packs; tier is rolled fairly via 16-block commit-reveal.

| Step | Actor | Call | Effect |
|---|---|---|---|
| Configure | admin | `PackSale.setPackPrice / setTierCum / setMintBatch / setPlayerPool` | price, pull-rate table, eligible players |
| Buy | collector | `PackSale.buy(packType)` | escrows USDC, stores commit at `block.number + 16` |
| Reveal | collector | `PackSale.reveal(commitId)` | seeds from `blockhash`, pulls 5 (tier, player), mints cards |
| Cash out | admin | `PackSale.withdraw(amount)` | pack revenue → treasury |

Edge cases (unit-tested): empty pool reverts (retryable), blockhash older than 256 blocks refunds the buyer, supply-cap exhaustion downgrades the tier toward Common.

### 3. Secondary market — fixed-price sale
| Step | Actor | Call | Effect |
|---|---|---|---|
| Approve | collector | `CardNFT.approve(marketplace, tokenId)` | allow escrow |
| List | collector | `Marketplace.list(tokenId, price)` | NFT escrowed in the marketplace |
| Buy | buyer | `Marketplace.buy(tokenId)` | split **95% seller / 4% platform / 1% original buyer**, NFT to buyer |
| Cancel | collector | `Marketplace.cancel(tokenId)` | reclaim an unsold listing |

### 4. Direct delegation (ERC-4907) + transfer guard
| Step | Actor | Call | Effect |
|---|---|---|---|
| Delegate | collector | `CardNFT.setUser(tokenId, friend, expires)` | `userOf == friend` until expiry |
| Guard | collector | `CardNFT.transferFrom(...)` | **reverts `TransferWhileRented`** while a delegation is active |

### 5. Rental market — the core primitive
A manager rents the 11 cards they need for one matchday.

| Step | Actor | Call | Effect |
|---|---|---|---|
| List | collector | `RentalMarket.listForRent(tokenId, mode, priceValue)` | Fixed / FloorPegged / Suggested |
| Floor feed | admin | `RentalMarket.setFloorPrice(player, tier, price)` | basis for FloorPegged pricing |
| Rent | manager | `RentalMarket.rent(tokenId, matchday)` | pays USDC into escrow, sets 4907 `user = manager`, one rental per card per matchday |
| Insure | manager | `InsurancePool.insure(matchday, tokenId, rentalCost)` | pays 20% premium; pool refuses risk it can't cover (`openExposure` guard) |

While rented, the owner cannot transfer the card (guard re-checked here).

### 6. Gameplay — commit a lineup
| Step | Actor | Call | Effect |
|---|---|---|---|
| Commit | manager | `GameRegistry.commitLineup(matchday, tokenIds[11], formation, captainIdx, viceIdx, chipId)` | validates controller per card (renter or owner), enforces one-card-one-lineup, applies stamina, burns the chip |
| Free Hit | — | chip `3` | skips the 30 stamina cost (cards stay at 100) |
| Exclusivity | manager | second `commitLineup` | **reverts `AlreadyExists`** (one lineup per wallet per matchday, across all contests) |

### 7. Contests
| Step | Actor | Call | Effect |
|---|---|---|---|
| Create | admin | `ContestEscrow.createContest(matchday, entryFee, rakeBps, minTier)` | `minTier` gates eligibility (enforced off-chain in the payout tree) |
| Enter | manager | `ContestEscrow.enter(contestId)` | escrows the entry fee; one entry per wallet |

### 8. Settlement — oracle, rake, payout
After kickoff lock, the multi-sig oracle posts roots and money flows.

| Step | Actor | Call | Effect |
|---|---|---|---|
| Score + DNP roots | oracle signers | `ScoreOracle.submitRoot(matchday, scoreRoot, dnpRoot)` | finalizes at threshold |
| Payout root | oracle signers | `ScoreOracle.submitPayoutRoot(contestId, root)` | payout cannot diverge from agreed scores |
| Rake | anyone | `ContestEscrow.takeRake(contestId)` | rake → treasury (once root is final) |
| Claim prize | manager | `ContestEscrow.claim(contestId, amount, proof)` | Merkle-verified payout from the net pool |
| Settle rentals | anyone | `RentalMarket.settle(tokenId, matchday)` | owner **88%** / platform **10%** / original buyer **2%** |

### 9. Insurance payout (DNP)
| Step | Actor | Call | Effect |
|---|---|---|---|
| Claim DNP | manager | `InsurancePool.claimDnp(matchday, tokenId, rentalCost, proof)` | if the card's player is in the oracle DNP root: refund **rental + 50% of premium** |

### 10. Alternate matchday outcomes
| Scenario | Call | Effect |
|---|---|---|
| Postponed match | `GameRegistry.cancel(matchday)` → `RentalMarket.refundPostponed(tokenId, matchday)` | renter gets **100%** back, owner nothing |
| Renter cancels pre-lock | `RentalMarket.cancel(tokenId, matchday)` | renter **90%** back, owner keeps **10%** |
| Stop renting | `RentalMarket.delist(tokenId)` | removes future availability (existing rentals persist until settle/refund) |

### 11. Season-long prize
| Step | Actor | Call | Effect |
|---|---|---|---|
| Season root | oracle signers | `ScoreOracle.submitSeasonRoot(root)` | finalizes the aggregate ranking |
| Claim | manager | `SeasonLeaderboard.claim(amount, proof)` | Merkle-verified end-of-Cup payout |

### 12. Admin / v1.5 surface
| Step | Call | Effect |
|---|---|---|
| Earned chip drops | `ChipNFT.setMinter`, `setMintCap(id, cap)`, `mint(to, id, amount)` | capped performance drops (cap enforced) |
| Insurance ops | `InsurancePool.setReserveRatioBps`, `withdrawSurplus` | tune reserve buffer; sweep surplus (only above open exposure) |
| Matchday status | `GameRegistry.lock / settle` (+ `isOpen/isCancelled/isSettled`) | lifecycle state machine |
| Fee recipients | `*.setTreasury` | rotate the treasury address |

---

## Function coverage matrix

✅ = exercised by the lifecycle test; ▫ = covered by a per-contract unit test.

| Contract | Functions |
|---|---|
| **MockUSDC** | ✅ `faucet` `approve` `transfer` `balanceOf` `allowance` · ▫ `decimals` |
| **CardNFT** | ✅ `setMinter` `setRentalMarket` `setPlayerStats` `mint` `airdropStarterSquad` `setUser` `userOf` `userExpires` `ownerOf` `approve` `transferFrom`(guard) `originalBuyer` · `setRentalUser` (via `rent`) · ▫ `tierOf` `serialOf` `cards` `statsOf` `supportsInterface` |
| **ChipNFT** | ✅ `setBurner` `setMinter` `setMintCap` `claimBaseline` `mint` `balanceOf` · `burnFrom` (via `commitLineup`) |
| **PackSale** | ✅ `setPackPrice` `setTierCum` `setMintBatch` `setPlayerPool` `buy` `reveal` `withdraw` · ▫ `setTreasury` `commits` (empty-pool / stale-hash / downgrade branches) |
| **Marketplace** | ✅ `list` `buy` `cancel` `setTreasury` |
| **RentalMarket** | ✅ `setTreasury` `setFloorPrice` `listForRent`(Fixed+FloorPegged) `rent` `settle` `cancel` `refundPostponed` `delist` `listings` · ▫ `rentals` |
| **GameRegistry** | ✅ `configureMatchday` `lock` `cancel` `settle` `commitLineup` `hasLineup` `staminaOf` `cardUsedInMatchday` `isOpen` `isCancelled` `isSettled` `lockTime` · ▫ `getLineup` |
| **ScoreOracle** | ✅ `submitRoot` `submitPayoutRoot` `submitSeasonRoot` `setSigner` `setThreshold` `finalized` `payoutFinalized` `seasonFinalized` `roots`/`dnpRoots` |
| **ContestEscrow** | ✅ `createContest` `enter` `takeRake` `claim` `setTreasury` `contests` |
| **InsurancePool** | ✅ `insure` `claimDnp` `setReserveRatioBps` `withdrawSurplus` `setTreasury` `openExposure` · ▫ `releasePolicy` (no-DNP cleanup) |
| **SeasonLeaderboard** | ✅ `claim` |

---

## Off-chain pieces validated alongside

- **Merkle proofs** — payout, DNP, and season claims verify against roots built by
  `frontend/lib/business/merkle.ts` (OpenZeppelin-compatible, sorted-pair hashing). The
  lifecycle uses single-leaf trees (root = leaf, empty proof); `demo-flow.ts` builds the
  same tree off-chain and claims on testnet, proving the encoding matches the contracts.
- **Scoring** — `frontend/lib/business/scoring.ts` implements the spec §4.9 multiplier stack;
  the chain only stores the lineup commitment and settles the resulting Merkle root.
- **Fee math** — `frontend/lib/business/fees.ts` mirrors the on-chain splits (88/10/2 rental,
  95/4/1 marketplace, 20%/50% insurance, configurable rake).

## Money-flow invariants asserted

- Marketplace sale of 100 USDC → treasury +4, original buyer +1, seller +95.
- Rental of 1 USDC settled → owner +0.90 (0.88 + 0.02 original-buyer, same wallet here), treasury +0.10.
- Contest pool 10 USDC, 8% rake → treasury +0.8, winner claims 9.2 (net).
- DNP insurance on a 1 USDC rental → payout 1.1 (rental + half of the 0.2 premium).
- Pre-lock cancel of a 10 USDC rental → renter +9.0, owner +1.0. Postponement → renter +full.

## Known hardening TODOs (pre-mainnet, not lifecycle blockers)
ReentrancyGuard on escrow/payout paths; SafeERC20 instead of bool-checked transfers; rotate
the testnet 1-of-1 oracle to 3-of-5; pause switches. The commit-reveal blockhash is weakly
manipulable even at 16 blocks — VRF is the v1.5 upgrade.
