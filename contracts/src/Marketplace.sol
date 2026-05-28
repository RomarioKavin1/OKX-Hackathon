// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {ICardNFT} from "./interfaces/ICardNFT.sol";
import {Errors} from "./libs/Errors.sol";

contract Marketplace is Ownable {
    uint16 public constant SELLER_BPS = 9500;
    uint16 public constant PLATFORM_BPS = 400;
    uint16 public constant ORIGINAL_BPS = 100;

    struct Listing { address seller; uint256 price; }

    IERC721 public immutable nft;
    ICardNFT public immutable card;
    IERC20 public immutable usdc;
    address public treasury;
    mapping(uint256 => Listing) public listings;

    event Listed(uint256 indexed tokenId, address indexed seller, uint256 price);
    event Sold(uint256 indexed tokenId, address indexed buyer, uint256 price);
    event Cancelled(uint256 indexed tokenId);

    constructor(address card_, address usdc_, address treasury_) Ownable(msg.sender) {
        nft = IERC721(card_);
        card = ICardNFT(card_);
        usdc = IERC20(usdc_);
        treasury = treasury_;
    }

    function setTreasury(address t) external onlyOwner { treasury = t; }

    function list(uint256 tokenId, uint256 price) external {
        if (price == 0) revert Errors.BadInput();
        nft.transferFrom(msg.sender, address(this), tokenId);
        listings[tokenId] = Listing(msg.sender, price);
        emit Listed(tokenId, msg.sender, price);
    }

    function cancel(uint256 tokenId) external {
        Listing memory l = listings[tokenId];
        if (l.seller != msg.sender) revert Errors.NotAuthorized();
        delete listings[tokenId];
        nft.transferFrom(address(this), msg.sender, tokenId);
        emit Cancelled(tokenId);
    }

    function buy(uint256 tokenId) external {
        Listing memory l = listings[tokenId];
        if (l.seller == address(0)) revert Errors.NotFound();
        delete listings[tokenId];

        uint256 platform = l.price * PLATFORM_BPS / 10000;
        uint256 royalty = l.price * ORIGINAL_BPS / 10000;
        uint256 toSeller = l.price - platform - royalty;
        address orig = card.originalBuyer(tokenId);

        require(usdc.transferFrom(msg.sender, treasury, platform), "u1");
        require(usdc.transferFrom(msg.sender, orig, royalty), "u2");
        require(usdc.transferFrom(msg.sender, l.seller, toSeller), "u3");

        nft.transferFrom(address(this), msg.sender, tokenId);
        emit Sold(tokenId, msg.sender, l.price);
    }
}
