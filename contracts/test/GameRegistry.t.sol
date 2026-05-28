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
        assertEq(game.staminaOf(ids[0]), 70);
    }

    function test_exclusivityBlocksReuseSameMatchday() public {
        uint256[] memory ids = _mint11();
        vm.startPrank(alice);
        game.commitLineup(1, ids, 0, 0, 1, 255);
        vm.expectRevert(Errors.AlreadyExists.selector);
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
        uint8 freeHit = uint8(chip.FREE_HIT());
        vm.prank(alice);
        game.commitLineup(1, ids, 0, 0, 1, freeHit);
        assertEq(chip.balanceOf(alice, freeHit), 0);
        assertEq(game.staminaOf(ids[0]), 100);
    }

    function test_cannotCommitAfterLock() public {
        uint256[] memory ids = _mint11();
        vm.warp(block.timestamp + 2 hours);
        vm.prank(alice);
        vm.expectRevert(Errors.MatchdayNotOpen.selector);
        game.commitLineup(1, ids, 0, 0, 1, 255);
    }
}
