// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test, console} from "forge-std/Test.sol";
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
import {ICardNFT} from "../src/interfaces/ICardNFT.sol";
import {Errors} from "../src/libs/Errors.sol";

/// End-to-end lifecycle: walks the full user journey and touches every external
/// function across all 11 contracts in the order a real user/admin would hit them.
/// Run: forge test --match-contract E2ELifecycleTest -vv
contract E2ELifecycleTest is Test {
    MockUSDC usdc;
    CardNFT card;
    ChipNFT chip;
    PackSale pack;
    Marketplace mkt;
    RentalMarket rental;
    GameRegistry game;
    ScoreOracle oracle;
    ContestEscrow contest;
    InsurancePool insurance;
    SeasonLeaderboard season;

    address admin = address(this); // owner / minter / oracle signer
    address collector = address(0xC0);
    address manager = address(0x60);
    address buyer = address(0xB0);
    address friend = address(0xF0);
    address signer2 = address(0x52);
    address treasury = address(0x7E);

    uint64 lock1;
    uint256[] rented; // 11 rented card ids for matchday 1
    uint256 insuredId;
    uint256 contestId;

    function pid(uint256 i) internal pure returns (bytes32) {
        return keccak256(abi.encode("PLAYER", i));
    }

    function setUp() public {
        usdc = new MockUSDC();
        card = new CardNFT("ManagerCup Card", "MCUP");
        chip = new ChipNFT("ipfs://chips/");
        pack = new PackSale(address(card), address(usdc), treasury);
        mkt = new Marketplace(address(card), address(usdc), treasury);
        game = new GameRegistry(address(card), address(chip));
        rental = new RentalMarket(address(card), address(usdc), address(game), treasury);

        address[] memory signers = new address[](1);
        signers[0] = admin;
        oracle = new ScoreOracle(signers, 1);
        contest = new ContestEscrow(address(usdc), address(oracle), treasury);
        insurance = new InsurancePool(address(usdc), address(oracle), treasury);
        season = new SeasonLeaderboard(address(usdc), address(oracle));

        // wiring
        card.setMinter(address(pack), true);
        card.setMinter(admin, true);
        card.setRentalMarket(address(rental));
        chip.setBurner(address(game), true);

        // deterministic stats for the player ids used across the flow (all tiers)
        ICardNFT.Stats memory s = ICardNFT.Stats(80, 80, 80, 50, 70);
        for (uint256 i = 0; i < 30; i++) {
            for (uint8 t = 0; t < 4; t++) card.setPlayerStats(pid(i), t, s);
        }

        lock1 = uint64(block.timestamp + 1 hours);
        game.configureMatchday(1, lock1);

        // funding
        vm.prank(manager); usdc.faucet(10_000e6);
        vm.prank(buyer); usdc.faucet(1_000e6);
        vm.prank(collector); usdc.faucet(1_000e6);
        usdc.faucet(2_000e6); // admin: seeds insurance pool + season pool
        usdc.transfer(address(insurance), 1_000e6);
        usdc.transfer(address(season), 1_000e6);

        // approvals
        vm.prank(manager); usdc.approve(address(rental), type(uint256).max);
        vm.prank(manager); usdc.approve(address(contest), type(uint256).max);
        vm.prank(manager); usdc.approve(address(insurance), type(uint256).max);
        vm.prank(buyer); usdc.approve(address(mkt), type(uint256).max);
        vm.prank(collector); usdc.approve(address(pack), type(uint256).max);
    }

    function test_fullLifecycle() public {
        _onboarding();
        _packs();
        _marketplace();
        _directDelegationGuard();
        _rentals();
        _gameplay();
        _contest();
        _oracleSettleClaim();
        _insuranceClaim();
        _altMatchdays();
        _season();
        _adminMisc();
        console.log("== FULL LIFECYCLE COMPLETE ==");
    }

    // 1) New user: claim chips + receive free starter squad
    function _onboarding() internal {
        vm.prank(manager); chip.claimBaseline();
        for (uint256 i = 0; i < 4; i++) assertEq(chip.balanceOf(manager, i), 1);

        bytes32[] memory squad = new bytes32[](5);
        for (uint256 i = 0; i < 5; i++) squad[i] = pid(i);
        uint256[] memory ids = card.airdropStarterSquad(manager, squad);
        assertEq(ids.length, 5);
        assertEq(card.balanceOf(manager), 5);
        console.log("[1] onboarding: 4 chips + 5 starter cards");
    }

    // 2) Collector buys a pack (commit-reveal) and gets 5 cards
    function _packs() internal {
        pack.setPackPrice(0, 5e6);
        pack.setTierCum(0, [uint16(9000), 9950, 9999, 10000]);
        pack.setMintBatch(2);
        bytes32[] memory pool = new bytes32[](3);
        pool[0] = pid(0); pool[1] = pid(1); pool[2] = pid(2);
        pack.setPlayerPool(pool);

        vm.prank(collector);
        uint256 commitId = pack.buy(0);
        vm.roll(block.number + 18); // pass the 16-block reveal delay
        vm.prank(collector);
        pack.reveal(commitId);
        assertEq(card.balanceOf(collector), 5);

        pack.withdraw(5e6); // pack revenue -> treasury
        assertEq(usdc.balanceOf(treasury), 5e6);
        console.log("[2] packs: bought + revealed 5 cards; revenue withdrawn");
    }

    // 3) Marketplace: list + buy with royalty split, and a cancel
    function _marketplace() internal {
        uint256 a = card.mint(collector, pid(10), 1, 1); // Rare, collector = original buyer
        uint256 b = card.mint(collector, pid(11), 1, 1);

        vm.prank(collector); card.approve(address(mkt), a);
        vm.prank(collector); mkt.list(a, 100e6);
        assertEq(card.ownerOf(a), address(mkt));

        uint256 tBefore = usdc.balanceOf(treasury);
        vm.prank(buyer); mkt.buy(a);
        assertEq(card.ownerOf(a), buyer);
        assertEq(usdc.balanceOf(treasury) - tBefore, 4e6); // 4% platform royalty

        vm.prank(collector); card.approve(address(mkt), b);
        vm.prank(collector); mkt.list(b, 50e6);
        vm.prank(collector); mkt.cancel(b);
        assertEq(card.ownerOf(b), collector);
        console.log("[3] marketplace: sold w/ royalty split; cancel returns NFT");
    }

    // 4) Direct ERC-4907 delegation + transfer guard
    function _directDelegationGuard() internal {
        uint256 v = card.mint(collector, pid(12), 0, 1);
        vm.prank(collector); card.setUser(v, friend, uint64(block.timestamp + 2 days));
        assertEq(card.userOf(v), friend);
        assertGt(card.userExpires(v), 0);
        vm.prank(collector);
        vm.expectRevert(Errors.TransferWhileRented.selector);
        card.transferFrom(collector, buyer, v);
        console.log("[4] delegation: setUser ok; transfer blocked while delegated");
    }

    // 5) Rentals: collector lists 11 cards, manager rents them for matchday 1
    function _rentals() internal {
        rental.setTreasury(treasury);
        for (uint256 i = 0; i < 11; i++) {
            uint256 id = card.mint(collector, pid(i), 0, 1); // collector = owner + original buyer
            rented.push(id);
            uint8 mode = i == 0 ? 1 : 0; // exercise FloorPegged on the first, Fixed on the rest
            if (mode == 1) {
                rental.setFloorPrice(pid(i), 0, 50e6); // floor 50 USDC
                vm.prank(collector); rental.listForRent(id, 1, 200); // 2% of floor = 1 USDC
            } else {
                vm.prank(collector); rental.listForRent(id, 0, 1e6); // fixed 1 USDC
            }
            vm.prank(manager); rental.rent(id, 1);
            assertEq(card.userOf(id), manager);
        }
        insuredId = rented[5];

        // owner cannot move a rented card
        vm.prank(collector);
        vm.expectRevert(Errors.TransferWhileRented.selector);
        card.transferFrom(collector, buyer, rented[1]);

        // manager insures one rental against DNP
        vm.prank(manager); insurance.insure(1, insuredId, 1e6);
        assertEq(insurance.openExposure(), 1e6 + (1e6 * 2000 / 10000) * 5000 / 10000);
        console.log("[5] rentals: 11 cards rented (fixed + floor-pegged); 1 insured");
    }

    // 6) Gameplay: commit an 11-card lineup of rented cards, using the Free Hit chip
    function _gameplay() internal {
        uint8 freeHit = 3;
        vm.prank(manager);
        game.commitLineup(1, rented, 0, 0, 1, freeHit);
        assertTrue(game.hasLineup(1, manager));
        assertEq(chip.balanceOf(manager, freeHit), 0);
        assertEq(game.staminaOf(rented[0]), 100); // Free Hit => no stamina cost
        assertTrue(game.cardUsedInMatchday(1, rented[0]));

        // exclusivity: cannot commit twice for the same matchday
        vm.prank(manager);
        vm.expectRevert(Errors.AlreadyExists.selector);
        game.commitLineup(1, rented, 0, 0, 1, 255);
        console.log("[6] gameplay: lineup committed w/ Free Hit; exclusivity enforced");
    }

    // 7) Contest entry
    function _contest() internal {
        contestId = contest.createContest(1, 10e6, 800, 0); // $10 entry, 8% rake, Common+
        vm.prank(manager); contest.enter(contestId);
        (, , , , uint256 pool, ) = contest.contests(contestId);
        assertEq(pool, 10e6);
        console.log("[7] contest: created + entered ($10, 8% rake)");
    }

    // 8) Oracle posts roots, rake taken, manager claims contest payout; rentals settle
    function _oracleSettleClaim() internal {
        vm.warp(lock1 + 1); // matchday locked

        bytes32 scoreRoot = keccak256("scores-md1");
        bytes32 dnpRoot = keccak256(abi.encodePacked(insuredId)); // single-leaf DNP set
        oracle.submitRoot(1, scoreRoot, dnpRoot);
        assertTrue(oracle.finalized(1));
        oracle.setSigner(signer2, true); // exercise signer management
        oracle.setThreshold(1);

        uint256 net = 10e6 - (10e6 * 800 / 10000); // 9.2 USDC net pool
        bytes32 payoutLeaf = keccak256(abi.encodePacked(manager, net));
        oracle.submitPayoutRoot(contestId, payoutLeaf);
        assertTrue(oracle.payoutFinalized(contestId));

        uint256 tBefore = usdc.balanceOf(treasury);
        contest.takeRake(contestId);
        assertEq(usdc.balanceOf(treasury) - tBefore, 8e5); // 0.8 rake

        uint256 mBefore = usdc.balanceOf(manager);
        bytes32[] memory empty = new bytes32[](0);
        vm.prank(manager); contest.claim(contestId, net, empty);
        assertEq(usdc.balanceOf(manager) - mBefore, net);

        // settle every rental -> collector (owner + original buyer) earns 90%
        uint256 cBefore = usdc.balanceOf(collector);
        for (uint256 i = 0; i < rented.length; i++) rental.settle(rented[i], 1);
        assertGt(usdc.balanceOf(collector), cBefore);
        console.log("[8] oracle+settle: roots posted, rake + payout + 11 rentals settled");
    }

    // 9) Insurance: prove DNP and claim refund + half premium
    function _insuranceClaim() internal {
        uint256 mBefore = usdc.balanceOf(manager);
        bytes32[] memory empty = new bytes32[](0);
        vm.prank(manager); insurance.claimDnp(1, insuredId, 1e6, empty);
        assertEq(usdc.balanceOf(manager) - mBefore, 11e5); // 1.0 rental + 0.1 half-premium
        console.log("[9] insurance: DNP proven, payout 1.1 USDC");
    }

    // 10) Alternate matchday flows: pre-lock cancel (90% refund) + postponement (100% refund)
    function _altMatchdays() internal {
        // matchday 2 — postponed
        game.configureMatchday(2, uint64(block.timestamp + 1 hours));
        uint256 x = card.mint(collector, pid(20), 0, 1);
        vm.prank(collector); rental.listForRent(x, 0, 2e6);
        vm.prank(manager); rental.rent(x, 2);
        game.cancel(2);
        assertTrue(game.isCancelled(2));
        uint256 mBefore = usdc.balanceOf(manager);
        rental.refundPostponed(x, 2);
        assertEq(usdc.balanceOf(manager) - mBefore, 2e6); // full refund
        assertEq(card.userOf(x), address(0));

        // matchday 3 — renter cancels pre-lock (90% back)
        game.configureMatchday(3, uint64(block.timestamp + 1 hours));
        uint256 y = card.mint(collector, pid(21), 0, 1);
        vm.prank(collector); rental.listForRent(y, 0, 10e6);
        vm.prank(manager); rental.rent(y, 3);
        uint256 m2 = usdc.balanceOf(manager);
        vm.prank(manager); rental.cancel(y, 3);
        assertEq(usdc.balanceOf(manager) - m2, 9e6); // 90% refund
        assertEq(card.userOf(y), address(0));

        // delist a fresh listing
        uint256 z = card.mint(collector, pid(22), 0, 1);
        vm.prank(collector); rental.listForRent(z, 0, 1e6);
        vm.prank(collector); rental.delist(z);
        (, , , bool active) = rental.listings(z);
        assertFalse(active);
        console.log("[10] alt matchdays: postpone refund, pre-lock cancel, delist");
    }

    // 11) Season-long payout via oracle season root
    function _season() internal {
        bytes32 leaf = keccak256(abi.encodePacked(manager, uint256(500e6)));
        oracle.submitSeasonRoot(leaf);
        assertTrue(oracle.seasonFinalized());
        uint256 mBefore = usdc.balanceOf(manager);
        bytes32[] memory empty = new bytes32[](0);
        vm.prank(manager); season.claim(500e6, empty);
        assertEq(usdc.balanceOf(manager) - mBefore, 500e6);
        console.log("[11] season: aggregate payout claimed (500 USDC)");
    }

    // 12) Remaining admin/v1.5 surface: chip drops w/ cap, insurance reserve + surplus, matchday status
    function _adminMisc() internal {
        chip.setMinter(admin, true);
        chip.setMintCap(0, 100);
        chip.mint(manager, 0, 1); // earned Triple Captain drop
        assertEq(chip.balanceOf(manager, 0), 2);
        vm.expectRevert(Errors.SupplyCapReached.selector);
        chip.mint(manager, 0, 100);

        mkt.setTreasury(treasury);
        contest.setTreasury(treasury);
        insurance.setTreasury(treasury);
        insurance.setReserveRatioBps(0);
        insurance.withdrawSurplus(100e6); // pool has seed + premiums - payout

        game.lock(1);
        game.settle(1);
        assertTrue(game.isSettled(1));
        console.log("[12] admin: chip cap + drop, insurance surplus, matchday status");
    }
}
