// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {MockUSDC} from "../src/mocks/MockUSDC.sol";
import {CardNFT} from "../src/CardNFT.sol";
import {ChipNFT} from "../src/ChipNFT.sol";
import {PackSale} from "../src/PackSale.sol";
import {Marketplace} from "../src/Marketplace.sol";
import {RentalMarket} from "../src/RentalMarket.sol";
import {GameRegistry} from "../src/GameRegistry.sol";
import {ScoreOracle} from "../src/ScoreOracle.sol";
import {ContestEscrow} from "../src/ContestEscrow.sol";
import {InsurancePool} from "../src/InsurancePool.sol";
import {SeasonLeaderboard} from "../src/SeasonLeaderboard.sol";

contract Deploy is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(pk);
        address treasury = deployer; // testnet: treasury = deployer

        vm.startBroadcast(pk);

        MockUSDC usdc = new MockUSDC();
        CardNFT card = new CardNFT("ManagerCup Card", "MCUP");
        ChipNFT chip = new ChipNFT("ipfs://managercup/chips/");
        PackSale pack = new PackSale(address(card), address(usdc), treasury);
        Marketplace mkt = new Marketplace(address(card), address(usdc), treasury);
        GameRegistry game = new GameRegistry(address(card), address(chip));
        RentalMarket rental = new RentalMarket(address(card), address(usdc), address(game), treasury);

        address[] memory signers = new address[](1);
        signers[0] = deployer; // testnet: 1-of-1; rotate to 3-of-5 for mainnet
        ScoreOracle oracle = new ScoreOracle(signers, 1);
        ContestEscrow contest = new ContestEscrow(address(usdc), address(oracle), treasury);
        InsurancePool insurance = new InsurancePool(address(usdc), address(oracle), treasury);
        SeasonLeaderboard season = new SeasonLeaderboard(address(usdc), address(oracle));

        // wiring
        card.setMinter(address(pack), true);
        card.setMinter(deployer, true);
        card.setRentalMarket(address(rental));
        chip.setBurner(address(game), true);

        vm.stopBroadcast();

        console.log("USDC           ", address(usdc));
        console.log("CardNFT        ", address(card));
        console.log("ChipNFT        ", address(chip));
        console.log("PackSale       ", address(pack));
        console.log("Marketplace    ", address(mkt));
        console.log("GameRegistry   ", address(game));
        console.log("RentalMarket   ", address(rental));
        console.log("ScoreOracle    ", address(oracle));
        console.log("ContestEscrow  ", address(contest));
        console.log("InsurancePool  ", address(insurance));
        console.log("SeasonLeaderbd ", address(season));
    }
}
