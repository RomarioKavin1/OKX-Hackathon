// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ICardNFT} from "./interfaces/ICardNFT.sol";
import {Errors} from "./libs/Errors.sol";

contract PackSale is Ownable {
    // Commit-reveal delay in blocks. 16 blocks (well inside the 256-block blockhash
    // window) makes sequencer manipulation of the reveal blockhash impractical vs a
    // 1-block delay, at no extra cost. VRF is the v1.5 upgrade path.
    uint8 public constant DELAY = 16;
    uint8 public constant CARDS_PER_PACK = 5;

    struct Commit { address buyer; uint64 targetBlock; uint8 packType; bool opened; uint256 pricePaid; }

    ICardNFT public immutable card;
    IERC20 public immutable usdc;
    address public treasury;

    uint256 public nextCommitId = 1;
    mapping(uint256 => Commit) public commits;
    mapping(uint8 => uint256) public packPrice;
    mapping(uint8 => uint16[4]) public tierCum;
    bytes32[] public playerPool;
    uint32 public mintBatch = 1;

    event PackBought(uint256 indexed commitId, address indexed buyer, uint8 packType);
    event PackRevealed(uint256 indexed commitId, uint256[] tokenIds);

    constructor(address card_, address usdc_, address treasury_) Ownable(msg.sender) {
        card = ICardNFT(card_);
        usdc = IERC20(usdc_);
        treasury = treasury_;
        tierCum[0] = [uint16(9000), 9950, 9999, 10000]; // Bronze
        tierCum[1] = [uint16(8000), 9700, 9980, 10000]; // Silver
        tierCum[2] = [uint16(6500), 9300, 9950, 10000]; // Gold
    }

    function setTreasury(address t) external onlyOwner { treasury = t; }
    function setPackPrice(uint8 packType, uint256 price) external onlyOwner { packPrice[packType] = price; }
    function setTierCum(uint8 packType, uint16[4] calldata cum) external onlyOwner { tierCum[packType] = cum; }
    function setMintBatch(uint32 b) external onlyOwner { mintBatch = b; }
    function setPlayerPool(bytes32[] calldata pool) external onlyOwner { playerPool = pool; }
    function withdraw(uint256 amount) external onlyOwner { usdc.transfer(treasury, amount); }

    function buy(uint8 packType) external returns (uint256 commitId) {
        uint256 price = packPrice[packType];
        if (price == 0) revert Errors.BadInput();
        require(usdc.transferFrom(msg.sender, address(this), price), "usdc");
        commitId = nextCommitId++;
        commits[commitId] = Commit(msg.sender, uint64(block.number + DELAY), packType, false, price);
        emit PackBought(commitId, msg.sender, packType);
    }

    function reveal(uint256 commitId) external {
        Commit storage c = commits[commitId];
        if (c.buyer == address(0)) revert Errors.NotFound();
        if (c.opened) revert Errors.AlreadyExists();
        if (block.number <= c.targetBlock) revert Errors.BadInput();
        bytes32 bh = blockhash(c.targetBlock);
        if (bh == bytes32(0)) {
            // target block too old (>256) — randomness unrecoverable; refund buyer instead of locking funds
            c.opened = true;
            require(usdc.transfer(c.buyer, c.pricePaid), "refund");
            return;
        }
        if (playerPool.length == 0) revert Errors.BadInput(); // not configured; allow retry once set
        c.opened = true;

        uint256 seed = uint256(keccak256(abi.encodePacked(bh, c.buyer, commitId)));
        uint256 poolLen = playerPool.length;
        uint16[4] memory cum = tierCum[c.packType];
        uint256[] memory ids = new uint256[](CARDS_PER_PACK);

        for (uint256 i = 0; i < CARDS_PER_PACK; i++) {
            uint256 word = uint256(keccak256(abi.encodePacked(seed, i)));
            uint16 roll = uint16(word % 10000);
            uint8 tier = 0;
            if (roll >= cum[2]) tier = 3;
            else if (roll >= cum[1]) tier = 2;
            else if (roll >= cum[0]) tier = 1;
            bytes32 playerId = playerPool[(word >> 16) % poolLen];
            ids[i] = _mintWithDowngrade(c.buyer, playerId, tier);
        }
        emit PackRevealed(commitId, ids);
    }

    function _mintWithDowngrade(address to, bytes32 playerId, uint8 tier) internal returns (uint256) {
        while (true) {
            try card.mint(to, playerId, tier, mintBatch) returns (uint256 id) {
                return id;
            } catch {
                if (tier == 0) revert Errors.SupplyCapReached();
                tier -= 1;
            }
        }
        return 0; // unreachable
    }
}
