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
    address seller = address(0x5E11E2);
    address buyer = address(0xB0B);
    bytes32 constant MESSI = keccak256("ARG-10-Messi");
    uint256 tokenId;

    function setUp() public {
        usdc = new MockUSDC();
        card = new CardNFT("ManagerCup Card", "MCUP");
        mkt = new Marketplace(address(card), address(usdc), treasury);
        card.setMinter(address(this), true);
        card.setPlayerStats(MESSI, 1, ICardNFT.Stats(85,92,95,40,65));
        tokenId = card.mint(seller, MESSI, 1, 1);

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
        assertEq(card.ownerOf(tokenId), buyer);
        assertEq(usdc.balanceOf(treasury), 4e6);
        assertEq(usdc.balanceOf(seller), 96e6); // 95 seller + 1 original buyer (== seller)
    }

    function test_cancelReturnsNft() public {
        vm.startPrank(seller);
        mkt.list(tokenId, 100e6);
        mkt.cancel(tokenId);
        vm.stopPrank();
        assertEq(card.ownerOf(tokenId), seller);
    }
}
