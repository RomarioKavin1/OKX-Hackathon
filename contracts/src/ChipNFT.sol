// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC1155} from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Errors} from "./libs/Errors.sol";

contract ChipNFT is ERC1155, Ownable {
    uint256 public constant TRIPLE_CAPTAIN = 0;
    uint256 public constant DOUBLER = 1;
    uint256 public constant WILDCARD = 2;
    uint256 public constant FREE_HIT = 3;

    mapping(address => bool) public claimedBaseline;
    mapping(address => bool) public isBurner;
    mapping(address => bool) public isMinter;
    mapping(uint256 => uint256) public mintCap;   // per-chipId cap for earned drops; 0 = unlimited
    mapping(uint256 => uint256) public mintedViaDrops;

    constructor(string memory uri_) ERC1155(uri_) Ownable(msg.sender) {}

    function setBurner(address b, bool ok) external onlyOwner { isBurner[b] = ok; }
    function setMinter(address m, bool ok) external onlyOwner { isMinter[m] = ok; }
    function setMintCap(uint256 id, uint256 cap) external onlyOwner { mintCap[id] = cap; }

    function claimBaseline() external {
        if (claimedBaseline[msg.sender]) revert Errors.AlreadyExists();
        claimedBaseline[msg.sender] = true;
        uint256[] memory ids = new uint256[](4);
        uint256[] memory amts = new uint256[](4);
        for (uint256 i = 0; i < 4; i++) { ids[i] = i; amts[i] = 1; }
        _mintBatch(msg.sender, ids, amts, "");
    }

    function mint(address to, uint256 id, uint256 amount) external {
        if (!isMinter[msg.sender]) revert Errors.NotAuthorized();
        uint256 cap = mintCap[id];
        if (cap != 0) {
            uint256 newTotal = mintedViaDrops[id] + amount;
            if (newTotal > cap) revert Errors.SupplyCapReached();
            mintedViaDrops[id] = newTotal;
        }
        _mint(to, id, amount, "");
    }

    function burnFrom(address account, uint256 id, uint256 amount) external {
        if (!isBurner[msg.sender]) revert Errors.NotAuthorized();
        _burn(account, id, amount);
    }
}
