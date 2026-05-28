// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {ContestEscrow} from "../src/ContestEscrow.sol";
import {ScoreOracle} from "../src/ScoreOracle.sol";
import {MockUSDC} from "../src/mocks/MockUSDC.sol";
import {Errors} from "../src/libs/Errors.sol";

contract ContestEscrowTest is Test {
    ContestEscrow esc;
    ScoreOracle oracle;
    MockUSDC usdc;
    address treasury = address(0x7BEA);
    address alice = address(0xA11CE);
    address bob = address(0xB0B);

    function setUp() public {
        usdc = new MockUSDC();
        address[] memory signers = new address[](1);
        signers[0] = address(this); // test acts as the single oracle signer
        oracle = new ScoreOracle(signers, 1);
        esc = new ContestEscrow(address(usdc), address(oracle), treasury);
        vm.prank(alice); usdc.faucet(100e6);
        vm.prank(bob);   usdc.faucet(100e6);
        vm.prank(alice); usdc.approve(address(esc), type(uint256).max);
        vm.prank(bob);   usdc.approve(address(esc), type(uint256).max);
    }

    function test_enterEscrowsFee() public {
        uint256 id = esc.createContest(1, 10e6, 800, 0);
        vm.prank(alice); esc.enter(id);
        vm.prank(bob);   esc.enter(id);
        assertEq(usdc.balanceOf(address(esc)), 20e6);
    }

    function test_oneEntryPerWallet() public {
        uint256 id = esc.createContest(1, 10e6, 800, 0);
        vm.startPrank(alice);
        esc.enter(id);
        vm.expectRevert(Errors.AlreadyExists.selector);
        esc.enter(id);
        vm.stopPrank();
    }

    function test_claimWithOracleRootAfterRake() public {
        uint256 id = esc.createContest(1, 10e6, 800, 0);
        vm.prank(alice); esc.enter(id);
        vm.prank(bob);   esc.enter(id);
        bytes32 leaf = keccak256(abi.encodePacked(alice, uint256(184e5)));
        oracle.submitPayoutRoot(id, leaf);   // finalized (1-of-1)
        esc.takeRake(id);
        assertEq(usdc.balanceOf(treasury), 16e5); // rake 1.6
        bytes32[] memory proof = new bytes32[](0);
        vm.prank(alice);
        esc.claim(id, 184e5, proof);
        assertEq(usdc.balanceOf(alice), 90e6 + 184e5);
    }

    function test_claimRevertsBeforeRakeTaken() public {
        uint256 id = esc.createContest(1, 10e6, 800, 0);
        vm.prank(alice); esc.enter(id);
        bytes32 leaf = keccak256(abi.encodePacked(alice, uint256(92e5)));
        oracle.submitPayoutRoot(id, leaf);
        bytes32[] memory proof = new bytes32[](0);
        vm.prank(alice);
        vm.expectRevert(Errors.BadInput.selector); // rake not taken yet
        esc.claim(id, 92e5, proof);
    }

    function test_cannotClaimTwice() public {
        uint256 id = esc.createContest(1, 10e6, 800, 0);
        vm.prank(alice); esc.enter(id);
        bytes32 leaf = keccak256(abi.encodePacked(alice, uint256(92e5)));
        oracle.submitPayoutRoot(id, leaf);
        esc.takeRake(id);
        bytes32[] memory proof = new bytes32[](0);
        vm.startPrank(alice);
        esc.claim(id, 92e5, proof);
        vm.expectRevert(Errors.AlreadyClaimed.selector);
        esc.claim(id, 92e5, proof);
        vm.stopPrank();
    }
}
