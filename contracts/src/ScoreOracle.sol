// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Errors} from "./libs/Errors.sol";

contract ScoreOracle is Ownable {
    mapping(address => bool) public isSigner;
    uint256 public threshold;

    // --- matchday score + DNP roots ---
    mapping(uint256 => bytes32) public roots;
    mapping(uint256 => bytes32) public dnpRoots;
    mapping(uint256 => bool) public finalized;
    mapping(uint256 => mapping(bytes32 => uint256)) public votes;
    mapping(uint256 => mapping(address => bool)) public voted;

    // --- contest payout roots (same multi-sig as score roots) ---
    mapping(uint256 => bytes32) public payoutRoots;
    mapping(uint256 => bool) public payoutFinalized;
    mapping(uint256 => mapping(bytes32 => uint256)) public payoutVotes;
    mapping(uint256 => mapping(address => bool)) public payoutVoted;

    // --- single season-aggregate root ---
    bytes32 public seasonRoot;
    bool public seasonFinalized;
    mapping(bytes32 => uint256) public seasonVotes;
    mapping(address => bool) public seasonVoted;

    event RootSubmitted(uint256 indexed matchday, address indexed signer);
    event RootFinalized(uint256 indexed matchday, bytes32 scoreRoot, bytes32 dnpRoot);
    event PayoutRootFinalized(uint256 indexed contestId, bytes32 root);
    event SeasonRootFinalized(bytes32 root);

    constructor(address[] memory signers, uint256 threshold_) Ownable(msg.sender) {
        for (uint256 i = 0; i < signers.length; i++) isSigner[signers[i]] = true;
        threshold = threshold_;
    }

    function setSigner(address s, bool ok) external onlyOwner { isSigner[s] = ok; }
    function setThreshold(uint256 t) external onlyOwner { threshold = t; }

    function submitRoot(uint256 matchday, bytes32 scoreRoot, bytes32 dnpRoot) external {
        if (!isSigner[msg.sender]) revert Errors.NotAuthorized();
        if (finalized[matchday]) revert Errors.AlreadyExists();
        if (voted[matchday][msg.sender]) revert Errors.AlreadyExists();
        voted[matchday][msg.sender] = true;

        bytes32 pair = keccak256(abi.encodePacked(scoreRoot, dnpRoot));
        uint256 v = ++votes[matchday][pair];
        emit RootSubmitted(matchday, msg.sender);

        if (v >= threshold) {
            finalized[matchday] = true;
            roots[matchday] = scoreRoot;
            dnpRoots[matchday] = dnpRoot;
            emit RootFinalized(matchday, scoreRoot, dnpRoot);
        }
    }

    // Contest payout roots routed through the same multi-sig as score roots so the
    // payout cannot diverge from the agreed scores (no single-owner trust point).
    function submitPayoutRoot(uint256 contestId, bytes32 root) external {
        if (!isSigner[msg.sender]) revert Errors.NotAuthorized();
        if (payoutFinalized[contestId]) revert Errors.AlreadyExists();
        if (payoutVoted[contestId][msg.sender]) revert Errors.AlreadyExists();
        payoutVoted[contestId][msg.sender] = true;

        uint256 v = ++payoutVotes[contestId][root];
        if (v >= threshold) {
            payoutFinalized[contestId] = true;
            payoutRoots[contestId] = root;
            emit PayoutRootFinalized(contestId, root);
        }
    }

    function submitSeasonRoot(bytes32 root) external {
        if (!isSigner[msg.sender]) revert Errors.NotAuthorized();
        if (seasonFinalized) revert Errors.AlreadyExists();
        if (seasonVoted[msg.sender]) revert Errors.AlreadyExists();
        seasonVoted[msg.sender] = true;

        uint256 v = ++seasonVotes[root];
        if (v >= threshold) {
            seasonFinalized = true;
            seasonRoot = root;
            emit SeasonRootFinalized(root);
        }
    }
}
