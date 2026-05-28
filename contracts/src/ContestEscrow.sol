// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import {Errors} from "./libs/Errors.sol";

interface IScoreOraclePayout {
    function payoutRoots(uint256 contestId) external view returns (bytes32);
    function payoutFinalized(uint256 contestId) external view returns (bool);
}

/// @notice Contest entry escrow + Merkle payout.
/// Scoring model (off-chain, documented for clarity):
///  - D1: a wallet's single lineup committed in GameRegistry for `matchday` scores
///        against EVERY contest it entered for that matchday (one lineup, all contests).
///  - minTier gates eligibility: the off-chain payout tree EXCLUDES any entrant whose
///        lineup contains a card below `minTier` (ineligible lineups score 0; their entry
///        fee stays in the pool/rake). On-chain enforcement is intentionally deferred to
///        keep gas low, consistent with the off-chain scoring architecture.
///  - The payout root is set by the ScoreOracle multi-sig (NOT a single owner), so payouts
///        cannot diverge from agreed scores. The off-chain tree is built on the NET pool
///        (pool - rake); `takeRake` removes the rake before/independent of claims.
contract ContestEscrow is Ownable {
    struct Contest {
        uint256 matchday;
        uint256 entryFee;
        uint16 rakeBps;
        uint8 minTier;     // off-chain eligibility gate (0=Common .. 3=Unique)
        uint256 pool;
        bool rakeTaken;
    }

    IERC20 public immutable usdc;
    IScoreOraclePayout public immutable oracle;
    address public treasury;
    uint256 public nextContestId = 1;
    mapping(uint256 => Contest) public contests;
    mapping(uint256 => mapping(address => bool)) public entered;
    mapping(uint256 => mapping(address => bool)) public claimed;

    event ContestCreated(uint256 indexed id, uint256 matchday, uint256 entryFee, uint16 rakeBps, uint8 minTier);
    event Entered(uint256 indexed id, address indexed player);
    event RakeTaken(uint256 indexed id, uint256 rake);
    event Claimed(uint256 indexed id, address indexed player, uint256 amount);

    constructor(address usdc_, address oracle_, address treasury_) Ownable(msg.sender) {
        usdc = IERC20(usdc_);
        oracle = IScoreOraclePayout(oracle_);
        treasury = treasury_;
    }

    function setTreasury(address t) external onlyOwner { treasury = t; }

    function createContest(uint256 matchday, uint256 entryFee, uint16 rakeBps, uint8 minTier)
        external onlyOwner returns (uint256 id)
    {
        if (matchday == 0) revert Errors.BadInput();
        id = nextContestId++;
        contests[id] = Contest(matchday, entryFee, rakeBps, minTier, 0, false);
        emit ContestCreated(id, matchday, entryFee, rakeBps, minTier);
    }

    function enter(uint256 id) external {
        Contest storage c = contests[id];
        if (c.matchday == 0) revert Errors.NotFound();
        if (entered[id][msg.sender]) revert Errors.AlreadyExists();
        entered[id][msg.sender] = true;
        if (c.entryFee > 0) {
            require(usdc.transferFrom(msg.sender, address(this), c.entryFee), "usdc");
            c.pool += c.entryFee;
        }
        emit Entered(id, msg.sender);
    }

    /// @notice Permissionless: once the oracle has finalized the payout root, send rake to treasury (once).
    function takeRake(uint256 id) external {
        Contest storage c = contests[id];
        if (c.matchday == 0) revert Errors.NotFound();
        if (!oracle.payoutFinalized(id)) revert Errors.ThresholdNotMet();
        if (c.rakeTaken) revert Errors.AlreadyExists();
        c.rakeTaken = true;
        uint256 rake = c.pool * c.rakeBps / 10000;
        if (rake > 0) require(usdc.transfer(treasury, rake), "rake");
        emit RakeTaken(id, rake);
    }

    function claim(uint256 id, uint256 amount, bytes32[] calldata proof) external {
        Contest storage c = contests[id];
        if (c.matchday == 0) revert Errors.NotFound();
        if (!oracle.payoutFinalized(id)) revert Errors.ThresholdNotMet();
        if (!c.rakeTaken) revert Errors.BadInput(); // rake must be removed first (net-pool invariant)
        if (claimed[id][msg.sender]) revert Errors.AlreadyClaimed();
        bytes32 leaf = keccak256(abi.encodePacked(msg.sender, amount));
        if (!MerkleProof.verify(proof, oracle.payoutRoots(id), leaf)) revert Errors.InvalidProof();
        claimed[id][msg.sender] = true;
        require(usdc.transfer(msg.sender, amount), "pay");
        emit Claimed(id, msg.sender, amount);
    }
}
