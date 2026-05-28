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
    address owner_ = address(0x0E1E2);
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
        vm.prank(owner_); rent.listForRent(tokenId, 0, 12e6);
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
        assertEq(usdc.balanceOf(treasury), 120e4);  // 1.20
        // owner gets 10.56 + 0.24 originalBuyer (== owner) = 10.80
        assertEq(usdc.balanceOf(owner_), 1080e4);
    }

    function test_cancelPreLockRefunds90() public {
        vm.prank(renter); rent.rent(tokenId, 1);
        vm.prank(renter); rent.cancel(tokenId, 1);
        assertEq(usdc.balanceOf(renter), 1000e6 - 12e5); // lost 1.2
        assertEq(usdc.balanceOf(owner_), 12e5);
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

    function test_settlePaysOriginalOwnerAfterCardChangesHands() public {
        vm.prank(renter); rent.rent(tokenId, 1);
        // warp past rental expiry (lock + MATCH_WINDOW) so transfer is allowed
        vm.warp(lockT + rent.MATCH_WINDOW() + 1);
        address newOwner = address(0xBEEF);
        vm.prank(owner_); card.transferFrom(owner_, newOwner, tokenId);
        vm.prank(newOwner); rent.listForRent(tokenId, 0, 99e6); // overwrites listings[tokenId].owner
        rent.settle(tokenId, 1);
        // original owner gets 10.56 + 0.24 (originalBuyer == owner_) = 10.80; new owner gets nothing
        assertEq(usdc.balanceOf(owner_), 1080e4);
        assertEq(usdc.balanceOf(newOwner), 0);
    }
}
