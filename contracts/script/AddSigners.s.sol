// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script} from "forge-std/Script.sol";
import {ScoreOracle} from "../src/ScoreOracle.sol";

contract AddSigners is Script {
    function run() external {
        address oracleAddr = vm.envAddress("SCORE_ORACLE");
        address signer1 = vm.envAddress("SIGNER_1");
        address signer2 = vm.envAddress("SIGNER_2");
        address signer3 = vm.envAddress("SIGNER_3");
        address signer4 = vm.envAddress("SIGNER_4");
        uint256 newThreshold = vm.envUint("ORACLE_THRESHOLD");

        require(newThreshold > 0 && newThreshold <= 5, "bad threshold");

        vm.startBroadcast();
        ScoreOracle o = ScoreOracle(oracleAddr);
        o.setSigner(signer1, true);
        o.setSigner(signer2, true);
        o.setSigner(signer3, true);
        o.setSigner(signer4, true);
        o.setThreshold(newThreshold);
        vm.stopBroadcast();
    }
}
