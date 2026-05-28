// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ICardNFT} from "./interfaces/ICardNFT.sol";
import {IMatchdayClock} from "./interfaces/IMatchdayClock.sol";
import {Errors} from "./libs/Errors.sol";

interface CardNFTLike {
    function cards(uint256) external view returns (bytes32, uint8, uint32, uint32);
}

/// @notice Per-matchday ERC-4907 card leases with USDC escrow.
/// Documented lifecycle rules:
///  - D3: `delist` only removes FUTURE availability; rentals already taken for a matchday
///        persist until `settle` (after lock) or `refundPostponed` (if cancelled).
///  - D4: `settle` is callable only after `clock.lockTime(matchday)` and only if the
///        matchday is NOT cancelled (cancelled => use `refundPostponed`).
///  - D5: the renter's ERC-4907 `userExpires` = `lockTime(matchday) + MATCH_WINDOW` (6h),
///        covering match duration plus grace; the owner regains control after expiry.
///  - `rent` re-verifies current ownership (owner may have moved/listed the card elsewhere),
///        and `settle`/`cancel` pay the owner recorded at rent-time, not the live listing owner.
///  - Trust note (PRD FR-T1): `setFloorPrice` is owner-fed for FloorPegged mode in v1.
contract RentalMarket is Ownable {
    uint16 public constant OWNER_BPS = 8800;
    uint16 public constant PLATFORM_BPS = 1000;
    uint16 public constant ORIGINAL_BPS = 200;
    uint16 public constant CANCEL_REFUND_BPS = 9000;
    uint64 public constant MATCH_WINDOW = 6 hours;

    enum Mode { Fixed, FloorPegged, Suggested }
    struct Listing { address owner; Mode mode; uint256 priceValue; bool active; }
    struct Rental { address renter; address owner; uint256 paid; bool settled; }

    ICardNFT public immutable card;
    IERC20 public immutable usdc;
    IMatchdayClock public immutable clock;
    address public treasury;

    mapping(uint256 => Listing) public listings;
    mapping(uint256 => mapping(uint256 => Rental)) public rentals; // matchday => tokenId => rental
    mapping(bytes32 => mapping(uint8 => uint256)) public floorPrice;

    event ListedForRent(uint256 indexed tokenId, uint8 mode, uint256 priceValue);
    event Rented(uint256 indexed tokenId, uint256 indexed matchday, address renter, uint256 paid);
    event Settled(uint256 indexed tokenId, uint256 indexed matchday);
    event Cancelled(uint256 indexed tokenId, uint256 indexed matchday);
    event RefundedPostponed(uint256 indexed tokenId, uint256 indexed matchday);

    constructor(address card_, address usdc_, address clock_, address treasury_) Ownable(msg.sender) {
        card = ICardNFT(card_);
        usdc = IERC20(usdc_);
        clock = IMatchdayClock(clock_);
        treasury = treasury_;
    }

    function setTreasury(address t) external onlyOwner { treasury = t; }
    function setFloorPrice(bytes32 player, uint8 tier, uint256 price) external onlyOwner {
        floorPrice[player][tier] = price;
    }

    function listForRent(uint256 tokenId, uint8 mode, uint256 priceValue) external {
        if (card.ownerOf(tokenId) != msg.sender) revert Errors.NotAuthorized();
        listings[tokenId] = Listing(msg.sender, Mode(mode), priceValue, true);
        emit ListedForRent(tokenId, mode, priceValue);
    }

    function delist(uint256 tokenId) external {
        if (listings[tokenId].owner != msg.sender) revert Errors.NotAuthorized();
        listings[tokenId].active = false;
    }

    function _resolvePrice(uint256 tokenId, Listing memory l) internal view returns (uint256) {
        if (l.mode == Mode.FloorPegged) {
            return floorPrice[_player(tokenId)][card.tierOf(tokenId)] * l.priceValue / 10000;
        }
        return l.priceValue;
    }

    function _player(uint256 tokenId) internal view returns (bytes32) {
        (bytes32 pid,,,) = CardNFTLike(address(card)).cards(tokenId);
        return pid;
    }

    function rent(uint256 tokenId, uint256 matchday) external {
        Listing memory l = listings[tokenId];
        if (!l.active) revert Errors.NotFound();
        if (!clock.isOpen(matchday)) revert Errors.MatchdayNotOpen();
        if (rentals[matchday][tokenId].renter != address(0)) revert Errors.CardAlreadyUsed();
        if (card.ownerOf(tokenId) != l.owner) revert Errors.NotAuthorized();

        uint256 price = _resolvePrice(tokenId, l);
        require(usdc.transferFrom(msg.sender, address(this), price), "usdc");
        rentals[matchday][tokenId] = Rental(msg.sender, l.owner, price, false);

        uint64 expires = clock.lockTime(matchday) + MATCH_WINDOW;
        card.setRentalUser(tokenId, msg.sender, expires);
        emit Rented(tokenId, matchday, msg.sender, price);
    }

    function settle(uint256 tokenId, uint256 matchday) external {
        Rental storage r = rentals[matchday][tokenId];
        if (r.renter == address(0) || r.settled) revert Errors.NotFound();
        if (block.timestamp < clock.lockTime(matchday)) revert Errors.MatchdayNotOpen();
        if (clock.isCancelled(matchday)) revert Errors.BadInput();
        r.settled = true;

        address owner_ = r.owner;
        address orig = card.originalBuyer(tokenId);
        uint256 platform = r.paid * PLATFORM_BPS / 10000;
        uint256 royalty = r.paid * ORIGINAL_BPS / 10000;
        uint256 toOwner = r.paid - platform - royalty;

        require(usdc.transfer(treasury, platform), "u1");
        require(usdc.transfer(orig, royalty), "u2");
        require(usdc.transfer(owner_, toOwner), "u3");
        emit Settled(tokenId, matchday);
    }

    function cancel(uint256 tokenId, uint256 matchday) external {
        Rental storage r = rentals[matchday][tokenId];
        if (r.renter != msg.sender) revert Errors.NotAuthorized();
        if (r.settled) revert Errors.BadInput();
        if (block.timestamp >= clock.lockTime(matchday)) revert Errors.MatchdayLocked();
        r.settled = true;

        uint256 refund = r.paid * CANCEL_REFUND_BPS / 10000;
        uint256 toOwner = r.paid - refund;
        require(usdc.transfer(r.renter, refund), "u1");
        require(usdc.transfer(r.owner, toOwner), "u2");
        card.setRentalUser(tokenId, address(0), 0);
        emit Cancelled(tokenId, matchday);
    }

    function refundPostponed(uint256 tokenId, uint256 matchday) external {
        Rental storage r = rentals[matchday][tokenId];
        if (r.renter == address(0) || r.settled) revert Errors.NotFound();
        if (!clock.isCancelled(matchday)) revert Errors.BadInput();
        r.settled = true;
        require(usdc.transfer(r.renter, r.paid), "u1");
        card.setRentalUser(tokenId, address(0), 0);
        emit RefundedPostponed(tokenId, matchday);
    }
}
