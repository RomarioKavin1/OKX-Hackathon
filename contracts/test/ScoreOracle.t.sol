// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {ScoreOracle} from "../src/ScoreOracle.sol";
import {Errors} from "../src/libs/Errors.sol";

contract ScoreOracleTest is Test {
    ScoreOracle oracle;
    address s1 = address(0x51);
    address s2 = address(0x52);
    address s3 = address(0x53);
    bytes32 constant SR = keccak256("scoreRoot");
    bytes32 constant DR = keccak256("dnpRoot");

    function setUp() public {
        address[] memory signers = new address[](3);
        signers[0]=s1; signers[1]=s2; signers[2]=s3;
        oracle = new ScoreOracle(signers, 2);
    }

    function test_finalizesAtThreshold() public {
        vm.prank(s1); oracle.submitRoot(1, SR, DR);
        assertEq(oracle.roots(1), bytes32(0));
        vm.prank(s2); oracle.submitRoot(1, SR, DR);
        assertEq(oracle.roots(1), SR);
        assertEq(oracle.dnpRoots(1), DR);
    }

    function test_nonSignerReverts() public {
        vm.prank(address(0xBAD));
        vm.expectRevert(Errors.NotAuthorized.selector);
        oracle.submitRoot(1, SR, DR);
    }

    function test_signerCannotDoubleVote() public {
        vm.startPrank(s1);
        oracle.submitRoot(1, SR, DR);
        vm.expectRevert(Errors.AlreadyExists.selector);
        oracle.submitRoot(1, SR, DR);
        vm.stopPrank();
    }

    function test_zeroScoreRootFinalizesAndLocks() public {
        vm.prank(s1); oracle.submitRoot(1, bytes32(0), bytes32(0));
        vm.prank(s2); oracle.submitRoot(1, bytes32(0), bytes32(0));
        assertTrue(oracle.finalized(1));
        vm.prank(s3);
        vm.expectRevert(Errors.AlreadyExists.selector);
        oracle.submitRoot(1, keccak256("x"), bytes32(0));
    }
}
