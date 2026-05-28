// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ICardNFT} from "./interfaces/ICardNFT.sol";
import {IChipNFT} from "./interfaces/IChipNFT.sol";
import {IMatchdayClock} from "./interfaces/IMatchdayClock.sol";
import {Errors} from "./libs/Errors.sol";

/// @notice Matchday clock + lineup commitment, stamina, chip burn, per-matchday card exclusivity.
/// Documented rules:
///  - Controller rule: a card with an active ERC-4907 user can ONLY be committed by that
///    renter; the owner is locked out for the rental duration (no self-grief). Cards with no
///    active user are committed by their owner.
///  - Wildcard semantics: this impl resets stamina to MAX for the 11 cards in TODAY's lineup
///    at commit time (a deliberate per-lineup scoping vs the spec's "all your cards" wording).
///  - One lineup per (matchday, wallet) applies to ALL contests entered for that matchday
///    (one lineup, all contests — FPL-style).
contract GameRegistry is Ownable, IMatchdayClock {
    enum Status { None, Open, Locked, Cancelled, Settled }
    uint8 public constant NO_CHIP = 255;
    uint8 public constant STAMINA_MAX = 100;
    uint8 public constant STAMINA_COST = 30;
    uint8 public constant STAMINA_REGEN = 50;
    uint256 public constant WILDCARD = 2;
    uint256 public constant FREE_HIT = 3;

    struct Matchday { uint64 lock; Status status; }
    struct Lineup {
        uint256[] tokenIds;
        uint8 formation;
        uint8 captainIdx;
        uint8 viceIdx;
        uint8 chipId;
        bool exists;
    }

    ICardNFT public immutable card;
    IChipNFT public immutable chip;

    mapping(uint256 => Matchday) public matchdays;
    mapping(uint256 => mapping(address => Lineup)) internal _lineups;
    mapping(uint256 => mapping(uint256 => bool)) public cardUsedInMatchday;
    mapping(uint256 => uint8) public staminaOf;
    mapping(uint256 => uint256) public lastUsedMatchday;
    mapping(uint256 => bool) private _staminaInit;

    event MatchdayConfigured(uint256 indexed matchday, uint64 lock);
    event LineupCommitted(uint256 indexed matchday, address indexed wallet, uint8 chipId);

    constructor(address card_, address chip_) Ownable(msg.sender) {
        card = ICardNFT(card_);
        chip = IChipNFT(chip_);
    }

    // --- matchday admin / clock ---
    function configureMatchday(uint256 m, uint64 lock_) external onlyOwner {
        matchdays[m] = Matchday(lock_, Status.Open);
        emit MatchdayConfigured(m, lock_);
    }
    function lock(uint256 m) external onlyOwner { matchdays[m].status = Status.Locked; }
    function cancel(uint256 m) external onlyOwner { matchdays[m].status = Status.Cancelled; }
    function settle(uint256 m) external onlyOwner { matchdays[m].status = Status.Settled; }

    function lockTime(uint256 m) external view returns (uint64) { return matchdays[m].lock; }
    function isOpen(uint256 m) public view returns (bool) {
        Matchday memory md = matchdays[m];
        return md.status == Status.Open && block.timestamp < md.lock;
    }
    function isCancelled(uint256 m) external view returns (bool) { return matchdays[m].status == Status.Cancelled; }
    function isSettled(uint256 m) external view returns (bool) { return matchdays[m].status == Status.Settled; }

    function hasLineup(uint256 m, address w) external view returns (bool) { return _lineups[m][w].exists; }
    function getLineup(uint256 m, address w) external view returns (Lineup memory) { return _lineups[m][w]; }

    // --- lineup commit ---
    function commitLineup(
        uint256 m,
        uint256[] calldata tokenIds,
        uint8 formation,
        uint8 captainIdx,
        uint8 viceIdx,
        uint8 chipId
    ) external {
        if (!isOpen(m)) revert Errors.MatchdayNotOpen();
        if (tokenIds.length != 11) revert Errors.BadInput();
        if (captainIdx >= 11 || viceIdx >= 11) revert Errors.BadInput();
        if (_lineups[m][msg.sender].exists) revert Errors.AlreadyExists();

        bool wildcard = chipId == uint8(WILDCARD);
        bool freeHit = chipId == uint8(FREE_HIT);

        for (uint256 i = 0; i < 11; i++) {
            uint256 id = tokenIds[i];
            address controller = card.userOf(id);
            if (controller == address(0)) controller = card.ownerOf(id);
            if (controller != msg.sender) revert Errors.NotController();
            if (cardUsedInMatchday[m][id]) revert Errors.CardAlreadyUsed();
            cardUsedInMatchday[m][id] = true;
            _applyStamina(id, m, wildcard, freeHit);
        }

        if (chipId != NO_CHIP) {
            chip.burnFrom(msg.sender, chipId, 1);
        }

        _lineups[m][msg.sender] =
            Lineup(tokenIds, formation, captainIdx, viceIdx, chipId, true);
        emit LineupCommitted(m, msg.sender, chipId);
    }

    function _applyStamina(uint256 id, uint256 m, bool wildcard, bool freeHit) internal {
        uint256 s;
        if (!_staminaInit[id]) { s = STAMINA_MAX; _staminaInit[id] = true; }
        else {
            s = staminaOf[id];
            uint256 last = lastUsedMatchday[id];
            if (m > last + 1) {
                uint256 idle = m - last - 1;
                s += idle * STAMINA_REGEN;
                if (s > STAMINA_MAX) s = STAMINA_MAX;
            }
        }
        if (wildcard) s = STAMINA_MAX;
        if (!freeHit) { s = s > STAMINA_COST ? s - STAMINA_COST : 0; }
        staminaOf[id] = uint8(s);
        lastUsedMatchday[id] = m;
    }
}
