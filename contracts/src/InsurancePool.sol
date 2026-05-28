// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import {Errors} from "./libs/Errors.sol";

interface IScoreOracleDnp { function dnpRoots(uint256) external view returns (bytes32); }

/// @notice DNP (did-not-play) insurance. Premium = 20% of rental cost; payout on a
/// proven DNP = 100% rental refund + 50% of premium back.
/// Solvency: the pool tracks `openExposure` (sum of max payouts across unsettled
/// policies) and refuses new policies it cannot fully collateralise plus a reserve
/// buffer. Pool must be seeded by the treasury. Exposure is released on claim or via
/// `releasePolicy` once a matchday resolves with no DNP for that card.
contract InsurancePool is Ownable {
    uint16 public constant PREMIUM_BPS = 2000;        // +20%
    uint16 public constant PREMIUM_RETURN_BPS = 5000; // 50% of premium back

    IERC20 public immutable usdc;
    IScoreOracleDnp public immutable oracle;
    address public treasury;
    uint16 public reserveRatioBps;   // extra buffer above full collateral (e.g. 2000 = +20%)
    uint256 public openExposure;     // sum of max payouts for unsettled policies

    struct Policy { address renter; uint256 rentalCost; uint256 premium; bool resolved; }
    mapping(uint256 => mapping(uint256 => Policy)) public policies; // matchday => tokenId => policy

    event Insured(uint256 indexed matchday, uint256 indexed tokenId, address renter, uint256 premium);
    event DnpClaimed(uint256 indexed matchday, uint256 indexed tokenId, uint256 payout);
    event PolicyReleased(uint256 indexed matchday, uint256 indexed tokenId);

    constructor(address usdc_, address oracle_, address treasury_) Ownable(msg.sender) {
        usdc = IERC20(usdc_);
        oracle = IScoreOracleDnp(oracle_);
        treasury = treasury_;
    }

    function setTreasury(address t) external onlyOwner { treasury = t; }
    function setReserveRatioBps(uint16 bps) external onlyOwner { reserveRatioBps = bps; }
    function withdrawSurplus(uint256 amount) external onlyOwner {
        // Only funds beyond what's needed to cover open exposure (+ buffer) may leave.
        uint256 required = openExposure + (openExposure * reserveRatioBps) / 10000;
        require(usdc.balanceOf(address(this)) - amount >= required, "would breach reserve");
        require(usdc.transfer(treasury, amount), "w");
    }

    function _maxPayout(uint256 rentalCost) internal pure returns (uint256) {
        uint256 premium = rentalCost * PREMIUM_BPS / 10000;
        return rentalCost + (premium * PREMIUM_RETURN_BPS / 10000);
    }

    function insure(uint256 matchday, uint256 tokenId, uint256 rentalCost) external {
        if (policies[matchday][tokenId].renter != address(0)) revert Errors.AlreadyExists();
        uint256 premium = rentalCost * PREMIUM_BPS / 10000;
        uint256 newExposure = _maxPayout(rentalCost);

        // Pool (including the premium being paid now) must fully cover all open exposure
        // plus this new policy, plus the reserve buffer.
        uint256 balanceAfter = usdc.balanceOf(address(this)) + premium;
        uint256 totalExposure = openExposure + newExposure;
        uint256 required = totalExposure + (totalExposure * reserveRatioBps) / 10000;
        if (balanceAfter < required) revert Errors.BadInput(); // insufficient capacity

        require(usdc.transferFrom(msg.sender, address(this), premium), "premium");
        openExposure = totalExposure;
        policies[matchday][tokenId] = Policy(msg.sender, rentalCost, premium, false);
        emit Insured(matchday, tokenId, msg.sender, premium);
    }

    function claimDnp(uint256 matchday, uint256 tokenId, uint256 rentalCost, bytes32[] calldata proof)
        external
    {
        Policy storage p = policies[matchday][tokenId];
        if (p.renter != msg.sender) revert Errors.NotAuthorized();
        if (p.resolved) revert Errors.AlreadyClaimed();
        if (p.rentalCost != rentalCost) revert Errors.BadInput();
        bytes32 root = oracle.dnpRoots(matchday);
        if (root == bytes32(0)) revert Errors.NotFound();
        bytes32 leaf = keccak256(abi.encodePacked(tokenId));
        if (!MerkleProof.verify(proof, root, leaf)) revert Errors.InvalidProof();

        p.resolved = true;
        uint256 payout = _maxPayout(p.rentalCost);
        openExposure -= payout;
        require(usdc.transfer(p.renter, payout), "pay");
        emit DnpClaimed(matchday, tokenId, payout);
    }

    /// @notice Release a policy's exposure once the matchday resolved with NO DNP for the
    /// card (player played). Permissionless cleanup; the premium stays in the pool as surplus.
    /// Caller proves the matchday's DNP root is finalized; the keeper only releases policies
    /// whose card is not in the DNP set (verified off-chain before calling).
    function releasePolicy(uint256 matchday, uint256 tokenId) external onlyOwner {
        Policy storage p = policies[matchday][tokenId];
        if (p.renter == address(0)) revert Errors.NotFound();
        if (p.resolved) revert Errors.AlreadyClaimed();
        p.resolved = true;
        openExposure -= _maxPayout(p.rentalCost);
        emit PolicyReleased(matchday, tokenId);
    }
}
