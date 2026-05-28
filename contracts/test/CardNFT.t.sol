// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {CardNFT} from "../src/CardNFT.sol";
import {ICardNFT} from "../src/interfaces/ICardNFT.sol";
import {Errors} from "../src/libs/Errors.sol";

contract CardNFTTest is Test {
    CardNFT card;
    address minter = address(0x1117E);
    address alice = address(0xA11CE);
    address bob = address(0xB0B);
    bytes32 constant MBAPPE = keccak256("FRA-10-Mbappe");

    function setUp() public {
        card = new CardNFT("ManagerCup Card", "MCUP");
        card.setMinter(minter, true);
        ICardNFT.Stats memory s = ICardNFT.Stats(97,89,80,36,77);
        card.setPlayerStats(MBAPPE, 3, s); // Unique
        card.setPlayerStats(MBAPPE, 1, s); // Rare
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
        assertEq(card.userOf(id), address(0));
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

    function test_airdropStarterSquad() public {
        bytes32[] memory pls = new bytes32[](3);
        pls[0]=keccak256("A"); pls[1]=keccak256("B"); pls[2]=keccak256("C");
        for (uint256 i=0;i<3;i++) card.setPlayerStats(pls[i], 0, ICardNFT.Stats(1,1,1,1,1));
        vm.prank(minter);
        uint256[] memory ids = card.airdropStarterSquad(alice, pls);
        assertEq(ids.length, 3);
        assertEq(card.balanceOf(alice), 3);
        assertEq(card.tierOf(ids[0]), 0);
    }
}
