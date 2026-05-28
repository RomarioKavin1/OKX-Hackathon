# ManagerCup Smart Contracts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and testnet-deploy the full 10-contract on-chain suite for ManagerCup (World Cup fantasy card game) on X Layer, using Foundry + OpenZeppelin, with commit-reveal randomness for packs.

**Architecture:** Cards are ERC-721 with an inlined ERC-4907 rental extension. Scoring is computed off-chain and committed on-chain only as Merkle roots; contracts handle ownership, packs, marketplace, rentals, lineup commitment/stamina/chips, contest escrow, insurance, and season payout. Contracts are deployed independently then wired via admin role grants and address setters. A `MockUSDC` stands in for USDC on testnet.

**Tech Stack:** Solidity ≥0.8.24, Foundry (forge/cast), OpenZeppelin Contracts, OpenZeppelin `MerkleProof`, inlined ERC-4907. Target: X Layer testnet (chain ID 1952, RPC `https://testrpc.xlayer.tech`).

---

## Architecture Overview

### Contract list (11 deployables — 10 product + 1 testnet stand-in)

| # | Contract | Responsibility |
|---|---|---|
| 0 | `MockUSDC.sol` | 6-decimal ERC-20 with public faucet mint — testnet stand-in for USDC |
| 1 | `CardNFT.sol` | ERC-721 + inlined ERC-4907, card metadata, per-(player,tier) supply caps, deterministic tier stats, transfer-blocked-while-rented, original-buyer tracking |
| 2 | `ChipNFT.sol` | ERC-1155, 4 chip types, one-time baseline claim, authorized burn-on-use |
| 3 | `PackSale.sol` | Commit-reveal pack purchase, weighted tier pulls, mints via CardNFT |
| 4 | `Marketplace.sol` | Fixed-price USDC listings, 5% royalty split (4% platform / 1% original buyer) |
| 5 | `RentalMarket.sol` | ERC-4907 per-matchday leases, USDC escrow, 88/10/2 split, cancel/postpone refunds |
| 6 | `GameRegistry.sol` | Matchday lifecycle clock, lineup commit, stamina, chip burn, per-matchday exclusivity |
| 7 | `ScoreOracle.sol` | N-of-M signer voting, per-matchday score Merkle root + DNP root |
| 8 | `ContestEscrow.sol` | Contest entry escrow, rake, Merkle-proof payout claims |
| 9 | `InsurancePool.sol` | DNP-insurance premium escrow, oracle-attested refunds |
| 10 | `SeasonLeaderboard.sol` | Season-aggregate Merkle root, end-of-Cup payout claims |

### Dependency graph (one-directional — no cycles)

```
MockUSDC ──────────────┐
                       ▼
CardNFT ──► PackSale ──► (uses USDC)
   │           
   ├──► Marketplace ──► (USDC)
   ├──► RentalMarket ──► (USDC) ──► GameRegistry (reads clock)
   └──► GameRegistry ──► ChipNFT (burns)

ScoreOracle (standalone)
   ├──► ContestEscrow ──► (USDC)
   ├──► InsurancePool ──► (USDC) + GameRegistry (clock)
   └──► SeasonLeaderboard ──► (USDC)
```

GameRegistry reads card controller via `CardNFT.userOf`/`ownerOf` only (RentalMarket writes the 4907 user). RentalMarket reads matchday lock/cancel status from GameRegistry. No contract imports a contract that imports it back; circular references are avoided by reading CardNFT (not RentalMarket) inside GameRegistry.

### Build order (critical path)

Scaffold → MockUSDC → CardNFT → ChipNFT → PackSale → Marketplace → RentalMarket → GameRegistry → ScoreOracle → ContestEscrow → InsurancePool → SeasonLeaderboard → wiring/deploy script → integration test → testnet deploy.

### Global constants (basis points, denominator 10000)

| Constant | Value | Source |
|---|---|---|
| Rental owner share | 8800 | spec §3.5 |
| Rental platform share | 1000 | spec §3.5 |
| Rental original-buyer share | 200 | spec §3.5 |
| Marketplace seller share | 9500 | spec §2.4 |
| Marketplace platform royalty | 400 | spec §2.4 |
| Marketplace original-buyer royalty | 100 | spec §2.4 |
| Rental cancel refund (renter) | 9000 | spec §3.7 |
| Rental cancel fee (owner) | 1000 | spec §3.7 |
| DNP premium | 2000 (+20%) | spec §3.6 |
| DNP premium returned on payout | 5000 (50% of premium) | spec §3.6 |
| Contest rake | 800 (8%, configurable per contest) | spec §5.2 |
| Tier supply caps [C,R,SR,U] | [type(uint32).max, 1000, 100, 1] | spec §2.2 |
| Commit-reveal block delay | 1 | this plan |
| Chip types | 0=TripleCaptain,1=Doubler,2=Wildcard,3=FreeHit | spec §4.6 |
| Stamina max / cost / regen | 100 / 30 / 50 | spec §4.7 |

> Note: all tier/trait/synergy/captain/stamina **scoring multipliers** (spec §4.9) live in the off-chain score engine, NOT in contracts. Contracts only record commitments and settle roots.

---

## File Structure

All contracts live under `packages/contracts/` (matches spec roadmap A1/A2).

```
packages/contracts/
  foundry.toml
  remappings.txt
  .env                      (gitignored — already created at repo root; see Task 0)
  src/
    interfaces/
      IERC4907.sol          # rental interface
      IMatchdayClock.sol    # lockTime/isCancelled/isSettled — implemented by GameRegistry
      ICardNFT.sol          # mint + userOf + originalBuyer + tier views used by other contracts
      IChipNFT.sol          # burnFrom used by GameRegistry
    libs/
      Errors.sol            # shared custom errors
    mocks/
      MockUSDC.sol
    CardNFT.sol
    ChipNFT.sol
    PackSale.sol
    Marketplace.sol
    RentalMarket.sol
    GameRegistry.sol
    ScoreOracle.sol
    ContestEscrow.sol
    InsurancePool.sol
    SeasonLeaderboard.sol
  test/
    MockUSDC.t.sol
    CardNFT.t.sol
    ChipNFT.t.sol
    PackSale.t.sol
    Marketplace.t.sol
    RentalMarket.t.sol
    GameRegistry.t.sol
    ScoreOracle.t.sol
    ContestEscrow.t.sol
    InsurancePool.t.sol
    SeasonLeaderboard.t.sol
    Integration.t.sol
  script/
    Deploy.s.sol
```

---

## Shared Interfaces (created in Task 1 alongside CardNFT, referenced later)

These are the cross-contract contracts of record. Every later task that references a type or method uses exactly these signatures.

```solidity
// src/interfaces/IERC4907.sol
interface IERC4907 {
    event UpdateUser(uint256 indexed tokenId, address indexed user, uint64 expires);
    function setUser(uint256 tokenId, address user, uint64 expires) external;
    function userOf(uint256 tokenId) external view returns (address);
    function userExpires(uint256 tokenId) external view returns (uint256);
}
```

```solidity
// src/interfaces/ICardNFT.sol
interface ICardNFT {
    struct Stats { uint16 pace; uint16 shooting; uint16 passing; uint16 defense; uint16 physical; }
    function mint(address to, bytes32 playerId, uint8 tier, uint32 mintBatch) external returns (uint256);
    function ownerOf(uint256 tokenId) external view returns (address);
    function userOf(uint256 tokenId) external view returns (address);
    function originalBuyer(uint256 tokenId) external view returns (address);
    function tierOf(uint256 tokenId) external view returns (uint8);
    function setRentalUser(uint256 tokenId, address user, uint64 expires) external;
}
```

```solidity
// src/interfaces/IChipNFT.sol
interface IChipNFT {
    function burnFrom(address account, uint256 chipId, uint256 amount) external;
    function balanceOf(address account, uint256 id) external view returns (uint256);
}
```

```solidity
// src/interfaces/IMatchdayClock.sol
interface IMatchdayClock {
    function lockTime(uint256 matchday) external view returns (uint64);
    function isOpen(uint256 matchday) external view returns (bool);     // now < lockTime && status==Open
    function isCancelled(uint256 matchday) external view returns (bool);
    function isSettled(uint256 matchday) external view returns (bool);
}
```

---

## Task 0: Scaffold Foundry project

**Files:**
- Create: `packages/contracts/foundry.toml`
- Create: `packages/contracts/remappings.txt`
- Create: `packages/contracts/.gitkeep` placeholders via `forge init`

- [ ] **Step 1: Install Foundry**

Run:
```bash
curl -L https://foundry.paradigm.xyz | bash && ~/.foundry/bin/foundryup
```
Expected: prints installed `forge`, `cast`, `anvil`, `chisel` versions. Ensure `~/.foundry/bin` is on PATH for the session: `export PATH="$HOME/.foundry/bin:$PATH"`.

- [ ] **Step 2: Init the contracts package**

Run:
```bash
mkdir -p packages && cd packages && forge init contracts --no-git --no-commit && cd contracts && rm -f src/Counter.sol test/Counter.t.sol script/Counter.s.sol
```
Expected: `packages/contracts/` created with `src/`, `test/`, `script/`, `lib/forge-std`.

- [ ] **Step 3: Install OpenZeppelin**

Run:
```bash
cd packages/contracts && forge install OpenZeppelin/openzeppelin-contracts --no-git --no-commit
```
Expected: `lib/openzeppelin-contracts` present.

- [ ] **Step 4: Write `foundry.toml`**

```toml
[profile.default]
src = "src"
out = "out"
libs = ["lib"]
solc = "0.8.24"
optimizer = true
optimizer_runs = 200
evm_version = "paris"
fs_permissions = [{ access = "read", path = "./"}]

[rpc_endpoints]
xlayer_testnet = "${RPC_URL}"
```

> `evm_version = "paris"` avoids PUSH0 issues on L2s that may not support Shanghai.

- [ ] **Step 5: Write `remappings.txt`**

```txt
@openzeppelin/=lib/openzeppelin-contracts/
forge-std/=lib/forge-std/src/
```

- [ ] **Step 6: Verify the toolchain compiles an empty project**

Run:
```bash
cd packages/contracts && forge build
```
Expected: `Compiling ...` then no errors (nothing to compile yet, exits 0).

- [ ] **Step 7: Commit**

```bash
git add packages/contracts/foundry.toml packages/contracts/remappings.txt packages/contracts/lib packages/contracts/.gitignore
git commit -m "chore(contracts): scaffold Foundry project with OpenZeppelin"
```

---

## Task 1: MockUSDC

**Files:**
- Create: `packages/contracts/src/mocks/MockUSDC.sol`
- Test: `packages/contracts/test/MockUSDC.t.sol`

- [ ] **Step 1: Write the failing test**

```solidity
// test/MockUSDC.t.sol
// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {MockUSDC} from "../src/mocks/MockUSDC.sol";

contract MockUSDCTest is Test {
    MockUSDC usdc;
    address alice = address(0xA11CE);

    function setUp() public { usdc = new MockUSDC(); }

    function test_decimalsIsSix() public view {
        assertEq(usdc.decimals(), 6);
    }

    function test_faucetMints() public {
        vm.prank(alice);
        usdc.faucet(1_000e6);
        assertEq(usdc.balanceOf(alice), 1_000e6);
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/contracts && forge test --match-contract MockUSDCTest`
Expected: FAIL — `MockUSDC` source not found / does not compile.

- [ ] **Step 3: Write minimal implementation**

```solidity
// src/mocks/MockUSDC.sol
// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockUSDC is ERC20 {
    constructor() ERC20("Mock USD Coin", "USDC") {}
    function decimals() public pure override returns (uint8) { return 6; }
    function faucet(uint256 amount) external { _mint(msg.sender, amount); }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `forge test --match-contract MockUSDCTest`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/contracts/src/mocks/MockUSDC.sol packages/contracts/test/MockUSDC.t.sol
git commit -m "feat(contracts): add MockUSDC testnet token"
```

---

## Task 2: CardNFT (ERC-721 + ERC-4907 + caps + stats + transfer guard)

**Files:**
- Create: `packages/contracts/src/interfaces/IERC4907.sol`
- Create: `packages/contracts/src/interfaces/ICardNFT.sol`
- Create: `packages/contracts/src/interfaces/IChipNFT.sol`
- Create: `packages/contracts/src/interfaces/IMatchdayClock.sol`
- Create: `packages/contracts/src/libs/Errors.sol`
- Create: `packages/contracts/src/CardNFT.sol`
- Test: `packages/contracts/test/CardNFT.t.sol`

- [ ] **Step 1: Write the interfaces and shared errors**

Create the four interface files exactly as defined in the "Shared Interfaces" section above. Then:

```solidity
// src/libs/Errors.sol
// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

library Errors {
    error NotAuthorized();
    error SupplyCapReached();
    error StatsNotSet();
    error TransferWhileRented();
    error AlreadyExists();
    error NotFound();
    error MatchdayNotOpen();
    error MatchdayLocked();
    error CardAlreadyUsed();
    error NotController();
    error AlreadyClaimed();
    error InvalidProof();
    error ThresholdNotMet();
    error BadInput();
}
```

- [ ] **Step 2: Write the failing test**

```solidity
// test/CardNFT.t.sol
// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {CardNFT} from "../src/CardNFT.sol";
import {ICardNFT} from "../src/interfaces/ICardNFT.sol";
import {Errors} from "../src/libs/Errors.sol";

contract CardNFTTest is Test {
    CardNFT card;
    address admin = address(this);
    address minter = address(0xM1117E);
    address alice = address(0xA11CE);
    address bob = address(0xB0B);
    bytes32 constant MBAPPE = keccak256("FRA-10-Mbappe");

    function setUp() public {
        card = new CardNFT("ManagerCup Card", "MCUP");
        card.setMinter(minter, true);
        ICardNFT.Stats memory s = ICardNFT.Stats(97,89,80,36,77);
        card.setPlayerStats(MBAPPE, 3, s);   // Unique
        card.setPlayerStats(MBAPPE, 1, s);   // Rare
    }

    function test_mintSetsMetadataAndOriginalBuyer() public {
        vm.prank(minter);
        uint256 id = card.mint(alice, MBAPPE, 3, 1);
        assertEq(card.ownerOf(id), alice);
        assertEq(card.originalBuyer(id), alice);
        assertEq(card.tierOf(id), 3);
        assertEq(card.serialOf(id), 1);
    }

    function test_uniqueSupplyCapIsOne() public {
        vm.startPrank(minter);
        card.mint(alice, MBAPPE, 3, 1);
        vm.expectRevert(Errors.SupplyCapReached.selector);
        card.mint(bob, MBAPPE, 3, 1);
        vm.stopPrank();
    }

    function test_mintRevertsIfStatsUnset() public {
        vm.prank(minter);
        vm.expectRevert(Errors.StatsNotSet.selector);
        card.mint(alice, keccak256("UNKNOWN"), 0, 1);
    }

    function test_onlyMinterCanMint() public {
        vm.prank(alice);
        vm.expectRevert(Errors.NotAuthorized.selector);
        card.mint(alice, MBAPPE, 1, 1);
    }

    function test_setUserGrantsRentalAndExpires() public {
        vm.prank(minter);
        uint256 id = card.mint(alice, MBAPPE, 1, 1);
        vm.prank(alice);
        card.setUser(id, bob, uint64(block.timestamp + 1 days));
        assertEq(card.userOf(id), bob);
        vm.warp(block.timestamp + 2 days);
        assertEq(card.userOf(id), address(0)); // expired
    }

    function test_transferBlockedWhileRented() public {
        vm.prank(minter);
        uint256 id = card.mint(alice, MBAPPE, 1, 1);
        vm.startPrank(alice);
        card.setUser(id, bob, uint64(block.timestamp + 1 days));
        vm.expectRevert(Errors.TransferWhileRented.selector);
        card.transferFrom(alice, bob, id);
        vm.stopPrank();
    }
}
```

- [ ] **Step 3: Run test to verify it fails**

Run: `forge test --match-contract CardNFTTest`
Expected: FAIL — `CardNFT` not found.

- [ ] **Step 4: Write the implementation**

```solidity
// src/CardNFT.sol
// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC4907} from "./interfaces/IERC4907.sol";
import {ICardNFT} from "./interfaces/ICardNFT.sol";
import {Errors} from "./libs/Errors.sol";

contract CardNFT is ERC721, Ownable, IERC4907 {
    struct Card {
        bytes32 playerId;
        uint8 tier;          // 0=Common,1=Rare,2=SR,3=Unique
        uint32 serialNumber;
        uint32 mintBatch;
    }
    struct UserInfo { address user; uint64 expires; }

    uint32[4] public tierSupplyCap = [type(uint32).max, 1000, 100, 1];

    uint256 private _nextId = 1;
    mapping(uint256 => Card) public cards;
    mapping(uint256 => ICardNFT.Stats) public statsOf;
    mapping(uint256 => address) public originalBuyer;
    mapping(uint256 => UserInfo) private _users;
    mapping(bytes32 => mapping(uint8 => uint32)) public mintedCount;       // player => tier => count
    mapping(bytes32 => mapping(uint8 => ICardNFT.Stats)) public tierStats; // deterministic stats
    mapping(bytes32 => mapping(uint8 => bool)) public statsSet;
    mapping(address => bool) public isMinter;
    mapping(uint256 => address) public rentalManager; // tokenId-agnostic? see below

    address public rentalMarket; // authorized to call setRentalUser

    constructor(string memory name_, string memory symbol_)
        ERC721(name_, symbol_) Ownable(msg.sender) {}

    // --- admin ---
    function setMinter(address m, bool ok) external onlyOwner { isMinter[m] = ok; }
    function setRentalMarket(address rm) external onlyOwner { rentalMarket = rm; }
    function setPlayerStats(bytes32 playerId, uint8 tier, ICardNFT.Stats calldata s) external onlyOwner {
        if (tier > 3) revert Errors.BadInput();
        tierStats[playerId][tier] = s;
        statsSet[playerId][tier] = true;
    }

    // --- mint ---
    function mint(address to, bytes32 playerId, uint8 tier, uint32 mintBatch)
        external returns (uint256 tokenId)
    {
        if (!isMinter[msg.sender]) revert Errors.NotAuthorized();
        if (tier > 3) revert Errors.BadInput();
        if (!statsSet[playerId][tier]) revert Errors.StatsNotSet();
        uint32 minted = mintedCount[playerId][tier];
        if (minted >= tierSupplyCap[tier]) revert Errors.SupplyCapReached();

        tokenId = _nextId++;
        uint32 serial = minted + 1;
        mintedCount[playerId][tier] = serial;
        cards[tokenId] = Card(playerId, tier, serial, mintBatch);
        statsOf[tokenId] = tierStats[playerId][tier];
        originalBuyer[tokenId] = to;
        _safeMint(to, tokenId);
    }

    // --- views used by other contracts ---
    function tierOf(uint256 id) external view returns (uint8) { return cards[id].tier; }
    function serialOf(uint256 id) external view returns (uint32) { return cards[id].serialNumber; }

    // --- ERC-4907 ---
    function setUser(uint256 tokenId, address user, uint64 expires) public {
        address o = ownerOf(tokenId);
        if (msg.sender != o && !isApprovedForAll(o, msg.sender) && getApproved(tokenId) != msg.sender)
            revert Errors.NotAuthorized();
        _users[tokenId] = UserInfo(user, expires);
        emit UpdateUser(tokenId, user, expires);
    }

    // RentalMarket-only path so it can lease on the owner's behalf without per-token approval.
    function setRentalUser(uint256 tokenId, address user, uint64 expires) external {
        if (msg.sender != rentalMarket) revert Errors.NotAuthorized();
        _users[tokenId] = UserInfo(user, expires);
        emit UpdateUser(tokenId, user, expires);
    }

    function userOf(uint256 tokenId) public view returns (address) {
        UserInfo memory u = _users[tokenId];
        return u.expires >= block.timestamp ? u.user : address(0);
    }
    function userExpires(uint256 tokenId) external view returns (uint256) {
        return _users[tokenId].expires;
    }

    // --- transfer guard: block while actively rented (spec §3.7) ---
    function _update(address to, uint256 tokenId, address auth)
        internal override returns (address)
    {
        address from = _ownerOf(tokenId);
        if (from != address(0)) { // not a mint
            UserInfo memory u = _users[tokenId];
            if (u.user != address(0) && u.expires >= block.timestamp)
                revert Errors.TransferWhileRented();
        }
        return super._update(to, tokenId, auth);
    }

    function supportsInterface(bytes4 id) public view override returns (bool) {
        return id == type(IERC4907).interfaceId || super.supportsInterface(id);
    }
}
```

> Remove the unused `rentalManager` mapping if the compiler warns (it is not referenced — kept out intentionally; delete the line `mapping(uint256 => address) public rentalManager;` before building).

- [ ] **Step 5: Delete the stray unused mapping line, then run tests**

Edit `src/CardNFT.sol` and delete the line `mapping(uint256 => address) public rentalManager;`.
Run: `forge test --match-contract CardNFTTest`
Expected: PASS (6 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/contracts/src/interfaces packages/contracts/src/libs packages/contracts/src/CardNFT.sol packages/contracts/test/CardNFT.t.sol
git commit -m "feat(contracts): add CardNFT with ERC-4907, supply caps, deterministic stats"
```

---

## Task 3: ChipNFT (ERC-1155, baseline claim, authorized burn)

**Files:**
- Create: `packages/contracts/src/ChipNFT.sol`
- Test: `packages/contracts/test/ChipNFT.t.sol`

- [ ] **Step 1: Write the failing test**

```solidity
// test/ChipNFT.t.sol
// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {ChipNFT} from "../src/ChipNFT.sol";
import {Errors} from "../src/libs/Errors.sol";

contract ChipNFTTest is Test {
    ChipNFT chip;
    address game = address(0x6A3E);
    address alice = address(0xA11CE);

    function setUp() public {
        chip = new ChipNFT("ipfs://chips/");
        chip.setBurner(game, true);
    }

    function test_baselineClaimGivesOneOfEach() public {
        vm.prank(alice);
        chip.claimBaseline();
        for (uint256 i = 0; i < 4; i++) assertEq(chip.balanceOf(alice, i), 1);
    }

    function test_cannotClaimTwice() public {
        vm.startPrank(alice);
        chip.claimBaseline();
        vm.expectRevert(Errors.AlreadyExists.selector);
        chip.claimBaseline();
        vm.stopPrank();
    }

    function test_authorizedBurnerCanBurn() public {
        vm.prank(alice);
        chip.claimBaseline();
        vm.prank(game);
        chip.burnFrom(alice, 0, 1);
        assertEq(chip.balanceOf(alice, 0), 0);
    }

    function test_unauthorizedBurnReverts() public {
        vm.prank(alice);
        chip.claimBaseline();
        vm.prank(alice);
        vm.expectRevert(Errors.NotAuthorized.selector);
        chip.burnFrom(alice, 0, 1);
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `forge test --match-contract ChipNFTTest`
Expected: FAIL — `ChipNFT` not found.

- [ ] **Step 3: Write the implementation**

```solidity
// src/ChipNFT.sol
// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC1155} from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Errors} from "./libs/Errors.sol";

contract ChipNFT is ERC1155, Ownable {
    uint256 public constant TRIPLE_CAPTAIN = 0;
    uint256 public constant DOUBLER = 1;
    uint256 public constant WILDCARD = 2;
    uint256 public constant FREE_HIT = 3;

    mapping(address => bool) public claimedBaseline;
    mapping(address => bool) public isBurner;   // GameRegistry
    mapping(address => bool) public isMinter;   // v1.5 earned-drop minters

    constructor(string memory uri_) ERC1155(uri_) Ownable(msg.sender) {}

    function setBurner(address b, bool ok) external onlyOwner { isBurner[b] = ok; }
    function setMinter(address m, bool ok) external onlyOwner { isMinter[m] = ok; }

    function claimBaseline() external {
        if (claimedBaseline[msg.sender]) revert Errors.AlreadyExists();
        claimedBaseline[msg.sender] = true;
        uint256[] memory ids = new uint256[](4);
        uint256[] memory amts = new uint256[](4);
        for (uint256 i = 0; i < 4; i++) { ids[i] = i; amts[i] = 1; }
        _mintBatch(msg.sender, ids, amts, "");
    }

    function mint(address to, uint256 id, uint256 amount) external {
        if (!isMinter[msg.sender]) revert Errors.NotAuthorized();
        _mint(to, id, amount, "");
    }

    function burnFrom(address account, uint256 id, uint256 amount) external {
        if (!isBurner[msg.sender]) revert Errors.NotAuthorized();
        _burn(account, id, amount);
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `forge test --match-contract ChipNFTTest`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/contracts/src/ChipNFT.sol packages/contracts/test/ChipNFT.t.sol
git commit -m "feat(contracts): add ChipNFT with baseline claim and authorized burn"
```

---

## Task 4: PackSale (commit-reveal, weighted pulls, mints CardNFT)

**Files:**
- Create: `packages/contracts/src/PackSale.sol`
- Test: `packages/contracts/test/PackSale.t.sol`

**Design notes:**
- Pack types Bronze=0, Silver=1, Gold=2. Each pack = 5 cards.
- `buy(packType)`: pulls USDC `packPrice[packType]` from buyer, stores a commit `{buyer, targetBlock = block.number + DELAY, packType, opened=false}`, returns commitId.
- `reveal(commitId)`: requires `block.number > targetBlock` and `blockhash(targetBlock) != 0`. Seed = `keccak256(blockhash(targetBlock), buyer, commitId)`. For each of 5 cards derive a tier from the cumulative weight table, derive a player index from the admin-set `playerPool`, then call `CardNFT.mint`. On supply-cap exhaustion at the chosen tier, downgrade tier toward Common (always mintable).
- Cumulative tier tables are per pack type, denominator 10000.

- [ ] **Step 1: Write the failing test**

```solidity
// test/PackSale.t.sol
// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {PackSale} from "../src/PackSale.sol";
import {CardNFT} from "../src/CardNFT.sol";
import {ICardNFT} from "../src/interfaces/ICardNFT.sol";
import {MockUSDC} from "../src/mocks/MockUSDC.sol";

contract PackSaleTest is Test {
    PackSale pack;
    CardNFT card;
    MockUSDC usdc;
    address treasury = address(0x7BEA);
    address alice = address(0xA11CE);

    function setUp() public {
        usdc = new MockUSDC();
        card = new CardNFT("ManagerCup Card", "MCUP");
        pack = new PackSale(address(card), address(usdc), treasury);
        card.setMinter(address(pack), true);

        // seed a small player pool, all tiers' stats set
        bytes32[] memory pool = new bytes32[](3);
        pool[0] = keccak256("FRA-10-Mbappe");
        pool[1] = keccak256("ARG-10-Messi");
        pool[2] = keccak256("BRA-10-Neymar");
        ICardNFT.Stats memory s = ICardNFT.Stats(90,90,90,50,80);
        for (uint256 i = 0; i < pool.length; i++)
            for (uint8 t = 0; t < 4; t++) card.setPlayerStats(pool[i], t, s);
        pack.setPlayerPool(pool);
        pack.setPackPrice(0, 5e6); // Bronze $5

        vm.prank(alice);
        usdc.faucet(100e6);
        vm.prank(alice);
        usdc.approve(address(pack), type(uint256).max);
    }

    function test_buyEscrowsUsdcAndStoresCommit() public {
        vm.prank(alice);
        uint256 commitId = pack.buy(0);
        assertEq(usdc.balanceOf(address(pack)), 5e6);
        (address buyer,, uint8 pt, bool opened) = pack.commits(commitId);
        assertEq(buyer, alice);
        assertEq(pt, 0);
        assertFalse(opened);
    }

    function test_revealMintsFiveCards() public {
        vm.prank(alice);
        uint256 commitId = pack.buy(0);
        vm.roll(block.number + 2); // pass targetBlock
        vm.prank(alice);
        pack.reveal(commitId);
        assertEq(card.balanceOf(alice), 5);
        (,,, bool opened) = pack.commits(commitId);
        assertTrue(opened);
    }

    function test_cannotRevealBeforeTargetBlock() public {
        vm.prank(alice);
        uint256 commitId = pack.buy(0);
        vm.prank(alice);
        vm.expectRevert();
        pack.reveal(commitId);
    }

    function test_cannotRevealTwice() public {
        vm.prank(alice);
        uint256 commitId = pack.buy(0);
        vm.roll(block.number + 2);
        vm.startPrank(alice);
        pack.reveal(commitId);
        vm.expectRevert();
        pack.reveal(commitId);
        vm.stopPrank();
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `forge test --match-contract PackSaleTest`
Expected: FAIL — `PackSale` not found.

- [ ] **Step 3: Write the implementation**

```solidity
// src/PackSale.sol
// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ICardNFT} from "./interfaces/ICardNFT.sol";
import {Errors} from "./libs/Errors.sol";

contract PackSale is Ownable {
    uint8 public constant DELAY = 1;
    uint8 public constant CARDS_PER_PACK = 5;

    struct Commit { address buyer; uint64 targetBlock; uint8 packType; bool opened; }

    ICardNFT public immutable card;
    IERC20 public immutable usdc;
    address public treasury;

    uint256 public nextCommitId = 1;
    mapping(uint256 => Commit) public commits;
    mapping(uint8 => uint256) public packPrice;
    // cumulative tier thresholds per pack type, denom 10000: [common, rare, sr, unique]
    mapping(uint8 => uint16[4]) public tierCum;
    bytes32[] public playerPool;
    uint32 public mintBatch = 1;

    event PackBought(uint256 indexed commitId, address indexed buyer, uint8 packType);
    event PackRevealed(uint256 indexed commitId, uint256[] tokenIds);

    constructor(address card_, address usdc_, address treasury_) Ownable(msg.sender) {
        card = ICardNFT(card_);
        usdc = IERC20(usdc_);
        treasury = treasury_;
        // sensible defaults; override via setTierCum
        tierCum[0] = [uint16(9000), 9950, 9999, 10000]; // Bronze
        tierCum[1] = [uint16(8000), 9700, 9980, 10000]; // Silver
        tierCum[2] = [uint16(6500), 9300, 9950, 10000]; // Gold
    }

    function setTreasury(address t) external onlyOwner { treasury = t; }
    function setPackPrice(uint8 packType, uint256 price) external onlyOwner { packPrice[packType] = price; }
    function setTierCum(uint8 packType, uint16[4] calldata cum) external onlyOwner { tierCum[packType] = cum; }
    function setMintBatch(uint32 b) external onlyOwner { mintBatch = b; }
    function setPlayerPool(bytes32[] calldata pool) external onlyOwner { playerPool = pool; }
    function withdraw(uint256 amount) external onlyOwner { usdc.transfer(treasury, amount); }

    function buy(uint8 packType) external returns (uint256 commitId) {
        uint256 price = packPrice[packType];
        if (price == 0) revert Errors.BadInput();
        require(usdc.transferFrom(msg.sender, address(this), price), "usdc");
        commitId = nextCommitId++;
        commits[commitId] = Commit(msg.sender, uint64(block.number + DELAY), packType, false);
        emit PackBought(commitId, msg.sender, packType);
    }

    function reveal(uint256 commitId) external {
        Commit storage c = commits[commitId];
        if (c.buyer == address(0)) revert Errors.NotFound();
        if (c.opened) revert Errors.AlreadyExists();
        if (block.number <= c.targetBlock) revert Errors.BadInput();
        bytes32 bh = blockhash(c.targetBlock);
        if (bh == bytes32(0)) revert Errors.BadInput(); // too old (>256 blocks) — re-buy
        c.opened = true;

        uint256 seed = uint256(keccak256(abi.encodePacked(bh, c.buyer, commitId)));
        uint256 poolLen = playerPool.length;
        uint16[4] memory cum = tierCum[c.packType];
        uint256[] memory ids = new uint256[](CARDS_PER_PACK);

        for (uint256 i = 0; i < CARDS_PER_PACK; i++) {
            uint256 word = uint256(keccak256(abi.encodePacked(seed, i)));
            uint16 roll = uint16(word % 10000);
            uint8 tier = 0;
            if (roll >= cum[2]) tier = 3;
            else if (roll >= cum[1]) tier = 2;
            else if (roll >= cum[0]) tier = 1;
            bytes32 playerId = playerPool[(word >> 16) % poolLen];
            ids[i] = _mintWithDowngrade(c.buyer, playerId, tier);
        }
        emit PackRevealed(commitId, ids);
    }

    // try requested tier; on cap exhaustion step down toward Common (cap == max).
    function _mintWithDowngrade(address to, bytes32 playerId, uint8 tier) internal returns (uint256) {
        while (true) {
            try card.mint(to, playerId, tier, mintBatch) returns (uint256 id) {
                return id;
            } catch {
                if (tier == 0) revert Errors.SupplyCapReached();
                tier -= 1;
            }
        }
        return 0; // unreachable
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `forge test --match-contract PackSaleTest`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/contracts/src/PackSale.sol packages/contracts/test/PackSale.t.sol
git commit -m "feat(contracts): add PackSale with commit-reveal randomness and weighted pulls"
```

---

## Task 5: Marketplace (fixed-price + royalty split)

**Files:**
- Create: `packages/contracts/src/Marketplace.sol`
- Test: `packages/contracts/test/Marketplace.t.sol`

**Design notes:**
- `list(tokenId, price)`: caller must own; contract takes the NFT into escrow (`transferFrom` to itself) so listings are honored and the transfer guard never blocks a sale of an un-rented card.
- `buy(tokenId)`: buyer pays USDC. Split: platform 400 bps → treasury, originalBuyer 100 bps → `CardNFT.originalBuyer(tokenId)`, seller 9500 bps. NFT released to buyer.
- `cancel(tokenId)`: seller reclaims NFT.

- [ ] **Step 1: Write the failing test**

```solidity
// test/Marketplace.t.sol
// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {Marketplace} from "../src/Marketplace.sol";
import {CardNFT} from "../src/CardNFT.sol";
import {ICardNFT} from "../src/interfaces/ICardNFT.sol";
import {MockUSDC} from "../src/mocks/MockUSDC.sol";

contract MarketplaceTest is Test {
    Marketplace mkt;
    CardNFT card;
    MockUSDC usdc;
    address treasury = address(0x7BEA);
    address seller = address(0x5E11E2);   // also original buyer of the minted card
    address buyer  = address(0xB0B);
    bytes32 constant MESSI = keccak256("ARG-10-Messi");
    uint256 tokenId;

    function setUp() public {
        usdc = new MockUSDC();
        card = new CardNFT("ManagerCup Card", "MCUP");
        mkt = new Marketplace(address(card), address(usdc), treasury);
        card.setMinter(address(this), true);
        card.setPlayerStats(MESSI, 1, ICardNFT.Stats(85,92,95,40,65));
        tokenId = card.mint(seller, MESSI, 1, 1); // seller is originalBuyer

        vm.prank(buyer); usdc.faucet(1_000e6);
        vm.prank(buyer); usdc.approve(address(mkt), type(uint256).max);
        vm.prank(seller); card.approve(address(mkt), tokenId);
    }

    function test_listEscrowsNft() public {
        vm.prank(seller);
        mkt.list(tokenId, 100e6);
        assertEq(card.ownerOf(tokenId), address(mkt));
    }

    function test_buySplitsRoyalty() public {
        vm.prank(seller);
        mkt.list(tokenId, 100e6);
        vm.prank(buyer);
        mkt.buy(tokenId);
        // 100 USDC: 95 seller, 4 platform, 1 originalBuyer (== seller here)
        // seller is both seller AND original buyer → 95 + 1 = 96
        assertEq(card.ownerOf(tokenId), buyer);
        assertEq(usdc.balanceOf(treasury), 4e6);
        assertEq(usdc.balanceOf(seller), 96e6);
    }

    function test_cancelReturnsNft() public {
        vm.startPrank(seller);
        mkt.list(tokenId, 100e6);
        mkt.cancel(tokenId);
        vm.stopPrank();
        assertEq(card.ownerOf(tokenId), seller);
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `forge test --match-contract MarketplaceTest`
Expected: FAIL — `Marketplace` not found.

- [ ] **Step 3: Write the implementation**

```solidity
// src/Marketplace.sol
// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {ICardNFT} from "./interfaces/ICardNFT.sol";
import {Errors} from "./libs/Errors.sol";

contract Marketplace is Ownable {
    uint16 public constant SELLER_BPS = 9500;
    uint16 public constant PLATFORM_BPS = 400;
    uint16 public constant ORIGINAL_BPS = 100;

    struct Listing { address seller; uint256 price; }

    IERC721 public immutable nft;
    ICardNFT public immutable card;
    IERC20 public immutable usdc;
    address public treasury;
    mapping(uint256 => Listing) public listings;

    event Listed(uint256 indexed tokenId, address indexed seller, uint256 price);
    event Sold(uint256 indexed tokenId, address indexed buyer, uint256 price);
    event Cancelled(uint256 indexed tokenId);

    constructor(address card_, address usdc_, address treasury_) Ownable(msg.sender) {
        nft = IERC721(card_);
        card = ICardNFT(card_);
        usdc = IERC20(usdc_);
        treasury = treasury_;
    }

    function setTreasury(address t) external onlyOwner { treasury = t; }

    function list(uint256 tokenId, uint256 price) external {
        if (price == 0) revert Errors.BadInput();
        nft.transferFrom(msg.sender, address(this), tokenId);
        listings[tokenId] = Listing(msg.sender, price);
        emit Listed(tokenId, msg.sender, price);
    }

    function cancel(uint256 tokenId) external {
        Listing memory l = listings[tokenId];
        if (l.seller != msg.sender) revert Errors.NotAuthorized();
        delete listings[tokenId];
        nft.transferFrom(address(this), msg.sender, tokenId);
        emit Cancelled(tokenId);
    }

    function buy(uint256 tokenId) external {
        Listing memory l = listings[tokenId];
        if (l.seller == address(0)) revert Errors.NotFound();
        delete listings[tokenId];

        uint256 platform = l.price * PLATFORM_BPS / 10000;
        uint256 royalty = l.price * ORIGINAL_BPS / 10000;
        uint256 toSeller = l.price - platform - royalty;
        address orig = card.originalBuyer(tokenId);

        require(usdc.transferFrom(msg.sender, treasury, platform), "u1");
        require(usdc.transferFrom(msg.sender, orig, royalty), "u2");
        require(usdc.transferFrom(msg.sender, l.seller, toSeller), "u3");

        nft.transferFrom(address(this), msg.sender, tokenId);
        emit Sold(tokenId, msg.sender, l.price);
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `forge test --match-contract MarketplaceTest`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/contracts/src/Marketplace.sol packages/contracts/test/Marketplace.t.sol
git commit -m "feat(contracts): add fixed-price Marketplace with on-chain royalty split"
```

---

## Task 6: GameRegistry (matchday clock, lineup, stamina, chip burn, exclusivity)

> Built before RentalMarket because RentalMarket reads the matchday clock from GameRegistry.

**Files:**
- Create: `packages/contracts/src/GameRegistry.sol`
- Test: `packages/contracts/test/GameRegistry.t.sol`

**Design notes:**
- Matchday status enum: `None, Open, Locked, Cancelled, Settled`. Admin/cron sets `configureMatchday(matchday, lockTime)` (status→Open), `lock`, `cancel`, `settle`.
- `commitLineup(matchday, tokenIds[11], formation, captainIdx, viceIdx, chipId)` (chipId = 255 means none):
  - require `isOpen(matchday)` and `block.timestamp < lockTime`.
  - require exactly 11 tokenIds; captainIdx/viceIdx < 11.
  - for each card: caller must be controller = `userOf != 0 ? userOf : ownerOf`.
  - exclusivity: `cardUsedInMatchday[matchday][tokenId]` must be false → set true.
  - one lineup per wallet per matchday.
  - stamina: lazy regen then cost. Wildcard resets to 100. FreeHit skips the 30 cost.
  - chip: if chipId != 255, burn via `ChipNFT.burnFrom(msg.sender, chipId, 1)`, enforce one chip per (wallet, matchday).
- Position legality, traits, synergies are NOT validated here (off-chain scoring concern).

- [ ] **Step 1: Write the failing test**

```solidity
// test/GameRegistry.t.sol
// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {GameRegistry} from "../src/GameRegistry.sol";
import {CardNFT} from "../src/CardNFT.sol";
import {ChipNFT} from "../src/ChipNFT.sol";
import {ICardNFT} from "../src/interfaces/ICardNFT.sol";
import {Errors} from "../src/libs/Errors.sol";

contract GameRegistryTest is Test {
    GameRegistry game;
    CardNFT card;
    ChipNFT chip;
    address alice = address(0xA11CE);
    bytes32 constant P = keccak256("P");

    function setUp() public {
        card = new CardNFT("C","C");
        chip = new ChipNFT("uri");
        game = new GameRegistry(address(card), address(chip));
        chip.setBurner(address(game), true);
        card.setMinter(address(this), true);
        for (uint8 t=0;t<4;t++) card.setPlayerStats(P, t, ICardNFT.Stats(1,1,1,1,1));

        game.configureMatchday(1, uint64(block.timestamp + 1 hours));
        vm.prank(alice); chip.claimBaseline();
    }

    function _mint11() internal returns (uint256[] memory ids) {
        ids = new uint256[](11);
        for (uint256 i=0;i<11;i++) ids[i] = card.mint(alice, P, 0, 1);
    }

    function test_commitLineupRecordsAndCostsStamina() public {
        uint256[] memory ids = _mint11();
        vm.prank(alice);
        game.commitLineup(1, ids, 0, 0, 1, 255);
        assertTrue(game.hasLineup(1, alice));
        assertEq(game.staminaOf(ids[0]), 70); // 100 - 30
    }

    function test_exclusivityBlocksReuseSameMatchday() public {
        uint256[] memory ids = _mint11();
        vm.startPrank(alice);
        game.commitLineup(1, ids, 0, 0, 1, 255);
        vm.expectRevert(Errors.NotController.selector); // second lineup, but also already-has-lineup guard
        game.commitLineup(1, ids, 0, 0, 1, 255);
        vm.stopPrank();
    }

    function test_nonControllerCannotUseCard() public {
        uint256[] memory ids = _mint11();
        vm.prank(address(0xBAD));
        vm.expectRevert(Errors.NotController.selector);
        game.commitLineup(1, ids, 0, 0, 1, 255);
    }

    function test_chipBurnsAndFreeHitSkipsStamina() public {
        uint256[] memory ids = _mint11();
        vm.prank(alice);
        game.commitLineup(1, ids, 0, 0, 1, chip.FREE_HIT());
        assertEq(chip.balanceOf(alice, chip.FREE_HIT()), 0);
        assertEq(game.staminaOf(ids[0]), 100); // FreeHit: no cost
    }

    function test_cannotCommitAfterLock() public {
        uint256[] memory ids = _mint11();
        vm.warp(block.timestamp + 2 hours);
        vm.prank(alice);
        vm.expectRevert(Errors.MatchdayNotOpen.selector);
        game.commitLineup(1, ids, 0, 0, 1, 255);
    }
}
```

> The `test_exclusivityBlocksReuseSameMatchday` expectation hits the "wallet already has a lineup" guard first — adjust the expected selector to `Errors.AlreadyExists` if you implement the wallet-lineup guard before the controller check (see implementation: wallet guard runs first, so use `Errors.AlreadyExists.selector`). Update the test to `vm.expectRevert(Errors.AlreadyExists.selector);`.

- [ ] **Step 2: Fix the exclusivity test selector, then run to verify it fails**

Edit `test_exclusivityBlocksReuseSameMatchday` to `vm.expectRevert(Errors.AlreadyExists.selector);`.
Run: `forge test --match-contract GameRegistryTest`
Expected: FAIL — `GameRegistry` not found.

- [ ] **Step 3: Write the implementation**

```solidity
// src/GameRegistry.sol
// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ICardNFT} from "./interfaces/ICardNFT.sol";
import {IChipNFT} from "./interfaces/IChipNFT.sol";
import {IMatchdayClock} from "./interfaces/IMatchdayClock.sol";
import {Errors} from "./libs/Errors.sol";

contract GameRegistry is Ownable, IMatchdayClock {
    enum Status { None, Open, Locked, Cancelled, Settled }
    uint8 public constant NO_CHIP = 255;
    uint8 public constant STAMINA_MAX = 100;
    uint8 public constant STAMINA_COST = 30;
    uint8 public constant STAMINA_REGEN = 50;
    uint256 public constant WILDCARD = 2;
    uint256 public constant FREE_HIT = 3;

    struct Matchday { uint64 lock; Status status; }
    struct Lineup {
        uint256[] tokenIds;
        uint8 formation;
        uint8 captainIdx;
        uint8 viceIdx;
        uint8 chipId;
        bool exists;
    }

    ICardNFT public immutable card;
    IChipNFT public immutable chip;

    mapping(uint256 => Matchday) public matchdays;
    mapping(uint256 => mapping(address => Lineup)) internal _lineups;     // matchday => wallet => lineup
    mapping(uint256 => mapping(uint256 => bool)) public cardUsedInMatchday;
    mapping(uint256 => uint8) public staminaOf;
    mapping(uint256 => uint256) public lastUsedMatchday;
    mapping(uint256 => bool) private _staminaInit;

    event MatchdayConfigured(uint256 indexed matchday, uint64 lock);
    event LineupCommitted(uint256 indexed matchday, address indexed wallet, uint8 chipId);

    constructor(address card_, address chip_) Ownable(msg.sender) {
        card = ICardNFT(card_);
        chip = IChipNFT(chip_);
    }

    // --- matchday admin / clock ---
    function configureMatchday(uint256 m, uint64 lock_) external onlyOwner {
        matchdays[m] = Matchday(lock_, Status.Open);
        emit MatchdayConfigured(m, lock_);
    }
    function lock(uint256 m) external onlyOwner { matchdays[m].status = Status.Locked; }
    function cancel(uint256 m) external onlyOwner { matchdays[m].status = Status.Cancelled; }
    function settle(uint256 m) external onlyOwner { matchdays[m].status = Status.Settled; }

    function lockTime(uint256 m) external view returns (uint64) { return matchdays[m].lock; }
    function isOpen(uint256 m) public view returns (bool) {
        Matchday memory md = matchdays[m];
        return md.status == Status.Open && block.timestamp < md.lock;
    }
    function isCancelled(uint256 m) external view returns (bool) { return matchdays[m].status == Status.Cancelled; }
    function isSettled(uint256 m) external view returns (bool) { return matchdays[m].status == Status.Settled; }

    function hasLineup(uint256 m, address w) external view returns (bool) { return _lineups[m][w].exists; }
    function getLineup(uint256 m, address w) external view returns (Lineup memory) { return _lineups[m][w]; }

    // --- lineup commit ---
    function commitLineup(
        uint256 m,
        uint256[] calldata tokenIds,
        uint8 formation,
        uint8 captainIdx,
        uint8 viceIdx,
        uint8 chipId
    ) external {
        if (!isOpen(m)) revert Errors.MatchdayNotOpen();
        if (tokenIds.length != 11) revert Errors.BadInput();
        if (captainIdx >= 11 || viceIdx >= 11) revert Errors.BadInput();
        if (_lineups[m][msg.sender].exists) revert Errors.AlreadyExists();

        bool wildcard = chipId == uint8(WILDCARD);
        bool freeHit = chipId == uint8(FREE_HIT);

        for (uint256 i = 0; i < 11; i++) {
            uint256 id = tokenIds[i];
            address controller = card.userOf(id);
            if (controller == address(0)) controller = card.ownerOf(id);
            if (controller != msg.sender) revert Errors.NotController();
            if (cardUsedInMatchday[m][id]) revert Errors.CardAlreadyUsed();
            cardUsedInMatchday[m][id] = true;
            _applyStamina(id, m, wildcard, freeHit);
        }

        if (chipId != NO_CHIP) {
            chip.burnFrom(msg.sender, chipId, 1);
        }

        _lineups[m][msg.sender] =
            Lineup(tokenIds, formation, captainIdx, viceIdx, chipId, true);
        emit LineupCommitted(m, msg.sender, chipId);
    }

    function _applyStamina(uint256 id, uint256 m, bool wildcard, bool freeHit) internal {
        uint256 s;
        if (!_staminaInit[id]) { s = STAMINA_MAX; _staminaInit[id] = true; }
        else {
            s = staminaOf[id];
            uint256 last = lastUsedMatchday[id];
            if (m > last + 1) {
                uint256 idle = m - last - 1;
                s += idle * STAMINA_REGEN;
                if (s > STAMINA_MAX) s = STAMINA_MAX;
            }
        }
        if (wildcard) s = STAMINA_MAX;
        if (!freeHit) { s = s > STAMINA_COST ? s - STAMINA_COST : 0; }
        staminaOf[id] = uint8(s);
        lastUsedMatchday[id] = m;
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `forge test --match-contract GameRegistryTest`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/contracts/src/GameRegistry.sol packages/contracts/test/GameRegistry.t.sol
git commit -m "feat(contracts): add GameRegistry with matchday clock, lineup, stamina, chips"
```

---

## Task 7: RentalMarket (ERC-4907 leases, escrow, fee split, refunds)

**Files:**
- Create: `packages/contracts/src/RentalMarket.sol`
- Test: `packages/contracts/test/RentalMarket.t.sol`

**Design notes:**
- Pricing modes: `Fixed=0`, `FloorPegged=1`, `Suggested=2`. For all modes the contract resolves a concrete `priceValue` at rent time. FloorPegged = `floorPrice[player][tier] * bps / 10000`, where `floorPrice` is admin/oracle-fed (off-chain). Suggested behaves as Fixed on-chain (UI suggests the value).
- `listForRent(tokenId, mode, priceValue)`: owner lists; must own and have set the rental market via `CardNFT.setRentalMarket` (global) so `setRentalUser` is authorized.
- `rent(tokenId, matchday)`: requires `gameClock.isOpen(matchday)`; computes price; per-matchday rental exclusivity (`rentedFor[matchday][tokenId] == 0`); pulls USDC into escrow; sets 4907 user = renter until `lockTime(matchday) + matchWindow`; records rental.
- `cancel(tokenId, matchday)`: renter, pre-lock → 90% refund renter, 10% to owner; clears 4907 user.
- `settle(tokenId, matchday)`: after lock, pays owner 88%, platform 10%, original buyer 2%.
- `refundPostponed(tokenId, matchday)`: if `gameClock.isCancelled(matchday)` → 100% refund renter, nothing to owner.

- [ ] **Step 1: Write the failing test**

```solidity
// test/RentalMarket.t.sol
// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {RentalMarket} from "../src/RentalMarket.sol";
import {CardNFT} from "../src/CardNFT.sol";
import {ChipNFT} from "../src/ChipNFT.sol";
import {GameRegistry} from "../src/GameRegistry.sol";
import {ICardNFT} from "../src/interfaces/ICardNFT.sol";
import {MockUSDC} from "../src/mocks/MockUSDC.sol";

contract RentalMarketTest is Test {
    RentalMarket rent;
    CardNFT card;
    ChipNFT chip;
    GameRegistry game;
    MockUSDC usdc;
    address treasury = address(0x7BEA);
    address owner_ = address(0x0E1E2);  // card owner == original buyer
    address renter = address(0x5E37E2);
    bytes32 constant P = keccak256("P");
    uint256 tokenId;
    uint64 lockT;

    function setUp() public {
        usdc = new MockUSDC();
        card = new CardNFT("C","C");
        chip = new ChipNFT("u");
        game = new GameRegistry(address(card), address(chip));
        rent = new RentalMarket(address(card), address(usdc), address(game), treasury);

        card.setMinter(address(this), true);
        card.setRentalMarket(address(rent));
        card.setPlayerStats(P, 1, ICardNFT.Stats(1,1,1,1,1));
        tokenId = card.mint(owner_, P, 1, 1);

        lockT = uint64(block.timestamp + 1 hours);
        game.configureMatchday(1, lockT);

        vm.prank(renter); usdc.faucet(1_000e6);
        vm.prank(renter); usdc.approve(address(rent), type(uint256).max);
        vm.prank(owner_); rent.listForRent(tokenId, 0, 12e6); // Fixed $12
    }

    function test_rentSetsUserAndEscrows() public {
        vm.prank(renter); rent.rent(tokenId, 1);
        assertEq(card.userOf(tokenId), renter);
        assertEq(usdc.balanceOf(address(rent)), 12e6);
    }

    function test_settleSplits88_10_2() public {
        vm.prank(renter); rent.rent(tokenId, 1);
        vm.warp(lockT + 1);
        rent.settle(tokenId, 1);
        assertEq(usdc.balanceOf(owner_), 1056e4);   // 10.56
        assertEq(usdc.balanceOf(treasury), 120e4);  // 1.20
        // originalBuyer == owner_ → +0.24 → owner_ total 10.80
        assertEq(usdc.balanceOf(owner_), 1080e4);
    }

    function test_cancelPreLockRefunds90() public {
        vm.prank(renter); rent.rent(tokenId, 1);
        vm.prank(renter); rent.cancel(tokenId, 1);
        assertEq(usdc.balanceOf(renter), 1000e6 - 12e5); // lost 10% = 1.2
        assertEq(usdc.balanceOf(owner_), 12e5);          // owner gets 1.2
        assertEq(card.userOf(tokenId), address(0));
    }

    function test_postponedRefundsFull() public {
        vm.prank(renter); rent.rent(tokenId, 1);
        game.cancel(1);
        rent.refundPostponed(tokenId, 1);
        assertEq(usdc.balanceOf(renter), 1000e6);
        assertEq(usdc.balanceOf(owner_), 0);
    }

    function test_doubleRentSameMatchdayBlocked() public {
        vm.prank(renter); rent.rent(tokenId, 1);
        vm.prank(renter);
        vm.expectRevert();
        rent.rent(tokenId, 1);
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `forge test --match-contract RentalMarketTest`
Expected: FAIL — `RentalMarket` not found.

- [ ] **Step 3: Write the implementation**

```solidity
// src/RentalMarket.sol
// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ICardNFT} from "./interfaces/ICardNFT.sol";
import {IMatchdayClock} from "./interfaces/IMatchdayClock.sol";
import {Errors} from "./libs/Errors.sol";

contract RentalMarket is Ownable {
    uint16 public constant OWNER_BPS = 8800;
    uint16 public constant PLATFORM_BPS = 1000;
    uint16 public constant ORIGINAL_BPS = 200;
    uint16 public constant CANCEL_REFUND_BPS = 9000;
    uint64 public constant MATCH_WINDOW = 6 hours; // 4907 expiry past lock

    enum Mode { Fixed, FloorPegged, Suggested }
    struct Listing { address owner; Mode mode; uint256 priceValue; bool active; }
    struct Rental { address renter; uint256 paid; bool settled; }

    ICardNFT public immutable card;
    IERC20 public immutable usdc;
    IMatchdayClock public immutable clock;
    address public treasury;

    mapping(uint256 => Listing) public listings;                 // tokenId => listing
    mapping(uint256 => mapping(uint256 => Rental)) public rentals; // matchday => tokenId => rental
    mapping(bytes32 => mapping(uint8 => uint256)) public floorPrice; // player => tier => floor

    event ListedForRent(uint256 indexed tokenId, uint8 mode, uint256 priceValue);
    event Rented(uint256 indexed tokenId, uint256 indexed matchday, address renter, uint256 paid);
    event Settled(uint256 indexed tokenId, uint256 indexed matchday);
    event Cancelled(uint256 indexed tokenId, uint256 indexed matchday);
    event RefundedPostponed(uint256 indexed tokenId, uint256 indexed matchday);

    constructor(address card_, address usdc_, address clock_, address treasury_) Ownable(msg.sender) {
        card = ICardNFT(card_);
        usdc = IERC20(usdc_);
        clock = IMatchdayClock(clock_);
        treasury = treasury_;
    }

    function setTreasury(address t) external onlyOwner { treasury = t; }
    function setFloorPrice(bytes32 player, uint8 tier, uint256 price) external onlyOwner {
        floorPrice[player][tier] = price;
    }

    function listForRent(uint256 tokenId, uint8 mode, uint256 priceValue) external {
        if (card.ownerOf(tokenId) != msg.sender) revert Errors.NotAuthorized();
        listings[tokenId] = Listing(msg.sender, Mode(mode), priceValue, true);
        emit ListedForRent(tokenId, mode, priceValue);
    }

    function delist(uint256 tokenId) external {
        if (listings[tokenId].owner != msg.sender) revert Errors.NotAuthorized();
        listings[tokenId].active = false;
    }

    function _resolvePrice(uint256 tokenId, Listing memory l) internal view returns (uint256) {
        if (l.mode == Mode.FloorPegged) {
            // priceValue interpreted as bps of floor
            return floorPrice[_player(tokenId)][card.tierOf(tokenId)] * l.priceValue / 10000;
        }
        return l.priceValue; // Fixed & Suggested
    }

    function _player(uint256 tokenId) internal view returns (bytes32) {
        (bytes32 pid,,,) = _cardData(tokenId);
        return pid;
    }
    // CardNFT.cards is public; expose via low-level to avoid an extra interface fn
    function _cardData(uint256 tokenId) internal view returns (bytes32, uint8, uint32, uint32) {
        return CardNFTLike(address(card)).cards(tokenId);
    }

    function rent(uint256 tokenId, uint256 matchday) external {
        Listing memory l = listings[tokenId];
        if (!l.active) revert Errors.NotFound();
        if (!clock.isOpen(matchday)) revert Errors.MatchdayNotOpen();
        if (rentals[matchday][tokenId].renter != address(0)) revert Errors.CardAlreadyUsed();
        if (card.ownerOf(tokenId) != l.owner) revert Errors.NotAuthorized(); // owner changed

        uint256 price = _resolvePrice(tokenId, l);
        require(usdc.transferFrom(msg.sender, address(this), price), "usdc");
        rentals[matchday][tokenId] = Rental(msg.sender, price, false);

        uint64 expires = clock.lockTime(matchday) + MATCH_WINDOW;
        card.setRentalUser(tokenId, msg.sender, expires);
        emit Rented(tokenId, matchday, msg.sender, price);
    }

    function settle(uint256 tokenId, uint256 matchday) external {
        Rental storage r = rentals[matchday][tokenId];
        if (r.renter == address(0) || r.settled) revert Errors.NotFound();
        if (block.timestamp < clock.lockTime(matchday)) revert Errors.MatchdayNotOpen();
        if (clock.isCancelled(matchday)) revert Errors.BadInput(); // use refundPostponed
        r.settled = true;

        address owner_ = listings[tokenId].owner;
        address orig = card.originalBuyer(tokenId);
        uint256 platform = r.paid * PLATFORM_BPS / 10000;
        uint256 royalty = r.paid * ORIGINAL_BPS / 10000;
        uint256 toOwner = r.paid - platform - royalty;

        require(usdc.transfer(treasury, platform), "u1");
        require(usdc.transfer(orig, royalty), "u2");
        require(usdc.transfer(owner_, toOwner), "u3");
        emit Settled(tokenId, matchday);
    }

    function cancel(uint256 tokenId, uint256 matchday) external {
        Rental storage r = rentals[matchday][tokenId];
        if (r.renter != msg.sender) revert Errors.NotAuthorized();
        if (r.settled) revert Errors.BadInput();
        if (block.timestamp >= clock.lockTime(matchday)) revert Errors.MatchdayLocked();
        r.settled = true;

        uint256 refund = r.paid * CANCEL_REFUND_BPS / 10000;
        uint256 toOwner = r.paid - refund;
        require(usdc.transfer(r.renter, refund), "u1");
        require(usdc.transfer(listings[tokenId].owner, toOwner), "u2");
        card.setRentalUser(tokenId, address(0), 0);
        emit Cancelled(tokenId, matchday);
    }

    function refundPostponed(uint256 tokenId, uint256 matchday) external {
        Rental storage r = rentals[matchday][tokenId];
        if (r.renter == address(0) || r.settled) revert Errors.NotFound();
        if (!clock.isCancelled(matchday)) revert Errors.BadInput();
        r.settled = true;
        require(usdc.transfer(r.renter, r.paid), "u1");
        card.setRentalUser(tokenId, address(0), 0);
        emit RefundedPostponed(tokenId, matchday);
    }
}

interface CardNFTLike {
    function cards(uint256) external view returns (bytes32, uint8, uint32, uint32);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `forge test --match-contract RentalMarketTest`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/contracts/src/RentalMarket.sol packages/contracts/test/RentalMarket.t.sol
git commit -m "feat(contracts): add RentalMarket with 4907 leases, escrow, fee split, refunds"
```

---

## Task 8: ScoreOracle (N-of-M signer voting, score + DNP roots)

**Files:**
- Create: `packages/contracts/src/ScoreOracle.sol`
- Test: `packages/contracts/test/ScoreOracle.t.sol`

**Design notes:**
- Signers set + threshold (e.g. 3-of-5) at construction; owner can rotate signers.
- `submitRoot(matchday, scoreRoot, dnpRoot)`: each signer votes for an exact `(scoreRoot, dnpRoot)` pair once per matchday. When votes for a pair ≥ threshold, finalize both roots for the matchday. Re-finalize blocked.
- `roots(matchday)` and `dnpRoots(matchday)` are the public read surfaces used by ContestEscrow / InsurancePool / SeasonLeaderboard.

- [ ] **Step 1: Write the failing test**

```solidity
// test/ScoreOracle.t.sol
// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {ScoreOracle} from "../src/ScoreOracle.sol";
import {Errors} from "../src/libs/Errors.sol";

contract ScoreOracleTest is Test {
    ScoreOracle oracle;
    address s1 = address(0x51);
    address s2 = address(0x52);
    address s3 = address(0x53);
    bytes32 constant SR = keccak256("scoreRoot");
    bytes32 constant DR = keccak256("dnpRoot");

    function setUp() public {
        address[] memory signers = new address[](3);
        signers[0]=s1; signers[1]=s2; signers[2]=s3;
        oracle = new ScoreOracle(signers, 2); // 2-of-3
    }

    function test_finalizesAtThreshold() public {
        vm.prank(s1); oracle.submitRoot(1, SR, DR);
        assertEq(oracle.roots(1), bytes32(0)); // not yet
        vm.prank(s2); oracle.submitRoot(1, SR, DR);
        assertEq(oracle.roots(1), SR);
        assertEq(oracle.dnpRoots(1), DR);
    }

    function test_nonSignerReverts() public {
        vm.prank(address(0xBAD));
        vm.expectRevert(Errors.NotAuthorized.selector);
        oracle.submitRoot(1, SR, DR);
    }

    function test_signerCannotDoubleVote() public {
        vm.startPrank(s1);
        oracle.submitRoot(1, SR, DR);
        vm.expectRevert(Errors.AlreadyExists.selector);
        oracle.submitRoot(1, SR, DR);
        vm.stopPrank();
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `forge test --match-contract ScoreOracleTest`
Expected: FAIL — `ScoreOracle` not found.

- [ ] **Step 3: Write the implementation**

```solidity
// src/ScoreOracle.sol
// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Errors} from "./libs/Errors.sol";

contract ScoreOracle is Ownable {
    mapping(address => bool) public isSigner;
    uint256 public threshold;

    mapping(uint256 => bytes32) public roots;     // matchday => finalized score root
    mapping(uint256 => bytes32) public dnpRoots;  // matchday => finalized DNP root
    // matchday => keccak(scoreRoot,dnpRoot) => votes
    mapping(uint256 => mapping(bytes32 => uint256)) public votes;
    mapping(uint256 => mapping(address => bool)) public voted;

    event RootSubmitted(uint256 indexed matchday, address indexed signer);
    event RootFinalized(uint256 indexed matchday, bytes32 scoreRoot, bytes32 dnpRoot);

    constructor(address[] memory signers, uint256 threshold_) Ownable(msg.sender) {
        for (uint256 i = 0; i < signers.length; i++) isSigner[signers[i]] = true;
        threshold = threshold_;
    }

    function setSigner(address s, bool ok) external onlyOwner { isSigner[s] = ok; }
    function setThreshold(uint256 t) external onlyOwner { threshold = t; }

    function submitRoot(uint256 matchday, bytes32 scoreRoot, bytes32 dnpRoot) external {
        if (!isSigner[msg.sender]) revert Errors.NotAuthorized();
        if (voted[matchday][msg.sender]) revert Errors.AlreadyExists();
        if (roots[matchday] != bytes32(0)) revert Errors.AlreadyExists(); // already finalized
        voted[matchday][msg.sender] = true;

        bytes32 pair = keccak256(abi.encodePacked(scoreRoot, dnpRoot));
        uint256 v = ++votes[matchday][pair];
        emit RootSubmitted(matchday, msg.sender);

        if (v >= threshold) {
            roots[matchday] = scoreRoot;
            dnpRoots[matchday] = dnpRoot;
            emit RootFinalized(matchday, scoreRoot, dnpRoot);
        }
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `forge test --match-contract ScoreOracleTest`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/contracts/src/ScoreOracle.sol packages/contracts/test/ScoreOracle.t.sol
git commit -m "feat(contracts): add ScoreOracle with N-of-M signer voting and dual roots"
```

---

## Task 9: ContestEscrow (entry escrow, rake, Merkle payout)

**Files:**
- Create: `packages/contracts/src/ContestEscrow.sol`
- Test: `packages/contracts/test/ContestEscrow.t.sol`

**Design notes:**
- A contest = `{matchday, entryFee, rakeBps, payoutRoot, settled}`. Created by admin (`createContest`). Players `enter(contestId)`: one entry per wallet, pulls `entryFee` USDC. Free contest = entryFee 0.
- After matches, admin `setPayoutRoot(contestId, root)` (root = Merkle of `(wallet, amount)` leaves; the off-chain engine builds it from `ScoreOracle.roots[matchday]` — on-chain we trust the admin/oracle-set payout root, and the same multisig flow can gate `setPayoutRoot` if desired; v1 uses owner). Rake transferred to treasury at root-set time.
- `claim(contestId, amount, proof)`: verify `MerkleProof.verify(proof, root, keccak256(abi.encodePacked(wallet, amount)))`, mark claimed, pay.
- Leaf encoding fixed as `keccak256(abi.encodePacked(account, amount))` — the off-chain tree builder MUST match this exactly.

- [ ] **Step 1: Write the failing test**

```solidity
// test/ContestEscrow.t.sol
// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {ContestEscrow} from "../src/ContestEscrow.sol";
import {MockUSDC} from "../src/mocks/MockUSDC.sol";
import {Errors} from "../src/libs/Errors.sol";

contract ContestEscrowTest is Test {
    ContestEscrow esc;
    MockUSDC usdc;
    address treasury = address(0x7BEA);
    address alice = address(0xA11CE);
    address bob = address(0xB0B);

    function setUp() public {
        usdc = new MockUSDC();
        esc = new ContestEscrow(address(usdc), treasury);
        vm.prank(alice); usdc.faucet(100e6);
        vm.prank(bob);   usdc.faucet(100e6);
        vm.prank(alice); usdc.approve(address(esc), type(uint256).max);
        vm.prank(bob);   usdc.approve(address(esc), type(uint256).max);
    }

    function test_enterEscrowsFee() public {
        uint256 id = esc.createContest(1, 10e6, 800);
        vm.prank(alice); esc.enter(id);
        vm.prank(bob);   esc.enter(id);
        assertEq(usdc.balanceOf(address(esc)), 20e6);
    }

    function test_oneEntryPerWallet() public {
        uint256 id = esc.createContest(1, 10e6, 800);
        vm.startPrank(alice);
        esc.enter(id);
        vm.expectRevert(Errors.AlreadyExists.selector);
        esc.enter(id);
        vm.stopPrank();
    }

    function test_claimWithProof() public {
        uint256 id = esc.createContest(1, 10e6, 800);
        vm.prank(alice); esc.enter(id);
        vm.prank(bob);   esc.enter(id);
        // pool 20, rake 8% = 1.6 to treasury, 18.4 distributable.
        // single-winner tree: alice gets 18.4. Two-leaf tree: [alice 18.4e6].
        // For a one-leaf tree, root == leaf.
        bytes32 leaf = keccak256(abi.encodePacked(alice, uint256(184e5)));
        esc.setPayoutRoot(id, leaf);
        assertEq(usdc.balanceOf(treasury), 16e5); // rake 1.6
        bytes32[] memory proof = new bytes32[](0);
        vm.prank(alice);
        esc.claim(id, 184e5, proof);
        assertEq(usdc.balanceOf(alice), 90e6 + 184e5); // had 90 after entry, +18.4
    }

    function test_cannotClaimTwice() public {
        uint256 id = esc.createContest(1, 10e6, 800);
        vm.prank(alice); esc.enter(id);
        bytes32 leaf = keccak256(abi.encodePacked(alice, uint256(92e5)));
        esc.setPayoutRoot(id, leaf);
        bytes32[] memory proof = new bytes32[](0);
        vm.startPrank(alice);
        esc.claim(id, 92e5, proof);
        vm.expectRevert(Errors.AlreadyClaimed.selector);
        esc.claim(id, 92e5, proof);
        vm.stopPrank();
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `forge test --match-contract ContestEscrowTest`
Expected: FAIL — `ContestEscrow` not found.

- [ ] **Step 3: Write the implementation**

```solidity
// src/ContestEscrow.sol
// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import {Errors} from "./libs/Errors.sol";

contract ContestEscrow is Ownable {
    struct Contest {
        uint256 matchday;
        uint256 entryFee;
        uint16 rakeBps;
        uint256 pool;
        bytes32 payoutRoot;
        bool rootSet;
    }

    IERC20 public immutable usdc;
    address public treasury;
    uint256 public nextContestId = 1;
    mapping(uint256 => Contest) public contests;
    mapping(uint256 => mapping(address => bool)) public entered;
    mapping(uint256 => mapping(address => bool)) public claimed;

    event ContestCreated(uint256 indexed id, uint256 matchday, uint256 entryFee, uint16 rakeBps);
    event Entered(uint256 indexed id, address indexed player);
    event PayoutRootSet(uint256 indexed id, bytes32 root, uint256 rake);
    event Claimed(uint256 indexed id, address indexed player, uint256 amount);

    constructor(address usdc_, address treasury_) Ownable(msg.sender) {
        usdc = IERC20(usdc_);
        treasury = treasury_;
    }

    function setTreasury(address t) external onlyOwner { treasury = t; }

    function createContest(uint256 matchday, uint256 entryFee, uint16 rakeBps)
        external onlyOwner returns (uint256 id)
    {
        id = nextContestId++;
        contests[id] = Contest(matchday, entryFee, rakeBps, 0, bytes32(0), false);
        emit ContestCreated(id, matchday, entryFee, rakeBps);
    }

    function enter(uint256 id) external {
        Contest storage c = contests[id];
        if (c.matchday == 0) revert Errors.NotFound();
        if (entered[id][msg.sender]) revert Errors.AlreadyExists();
        entered[id][msg.sender] = true;
        if (c.entryFee > 0) {
            require(usdc.transferFrom(msg.sender, address(this), c.entryFee), "usdc");
            c.pool += c.entryFee;
        }
        emit Entered(id, msg.sender);
    }

    function setPayoutRoot(uint256 id, bytes32 root) external onlyOwner {
        Contest storage c = contests[id];
        if (c.matchday == 0) revert Errors.NotFound();
        if (c.rootSet) revert Errors.AlreadyExists();
        c.rootSet = true;
        c.payoutRoot = root;
        uint256 rake = c.pool * c.rakeBps / 10000;
        if (rake > 0) require(usdc.transfer(treasury, rake), "rake");
        emit PayoutRootSet(id, root, rake);
    }

    function claim(uint256 id, uint256 amount, bytes32[] calldata proof) external {
        Contest storage c = contests[id];
        if (!c.rootSet) revert Errors.NotFound();
        if (claimed[id][msg.sender]) revert Errors.AlreadyClaimed();
        bytes32 leaf = keccak256(abi.encodePacked(msg.sender, amount));
        if (!MerkleProof.verify(proof, c.payoutRoot, leaf)) revert Errors.InvalidProof();
        claimed[id][msg.sender] = true;
        require(usdc.transfer(msg.sender, amount), "pay");
        emit Claimed(id, msg.sender, amount);
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `forge test --match-contract ContestEscrowTest`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/contracts/src/ContestEscrow.sol packages/contracts/test/ContestEscrow.t.sol
git commit -m "feat(contracts): add ContestEscrow with entry escrow, rake, Merkle claims"
```

---

## Task 10: InsurancePool (DNP premium escrow, oracle-attested refund)

**Files:**
- Create: `packages/contracts/src/InsurancePool.sol`
- Test: `packages/contracts/test/InsurancePool.t.sol`

**Design notes:**
- Renter buys insurance for a rental they hold: `insure(matchday, tokenId, rentalCost)` pays a premium = `rentalCost * 2000 / 10000` into the pool.
- After matchday, if the player got 0 minutes, the off-chain engine includes a leaf in `ScoreOracle.dnpRoots[matchday]` keyed `keccak256(abi.encodePacked(tokenId))` (DNP = did-not-play for that card's player). Renter calls `claimDnp(matchday, tokenId, rentalCost, proof)`: verifies against the oracle DNP root, pays `rentalCost` (100% rental refund) + 50% of premium back. Pool must hold funds (seeded by premiums + treasury top-ups).
- Decoupled from RentalMarket settlement for v1 simplicity: insurance refunds the renter's rental cost from the pool, independent of whether RentalMarket already paid the owner.

- [ ] **Step 1: Write the failing test**

```solidity
// test/InsurancePool.t.sol
// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {InsurancePool} from "../src/InsurancePool.sol";
import {ScoreOracle} from "../src/ScoreOracle.sol";
import {MockUSDC} from "../src/mocks/MockUSDC.sol";

contract InsurancePoolTest is Test {
    InsurancePool ins;
    ScoreOracle oracle;
    MockUSDC usdc;
    address treasury = address(0x7BEA);
    address renter = address(0x5E37E2);
    address s1 = address(0x51);
    address s2 = address(0x52);
    uint256 constant TOKEN = 7;

    function setUp() public {
        usdc = new MockUSDC();
        address[] memory signers = new address[](2);
        signers[0]=s1; signers[1]=s2;
        oracle = new ScoreOracle(signers, 2);
        ins = new InsurancePool(address(usdc), address(oracle), treasury);

        usdc.faucet(1_000e6); usdc.transfer(address(ins), 1_000e6); // seed pool
        vm.prank(renter); usdc.faucet(100e6);
        vm.prank(renter); usdc.approve(address(ins), type(uint256).max);
    }

    function test_insureCollectsPremium() public {
        vm.prank(renter);
        ins.insure(1, TOKEN, 10e6); // premium = 2.0
        assertEq(usdc.balanceOf(renter), 98e6);
    }

    function test_claimDnpRefundsRentalPlusHalfPremium() public {
        vm.prank(renter);
        ins.insure(1, TOKEN, 10e6); // premium 2.0
        // oracle posts dnp root = single leaf keccak(tokenId)
        bytes32 leaf = keccak256(abi.encodePacked(TOKEN));
        vm.prank(s1); oracle.submitRoot(1, keccak256("score"), leaf);
        vm.prank(s2); oracle.submitRoot(1, keccak256("score"), leaf);

        bytes32[] memory proof = new bytes32[](0);
        vm.prank(renter);
        ins.claimDnp(1, TOKEN, 10e6, proof);
        // refund 10 + half premium 1.0 = 11; renter had 98 → 109
        assertEq(usdc.balanceOf(renter), 109e6);
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `forge test --match-contract InsurancePoolTest`
Expected: FAIL — `InsurancePool` not found.

- [ ] **Step 3: Write the implementation**

```solidity
// src/InsurancePool.sol
// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import {Errors} from "./libs/Errors.sol";

interface IScoreOracleDnp { function dnpRoots(uint256) external view returns (bytes32); }

contract InsurancePool is Ownable {
    uint16 public constant PREMIUM_BPS = 2000;     // +20%
    uint16 public constant PREMIUM_RETURN_BPS = 5000; // 50% of premium back on payout

    IERC20 public immutable usdc;
    IScoreOracleDnp public immutable oracle;
    address public treasury;

    struct Policy { address renter; uint256 rentalCost; uint256 premium; bool claimed; }
    mapping(uint256 => mapping(uint256 => Policy)) public policies; // matchday => tokenId => policy

    event Insured(uint256 indexed matchday, uint256 indexed tokenId, address renter, uint256 premium);
    event DnpClaimed(uint256 indexed matchday, uint256 indexed tokenId, uint256 payout);

    constructor(address usdc_, address oracle_, address treasury_) Ownable(msg.sender) {
        usdc = IERC20(usdc_);
        oracle = IScoreOracleDnp(oracle_);
        treasury = treasury_;
    }

    function setTreasury(address t) external onlyOwner { treasury = t; }
    function withdrawSurplus(uint256 amount) external onlyOwner {
        require(usdc.transfer(treasury, amount), "w");
    }

    function insure(uint256 matchday, uint256 tokenId, uint256 rentalCost) external {
        if (policies[matchday][tokenId].renter != address(0)) revert Errors.AlreadyExists();
        uint256 premium = rentalCost * PREMIUM_BPS / 10000;
        require(usdc.transferFrom(msg.sender, address(this), premium), "premium");
        policies[matchday][tokenId] = Policy(msg.sender, rentalCost, premium, false);
        emit Insured(matchday, tokenId, msg.sender, premium);
    }

    function claimDnp(uint256 matchday, uint256 tokenId, uint256 rentalCost, bytes32[] calldata proof)
        external
    {
        Policy storage p = policies[matchday][tokenId];
        if (p.renter != msg.sender) revert Errors.NotAuthorized();
        if (p.claimed) revert Errors.AlreadyClaimed();
        if (p.rentalCost != rentalCost) revert Errors.BadInput();
        bytes32 root = oracle.dnpRoots(matchday);
        if (root == bytes32(0)) revert Errors.NotFound();
        bytes32 leaf = keccak256(abi.encodePacked(tokenId));
        if (!MerkleProof.verify(proof, root, leaf)) revert Errors.InvalidProof();

        p.claimed = true;
        uint256 payout = p.rentalCost + (p.premium * PREMIUM_RETURN_BPS / 10000);
        require(usdc.transfer(p.renter, payout), "pay");
        emit DnpClaimed(matchday, tokenId, payout);
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `forge test --match-contract InsurancePoolTest`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/contracts/src/InsurancePool.sol packages/contracts/test/InsurancePool.t.sol
git commit -m "feat(contracts): add InsurancePool with DNP premium escrow and oracle-attested refunds"
```

---

## Task 11: SeasonLeaderboard (season-aggregate Merkle payout)

**Files:**
- Create: `packages/contracts/src/SeasonLeaderboard.sol`
- Test: `packages/contracts/test/SeasonLeaderboard.t.sol`

**Design notes:**
- Off-chain engine aggregates all daily roots into a final season ranking and builds one payout Merkle tree. Funded by transfers into the contract (2% rake accumulation pool, per spec §5.4).
- Owner `fund()` (just send USDC) + `setSeasonRoot(root)` once. `claim(amount, proof)` like ContestEscrow. Leaf = `keccak256(abi.encodePacked(account, amount))`.

- [ ] **Step 1: Write the failing test**

```solidity
// test/SeasonLeaderboard.t.sol
// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {SeasonLeaderboard} from "../src/SeasonLeaderboard.sol";
import {MockUSDC} from "../src/mocks/MockUSDC.sol";
import {Errors} from "../src/libs/Errors.sol";

contract SeasonLeaderboardTest is Test {
    SeasonLeaderboard season;
    MockUSDC usdc;
    address alice = address(0xA11CE);

    function setUp() public {
        usdc = new MockUSDC();
        season = new SeasonLeaderboard(address(usdc));
        usdc.faucet(1_000e6); usdc.transfer(address(season), 1_000e6);
    }

    function test_setRootAndClaim() public {
        bytes32 leaf = keccak256(abi.encodePacked(alice, uint256(500e6)));
        season.setSeasonRoot(leaf);
        bytes32[] memory proof = new bytes32[](0);
        vm.prank(alice);
        season.claim(500e6, proof);
        assertEq(usdc.balanceOf(alice), 500e6);
    }

    function test_cannotSetRootTwice() public {
        season.setSeasonRoot(keccak256("a"));
        vm.expectRevert(Errors.AlreadyExists.selector);
        season.setSeasonRoot(keccak256("b"));
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `forge test --match-contract SeasonLeaderboardTest`
Expected: FAIL — `SeasonLeaderboard` not found.

- [ ] **Step 3: Write the implementation**

```solidity
// src/SeasonLeaderboard.sol
// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import {Errors} from "./libs/Errors.sol";

contract SeasonLeaderboard is Ownable {
    IERC20 public immutable usdc;
    bytes32 public seasonRoot;
    bool public rootSet;
    mapping(address => bool) public claimed;

    event SeasonRootSet(bytes32 root);
    event Claimed(address indexed player, uint256 amount);

    constructor(address usdc_) Ownable(msg.sender) { usdc = IERC20(usdc_); }

    function setSeasonRoot(bytes32 root) external onlyOwner {
        if (rootSet) revert Errors.AlreadyExists();
        rootSet = true;
        seasonRoot = root;
        emit SeasonRootSet(root);
    }

    function claim(uint256 amount, bytes32[] calldata proof) external {
        if (!rootSet) revert Errors.NotFound();
        if (claimed[msg.sender]) revert Errors.AlreadyClaimed();
        bytes32 leaf = keccak256(abi.encodePacked(msg.sender, amount));
        if (!MerkleProof.verify(proof, seasonRoot, leaf)) revert Errors.InvalidProof();
        claimed[msg.sender] = true;
        require(usdc.transfer(msg.sender, amount), "pay");
        emit Claimed(msg.sender, amount);
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `forge test --match-contract SeasonLeaderboardTest`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/contracts/src/SeasonLeaderboard.sol packages/contracts/test/SeasonLeaderboard.t.sol
git commit -m "feat(contracts): add SeasonLeaderboard with season-aggregate Merkle payout"
```

---

## Task 12: Integration test (full matchday end-to-end)

**Files:**
- Create: `packages/contracts/test/Integration.t.sol`

Covers the spec's success criterion: mint → list-for-rent → rent → commit lineup with rented card → oracle posts root → contest claim. Proves the rental primitive feeds the lineup (spec §12 "≥30% of lineup'd cards are rentals").

- [ ] **Step 1: Write the integration test**

```solidity
// test/Integration.t.sol
// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {MockUSDC} from "../src/mocks/MockUSDC.sol";
import {CardNFT} from "../src/CardNFT.sol";
import {ChipNFT} from "../src/ChipNFT.sol";
import {GameRegistry} from "../src/GameRegistry.sol";
import {RentalMarket} from "../src/RentalMarket.sol";
import {ScoreOracle} from "../src/ScoreOracle.sol";
import {ContestEscrow} from "../src/ContestEscrow.sol";
import {ICardNFT} from "../src/interfaces/ICardNFT.sol";

contract IntegrationTest is Test {
    MockUSDC usdc;
    CardNFT card;
    ChipNFT chip;
    GameRegistry game;
    RentalMarket rental;
    ScoreOracle oracle;
    ContestEscrow contest;

    address treasury = address(0x7BEA);
    address ownerA = address(0x0A);    // owns cards, rents them out
    address manager = address(0x6A);   // rents + plays
    address s1 = address(0x51);
    address s2 = address(0x52);
    bytes32 constant P = keccak256("P");
    uint64 lockT;

    function setUp() public {
        usdc = new MockUSDC();
        card = new CardNFT("C","C");
        chip = new ChipNFT("u");
        game = new GameRegistry(address(card), address(chip));
        rental = new RentalMarket(address(card), address(usdc), address(game), treasury);
        address[] memory signers = new address[](2); signers[0]=s1; signers[1]=s2;
        oracle = new ScoreOracle(signers, 2);
        contest = new ContestEscrow(address(usdc), treasury);

        card.setMinter(address(this), true);
        card.setRentalMarket(address(rental));
        chip.setBurner(address(game), true);
        card.setPlayerStats(P, 0, ICardNFT.Stats(1,1,1,1,1));

        lockT = uint64(block.timestamp + 1 hours);
        game.configureMatchday(1, lockT);

        vm.prank(manager); usdc.faucet(1_000e6);
        vm.prank(manager); usdc.approve(address(rental), type(uint256).max);
        vm.prank(manager); usdc.approve(address(contest), type(uint256).max);
    }

    function test_fullMatchdayWithRentedCardInLineup() public {
        // ownerA mints 11 cards, lists all for rent
        uint256[] memory ids = new uint256[](11);
        for (uint256 i=0;i<11;i++){
            ids[i] = card.mint(ownerA, P, 0, 1);
            vm.prank(ownerA); rental.listForRent(ids[i], 0, 1e6);
        }
        // manager rents all 11 for matchday 1
        for (uint256 i=0;i<11;i++){ vm.prank(manager); rental.rent(ids[i], 1); }
        for (uint256 i=0;i<11;i++) assertEq(card.userOf(ids[i]), manager);

        // manager enters paid contest and commits lineup of rented cards
        uint256 cid = contest.createContest(1, 10e6, 800);
        vm.prank(manager); contest.enter(cid);
        vm.prank(manager); game.commitLineup(1, ids, 0, 0, 1, 255);
        assertTrue(game.hasLineup(1, manager));

        // lock passes, oracle posts root, manager claims a payout
        vm.warp(lockT + 1);
        bytes32 leaf = keccak256(abi.encodePacked(manager, uint256(92e5)));
        vm.prank(s1); oracle.submitRoot(1, leaf, bytes32(0));
        vm.prank(s2); oracle.submitRoot(1, leaf, bytes32(0));
        // payout root mirrors winner leaf (single-entry contest)
        contest.setPayoutRoot(cid, leaf);
        bytes32[] memory proof = new bytes32[](0);
        vm.prank(manager); contest.claim(cid, 92e5, proof);

        // settle rentals → ownerA earns
        for (uint256 i=0;i<11;i++) rental.settle(ids[i], 1);
        assertGt(usdc.balanceOf(ownerA), 0);
    }
}
```

- [ ] **Step 2: Run the full suite**

Run: `cd packages/contracts && forge test -vv`
Expected: ALL tests pass across every contract + integration.

- [ ] **Step 3: Commit**

```bash
git add packages/contracts/test/Integration.t.sol
git commit -m "test(contracts): add full matchday end-to-end integration test"
```

---

## Task 13: Deploy script + testnet deployment

**Files:**
- Create: `packages/contracts/script/Deploy.s.sol`

Deploys all 11 contracts and wires roles/addresses in one broadcast. Reads `PRIVATE_KEY` from env (already in repo-root `.env`, gitignored).

- [ ] **Step 1: Write the deploy script**

```solidity
// script/Deploy.s.sol
// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {MockUSDC} from "../src/mocks/MockUSDC.sol";
import {CardNFT} from "../src/CardNFT.sol";
import {ChipNFT} from "../src/ChipNFT.sol";
import {PackSale} from "../src/PackSale.sol";
import {Marketplace} from "../src/Marketplace.sol";
import {RentalMarket} from "../src/RentalMarket.sol";
import {GameRegistry} from "../src/GameRegistry.sol";
import {ScoreOracle} from "../src/ScoreOracle.sol";
import {ContestEscrow} from "../src/ContestEscrow.sol";
import {InsurancePool} from "../src/InsurancePool.sol";
import {SeasonLeaderboard} from "../src/SeasonLeaderboard.sol";

contract Deploy is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(pk);
        address treasury = deployer; // testnet: treasury = deployer

        vm.startBroadcast(pk);

        MockUSDC usdc = new MockUSDC();
        CardNFT card = new CardNFT("ManagerCup Card", "MCUP");
        ChipNFT chip = new ChipNFT("ipfs://managercup/chips/");
        PackSale pack = new PackSale(address(card), address(usdc), treasury);
        Marketplace mkt = new Marketplace(address(card), address(usdc), treasury);
        GameRegistry game = new GameRegistry(address(card), address(chip));
        RentalMarket rental = new RentalMarket(address(card), address(usdc), address(game), treasury);

        address[] memory signers = new address[](1);
        signers[0] = deployer; // testnet: 1-of-1; rotate to 3-of-5 for mainnet
        ScoreOracle oracle = new ScoreOracle(signers, 1);
        ContestEscrow contest = new ContestEscrow(address(usdc), treasury);
        InsurancePool insurance = new InsurancePool(address(usdc), address(oracle), treasury);
        SeasonLeaderboard season = new SeasonLeaderboard(address(usdc));

        // wiring
        card.setMinter(address(pack), true);
        card.setMinter(deployer, true);          // for starter-squad airdrops
        card.setRentalMarket(address(rental));
        chip.setBurner(address(game), true);

        vm.stopBroadcast();

        console.log("USDC           ", address(usdc));
        console.log("CardNFT        ", address(card));
        console.log("ChipNFT        ", address(chip));
        console.log("PackSale       ", address(pack));
        console.log("Marketplace    ", address(mkt));
        console.log("GameRegistry   ", address(game));
        console.log("RentalMarket   ", address(rental));
        console.log("ScoreOracle    ", address(oracle));
        console.log("ContestEscrow  ", address(contest));
        console.log("InsurancePool  ", address(insurance));
        console.log("SeasonLeaderbd ", address(season));
    }
}
```

- [ ] **Step 2: Dry-run the deploy locally (no broadcast)**

Run:
```bash
cd packages/contracts && set -a && source ../../.env && set +a && forge script script/Deploy.s.sol:Deploy
```
Expected: simulation succeeds, prints all 11 addresses, no revert.

- [ ] **Step 3: Confirm the deployer is funded on X Layer testnet**

Run:
```bash
set -a && source ../../.env && set +a && cast balance $(cast wallet address --private-key $PRIVATE_KEY) --rpc-url $RPC_URL
```
Expected: non-zero OKB balance. **If zero, STOP** — fund the deployer from the X Layer testnet faucet before broadcasting. Report the address to the user and ask them to fund it.

- [ ] **Step 4: Broadcast to X Layer testnet**

> This sends real testnet transactions. Confirm Step 3 showed a funded balance first.

Run:
```bash
cd packages/contracts && set -a && source ../../.env && set +a && \
forge script script/Deploy.s.sol:Deploy --rpc-url $RPC_URL --broadcast --legacy
```
Expected: 11 contracts deployed; addresses printed; `broadcast/Deploy.s.sol/1952/run-latest.json` written. `--legacy` is used because X Layer may not price EIP-1559 the same as L1; drop it if 1559 works.

- [ ] **Step 5: Record deployed addresses**

Create `packages/contracts/deployments/xlayer-testnet.json` with the 11 addresses from Step 4 output (copy from console / `run-latest.json`). This file is the source of truth for the frontend/indexer.

- [ ] **Step 6: Commit**

```bash
git add packages/contracts/script/Deploy.s.sol packages/contracts/deployments/xlayer-testnet.json
git commit -m "feat(contracts): add deploy script and X Layer testnet deployment addresses"
```

---

## Self-Review Notes (author checklist — already reconciled)

**Spec coverage map:**

| Spec requirement | Task |
|---|---|
| FR-C1 ERC-721 | Task 2 |
| FR-C2 ERC-4907 | Task 2 (inlined) |
| FR-C3 4 tiers + supply caps | Task 2 (`tierSupplyCap`) |
| FR-C4 deterministic stats per (player,tier) | Task 2 (`tierStats` + `mint` copy) |
| FR-C6 serial/batch/metadata | Task 2 (`Card` struct) |
| FR-C7 no upgrade / FR-C8 no burn | Task 2 (no such functions exist) |
| FR-P1 USDC + randomness | Task 4 (commit-reveal) |
| FR-P2 Bronze/Silver/Gold | Task 4 (`tierCum[0..2]`) |
| FR-P4 pull rates on-chain | Task 4 (`tierCum` public) |
| FR-M1 fixed-price | Task 5 |
| FR-M3 5% royalty split | Task 5 (`PLATFORM_BPS`/`ORIGINAL_BPS`) |
| FR-R1 per-matchday 4907 | Task 7 |
| FR-R2 3 pricing modes | Task 7 (`Mode`) |
| FR-R3 88/10/2 split | Task 7 (`settle`) |
| FR-R4 exclusivity | Task 6 (`cardUsedInMatchday`) + Task 7 (per-matchday rental) |
| FR-R7 auto-refund postpone | Task 7 (`refundPostponed`) |
| FR-R8 90% cancel refund | Task 7 (`cancel`) |
| FR-R9 stamina inherited | Task 6 (stamina keyed by tokenId, not owner) |
| FR-G1 11-card lineup | Task 6 |
| FR-G2 formations / FR-G3 captain+VC | Task 6 (`formation`,`captainIdx`,`viceIdx`) |
| FR-G6 4 baseline chips | Task 3 + Task 6 (burn-on-use) |
| FR-G7 stamina | Task 6 (`_applyStamina`) |
| FR-S4 Merkle root commit | Task 8 |
| FR-CT1/CT2 free + Common Open | Task 9 (`entryFee` 0 or $1) |
| FR-CT4 season leaderboard | Task 11 |
| FR-CT7 Merkle payout | Task 9 + Task 11 |
| FR-CT9 1 entry per wallet | Task 9 (`entered`) |
| DNP insurance (v1.5, included) | Task 10 |

**Open items deferred to off-chain (by design, not gaps):** all scoring multipliers (§4.9), trait/formation/country synergies, position legality, live scoring, day-after analytics, wash-trade detection, geofencing. These belong to the off-chain score engine + indexer + frontend, not the contracts.

**Known hardening TODOs (post-hackathon, not blockers):** add `ReentrancyGuard` to escrow/payout contracts; replace `transfer`/`transferFrom` bool checks with `SafeERC20`; commit-reveal `blockhash` is weakly manipulable by block producers (acceptable for testnet/demo, harden for mainnet real-money packs); ScoreOracle/`setPayoutRoot` should move from owner to multisig for mainnet; pause switches; events on all admin setters.

---

*Plan complete. Built TDD, one contract per task, commit per task, full matchday integration test, then testnet deploy gated on a funded-balance check.*
