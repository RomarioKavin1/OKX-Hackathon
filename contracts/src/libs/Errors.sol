// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

library Errors {
    error NotAuthorized();
    error SupplyCapReached();
    error StatsNotSet();
    error TransferWhileRented();
    error AlreadyExists();
    error NotFound();
    error MatchdayNotOpen();
    error MatchdayLocked();
    error CardAlreadyUsed();
    error NotController();
    error AlreadyClaimed();
    error InvalidProof();
    error ThresholdNotMet();
    error BadInput();
}
