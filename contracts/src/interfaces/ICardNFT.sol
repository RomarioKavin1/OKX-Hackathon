// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

interface ICardNFT {
    struct Stats { uint16 pace; uint16 shooting; uint16 passing; uint16 defense; uint16 physical; }
    function mint(address to, bytes32 playerId, uint8 tier, uint32 mintBatch) external returns (uint256);
    function ownerOf(uint256 tokenId) external view returns (address);
    function userOf(uint256 tokenId) external view returns (address);
    function originalBuyer(uint256 tokenId) external view returns (address);
    function tierOf(uint256 tokenId) external view returns (uint8);
    function setRentalUser(uint256 tokenId, address user, uint64 expires) external;
}
