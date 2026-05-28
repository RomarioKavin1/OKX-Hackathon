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
    address ownerA = address(0x0A);
    address manager = address(0x6A);
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
        contest = new ContestEscrow(address(usdc), address(oracle), treasury);

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
        uint256[] memory ids = new uint256[](11);
        for (uint256 i=0;i<11;i++){
            ids[i] = card.mint(ownerA, P, 0, 1);
            vm.prank(ownerA); rental.listForRent(ids[i], 0, 1e6);
        }
        for (uint256 i=0;i<11;i++){ vm.prank(manager); rental.rent(ids[i], 1); }
        for (uint256 i=0;i<11;i++) assertEq(card.userOf(ids[i]), manager);

        uint256 cid = contest.createContest(1, 10e6, 800, 0);
        vm.prank(manager); contest.enter(cid);
        vm.prank(manager); game.commitLineup(1, ids, 0, 0, 1, 255);
        assertTrue(game.hasLineup(1, manager));

        vm.warp(lockT + 1);
        bytes32 leaf = keccak256(abi.encodePacked(manager, uint256(92e5)));
        vm.prank(s1); oracle.submitRoot(1, leaf, bytes32(0));
        vm.prank(s2); oracle.submitRoot(1, leaf, bytes32(0));
        // payout root via the same multi-sig, then take rake, then claim
        vm.prank(s1); oracle.submitPayoutRoot(cid, leaf);
        vm.prank(s2); oracle.submitPayoutRoot(cid, leaf);
        contest.takeRake(cid);
        bytes32[] memory proof = new bytes32[](0);
        vm.prank(manager); contest.claim(cid, 92e5, proof);

        for (uint256 i=0;i<11;i++) rental.settle(ids[i], 1);
        assertGt(usdc.balanceOf(ownerA), 0);
    }
}
