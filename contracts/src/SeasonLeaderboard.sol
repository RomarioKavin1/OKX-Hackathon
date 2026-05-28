// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import {Errors} from "./libs/Errors.sol";

interface IScoreOracleSeason {
    function seasonRoot() external view returns (bytes32);
    function seasonFinalized() external view returns (bool);
}

/// @notice End-of-Cup aggregate payout. The season root is set by the ScoreOracle
/// multi-sig (same trust as matchday score roots), not a single owner — the season
/// prize is the largest single payout, so it gets the strongest trust model.
/// Funded by USDC transfers into this contract (2% rake accumulation pool). Leaf =
/// keccak256(abi.encodePacked(account, amount)).
contract SeasonLeaderboard is Ownable {
    IERC20 public immutable usdc;
    IScoreOracleSeason public immutable oracle;
    mapping(address => bool) public claimed;

    event Claimed(address indexed player, uint256 amount);

    constructor(address usdc_, address oracle_) Ownable(msg.sender) {
        usdc = IERC20(usdc_);
        oracle = IScoreOracleSeason(oracle_);
    }

    function claim(uint256 amount, bytes32[] calldata proof) external {
        if (!oracle.seasonFinalized()) revert Errors.ThresholdNotMet();
        if (claimed[msg.sender]) revert Errors.AlreadyClaimed();
        bytes32 leaf = keccak256(abi.encodePacked(msg.sender, amount));
        if (!MerkleProof.verify(proof, oracle.seasonRoot(), leaf)) revert Errors.InvalidProof();
        claimed[msg.sender] = true;
        require(usdc.transfer(msg.sender, amount), "pay");
        emit Claimed(msg.sender, amount);
    }
}
