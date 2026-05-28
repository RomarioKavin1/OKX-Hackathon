// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {SeasonLeaderboard} from "../src/SeasonLeaderboard.sol";
import {ScoreOracle} from "../src/ScoreOracle.sol";
import {MockUSDC} from "../src/mocks/MockUSDC.sol";
import {Errors} from "../src/libs/Errors.sol";

contract SeasonLeaderboardTest is Test {
    SeasonLeaderboard season;
    ScoreOracle oracle;
    MockUSDC usdc;
    address alice = address(0xA11CE);

    function setUp() public {
        usdc = new MockUSDC();
        address[] memory signers = new address[](1);
        signers[0] = address(this);
        oracle = new ScoreOracle(signers, 1);
        season = new SeasonLeaderboard(address(usdc), address(oracle));
        usdc.faucet(1_000e6); usdc.transfer(address(season), 1_000e6);
    }

    function test_claimWithOracleSeasonRoot() public {
        bytes32 leaf = keccak256(abi.encodePacked(alice, uint256(500e6)));
        oracle.submitSeasonRoot(leaf); // finalized (1-of-1)
        bytes32[] memory proof = new bytes32[](0);
        vm.prank(alice);
        season.claim(500e6, proof);
        assertEq(usdc.balanceOf(alice), 500e6);
    }

    function test_claimRevertsBeforeFinalized() public {
        bytes32[] memory proof = new bytes32[](0);
        vm.prank(alice);
        vm.expectRevert(Errors.ThresholdNotMet.selector);
        season.claim(500e6, proof);
    }
}
