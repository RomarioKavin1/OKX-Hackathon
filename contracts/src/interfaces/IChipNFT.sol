// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

interface IChipNFT {
    function burnFrom(address account, uint256 chipId, uint256 amount) external;
    function balanceOf(address account, uint256 id) external view returns (uint256);
}
