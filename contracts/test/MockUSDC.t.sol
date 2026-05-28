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
