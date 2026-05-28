// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC4907} from "./interfaces/IERC4907.sol";
import {ICardNFT} from "./interfaces/ICardNFT.sol";
import {Errors} from "./libs/Errors.sol";

contract CardNFT is ERC721, Ownable, IERC4907 {
    struct Card {
        bytes32 playerId;
        uint8 tier; // 0=Common,1=Rare,2=SR,3=Unique
        uint32 serialNumber;
        uint32 mintBatch;
    }
    struct UserInfo { address user; uint64 expires; }

    uint32[4] public tierSupplyCap = [type(uint32).max, 1000, 100, 1];

    uint256 private _nextId = 1;
    mapping(uint256 => Card) public cards;
    mapping(uint256 => ICardNFT.Stats) public statsOf;
    mapping(uint256 => address) public originalBuyer;
    mapping(uint256 => UserInfo) private _users;
    mapping(bytes32 => mapping(uint8 => uint32)) public mintedCount;
    mapping(bytes32 => mapping(uint8 => ICardNFT.Stats)) public tierStats;
    mapping(bytes32 => mapping(uint8 => bool)) public statsSet;
    mapping(address => bool) public isMinter;

    address public rentalMarket;

    constructor(string memory name_, string memory symbol_)
        ERC721(name_, symbol_) Ownable(msg.sender) {}

    // --- admin ---
    function setMinter(address m, bool ok) external onlyOwner { isMinter[m] = ok; }
    function setRentalMarket(address rm) external onlyOwner { rentalMarket = rm; }
    function setPlayerStats(bytes32 playerId, uint8 tier, ICardNFT.Stats calldata s) external onlyOwner {
        if (tier > 3) revert Errors.BadInput();
        tierStats[playerId][tier] = s;
        statsSet[playerId][tier] = true;
    }

    // --- mint ---
    function mint(address to, bytes32 playerId, uint8 tier, uint32 mintBatch)
        external returns (uint256 tokenId)
    {
        if (!isMinter[msg.sender]) revert Errors.NotAuthorized();
        return _mintCard(to, playerId, tier, mintBatch);
    }

    // --- starter squad airdrop (D2): explicit batch-mint of Common cards to a new wallet ---
    function airdropStarterSquad(address to, bytes32[] calldata playerIds) external returns (uint256[] memory ids) {
        if (!isMinter[msg.sender]) revert Errors.NotAuthorized();
        ids = new uint256[](playerIds.length);
        for (uint256 i = 0; i < playerIds.length; i++) {
            ids[i] = _mintCard(to, playerIds[i], 0, 0); // tier 0 (Common), batch 0
        }
    }

    function _mintCard(address to, bytes32 playerId, uint8 tier, uint32 mintBatch)
        internal returns (uint256 tokenId)
    {
        if (tier > 3) revert Errors.BadInput();
        if (!statsSet[playerId][tier]) revert Errors.StatsNotSet();
        uint32 minted = mintedCount[playerId][tier];
        if (minted >= tierSupplyCap[tier]) revert Errors.SupplyCapReached();

        tokenId = _nextId++;
        uint32 serial = minted + 1;
        mintedCount[playerId][tier] = serial;
        cards[tokenId] = Card(playerId, tier, serial, mintBatch);
        statsOf[tokenId] = tierStats[playerId][tier];
        originalBuyer[tokenId] = to;
        _safeMint(to, tokenId);
    }

    // --- views used by other contracts ---
    function tierOf(uint256 id) external view returns (uint8) { return cards[id].tier; }
    function serialOf(uint256 id) external view returns (uint32) { return cards[id].serialNumber; }

    // --- ERC-4907 ---
    function setUser(uint256 tokenId, address user, uint64 expires) public {
        address o = ownerOf(tokenId);
        if (msg.sender != o && !isApprovedForAll(o, msg.sender) && getApproved(tokenId) != msg.sender)
            revert Errors.NotAuthorized();
        _users[tokenId] = UserInfo(user, expires);
        emit UpdateUser(tokenId, user, expires);
    }

    function setRentalUser(uint256 tokenId, address user, uint64 expires) external {
        if (msg.sender != rentalMarket) revert Errors.NotAuthorized();
        _users[tokenId] = UserInfo(user, expires);
        emit UpdateUser(tokenId, user, expires);
    }

    function userOf(uint256 tokenId) public view returns (address) {
        UserInfo memory u = _users[tokenId];
        return u.expires >= block.timestamp ? u.user : address(0);
    }
    function userExpires(uint256 tokenId) external view returns (uint256) {
        return _users[tokenId].expires;
    }

    // --- transfer guard: block while actively rented (spec §3.7) ---
    function _update(address to, uint256 tokenId, address auth)
        internal override returns (address)
    {
        address from = _ownerOf(tokenId);
        if (from != address(0)) {
            UserInfo memory u = _users[tokenId];
            if (u.user != address(0) && u.expires >= block.timestamp)
                revert Errors.TransferWhileRented();
        }
        return super._update(to, tokenId, auth);
    }

    function supportsInterface(bytes4 id) public view override returns (bool) {
        return id == type(IERC4907).interfaceId || super.supportsInterface(id);
    }
}
