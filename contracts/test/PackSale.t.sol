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

        bytes32[] memory pool = new bytes32[](3);
        pool[0] = keccak256("FRA-10-Mbappe");
        pool[1] = keccak256("ARG-10-Messi");
        pool[2] = keccak256("BRA-10-Neymar");
        ICardNFT.Stats memory s = ICardNFT.Stats(90,90,90,50,80);
        for (uint256 i = 0; i < pool.length; i++)
            for (uint8 t = 0; t < 4; t++) card.setPlayerStats(pool[i], t, s);
        pack.setPlayerPool(pool);
        pack.setPackPrice(0, 5e6);

        vm.prank(alice);
        usdc.faucet(100e6);
        vm.prank(alice);
        usdc.approve(address(pack), type(uint256).max);
    }

    function test_buyEscrowsUsdcAndStoresCommit() public {
        vm.prank(alice);
        uint256 commitId = pack.buy(0);
        assertEq(usdc.balanceOf(address(pack)), 5e6);
        (address buyer,, uint8 pt, bool opened,) = pack.commits(commitId);
        assertEq(buyer, alice);
        assertEq(pt, 0);
        assertFalse(opened);
    }

    function test_revealMintsFiveCards() public {
        vm.prank(alice);
        uint256 commitId = pack.buy(0);
        vm.roll(block.number + 18);
        vm.prank(alice);
        pack.reveal(commitId);
        assertEq(card.balanceOf(alice), 5);
        (,,, bool opened,) = pack.commits(commitId);
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
        vm.roll(block.number + 18);
        vm.startPrank(alice);
        pack.reveal(commitId);
        vm.expectRevert();
        pack.reveal(commitId);
        vm.stopPrank();
    }

    function test_staleBlockhashRefundsBuyer() public {
        vm.prank(alice);
        uint256 commitId = pack.buy(0); // paid 5e6, balance 95e6
        vm.roll(block.number + 300);    // target block > 256 behind => blockhash 0
        vm.prank(alice);
        pack.reveal(commitId);
        assertEq(usdc.balanceOf(alice), 100e6); // fully refunded
        assertEq(card.balanceOf(alice), 0);
        (,,, bool opened,) = pack.commits(commitId);
        assertTrue(opened);
    }

    function test_emptyPoolRevertsAndDoesNotConsumeCommit() public {
        PackSale p2 = new PackSale(address(card), address(usdc), treasury);
        card.setMinter(address(p2), true);
        p2.setPackPrice(0, 5e6);
        vm.prank(alice); usdc.approve(address(p2), type(uint256).max);
        vm.prank(alice); uint256 cid = p2.buy(0);
        vm.roll(block.number + 18);
        vm.prank(alice);
        vm.expectRevert(); // playerPool empty
        p2.reveal(cid);
        (,,, bool opened,) = p2.commits(cid);
        assertFalse(opened); // retryable once pool configured
    }
}
