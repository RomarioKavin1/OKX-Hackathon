// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {InsurancePool} from "../src/InsurancePool.sol";
import {ScoreOracle} from "../src/ScoreOracle.sol";
import {MockUSDC} from "../src/mocks/MockUSDC.sol";
import {Errors} from "../src/libs/Errors.sol";

contract InsurancePoolTest is Test {
    InsurancePool ins;
    ScoreOracle oracle;
    MockUSDC usdc;
    address treasury = address(0x7BEA);
    address renter = address(0x5E37E2);
    address s1 = address(0x51);
    address s2 = address(0x52);
    uint256 constant TOKEN = 7;

    function setUp() public {
        usdc = new MockUSDC();
        address[] memory signers = new address[](2);
        signers[0]=s1; signers[1]=s2;
        oracle = new ScoreOracle(signers, 2);
        ins = new InsurancePool(address(usdc), address(oracle), treasury);

        usdc.faucet(1_000e6); usdc.transfer(address(ins), 1_000e6);
        vm.prank(renter); usdc.faucet(100e6);
        vm.prank(renter); usdc.approve(address(ins), type(uint256).max);
    }

    function test_insureCollectsPremium() public {
        vm.prank(renter);
        ins.insure(1, TOKEN, 10e6);
        assertEq(usdc.balanceOf(renter), 98e6);
    }

    function test_claimDnpRefundsRentalPlusHalfPremium() public {
        vm.prank(renter);
        ins.insure(1, TOKEN, 10e6);
        bytes32 leaf = keccak256(abi.encodePacked(TOKEN));
        vm.prank(s1); oracle.submitRoot(1, keccak256("score"), leaf);
        vm.prank(s2); oracle.submitRoot(1, keccak256("score"), leaf);

        bytes32[] memory proof = new bytes32[](0);
        vm.prank(renter);
        ins.claimDnp(1, TOKEN, 10e6, proof);
        assertEq(usdc.balanceOf(renter), 109e6);
    }

    function test_insureRevertsWhenPoolCannotCover() public {
        InsurancePool ins2 = new InsurancePool(address(usdc), address(oracle), treasury); // unseeded
        vm.prank(renter); usdc.approve(address(ins2), type(uint256).max);
        vm.prank(renter);
        vm.expectRevert(Errors.BadInput.selector); // premium 2 < required exposure 11
        ins2.insure(1, TOKEN, 10e6);
    }
}
