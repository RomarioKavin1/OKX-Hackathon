// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

interface IMatchdayClock {
    function lockTime(uint256 matchday) external view returns (uint64);
    function isOpen(uint256 matchday) external view returns (bool);
    function isCancelled(uint256 matchday) external view returns (bool);
    function isSettled(uint256 matchday) external view returns (bool);
}
