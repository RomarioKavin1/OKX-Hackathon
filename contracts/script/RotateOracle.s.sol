// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script} from "forge-std/Script.sol";
import {ScoreOracle} from "../src/ScoreOracle.sol";

contract RotateOracle is Script {
    function run() external {
        ScoreOracle oracle = ScoreOracle(vm.envAddress("SCORE_ORACLE"));
        address[] memory toRemove = vm.envAddress("REMOVE_SIGNERS", ",");
        address[] memory toAdd = vm.envAddress("ADD_SIGNERS", ",");
        uint256 newThreshold = vm.envUint("ORACLE_THRESHOLD");

        vm.startBroadcast();
        for (uint256 i = 0; i < toRemove.length; i++) oracle.setSigner(toRemove[i], false);
        for (uint256 i = 0; i < toAdd.length; i++) oracle.setSigner(toAdd[i], true);
        oracle.setThreshold(newThreshold);
        vm.stopBroadcast();
    }
}
