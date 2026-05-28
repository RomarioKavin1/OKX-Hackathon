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

    function test_mintCapEnforced() public {
        chip.setMinter(address(this), true);
        chip.setMintCap(0, 2);
        chip.mint(alice, 0, 2);
        assertEq(chip.balanceOf(alice, 0), 2);
        vm.expectRevert(Errors.SupplyCapReached.selector);
        chip.mint(alice, 0, 1);
    }
}
