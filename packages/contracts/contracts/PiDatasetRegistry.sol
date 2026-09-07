// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @notice A registered π dataset version. Once registered, `root`,
/// `datasetHash`, `verifier`, `digitCount`, and `chunkSizeDigits` can never
/// change  -  only `active` can be toggled, and only to gate NEW claims
/// (docs/proof-system.md §3.2). Existing tokens minted against this version
/// remain valid and verifiable forever, regardless of `active`.
struct PiDataset {
    uint256 version;
    uint256 digitCount;
    uint256 chunkSizeDigits;
    bytes32 root;
    bytes32 datasetHash;
    address verifier;
    bool active;
    bool exists;
}

contract PiDatasetRegistry is Ownable {
    mapping(uint256 => PiDataset) private _datasets;

    event DatasetRegistered(
        uint256 indexed version,
        bytes32 root,
        bytes32 datasetHash,
        address verifier,
        uint256 digitCount,
        uint256 chunkSizeDigits
    );
    event DatasetActiveSet(uint256 indexed version, bool active);

    constructor(address initialOwner) Ownable(initialOwner) {}

    /// @notice Registers a new dataset version. Reverts if `version` was
    /// already registered  -  there is deliberately no update/overwrite path.
    function registerDataset(
        uint256 version,
        uint256 digitCount,
        uint256 chunkSizeDigits,
        bytes32 root,
        bytes32 datasetHash,
        address verifier
    ) external onlyOwner {
        require(!_datasets[version].exists, "PiDatasetRegistry: version already registered");
        require(verifier != address(0), "PiDatasetRegistry: verifier required");
        require(root != bytes32(0), "PiDatasetRegistry: root required");
        require(digitCount > 0, "PiDatasetRegistry: digitCount required");
        require(chunkSizeDigits > 0, "PiDatasetRegistry: chunkSizeDigits required");

        _datasets[version] = PiDataset({
            version: version,
            digitCount: digitCount,
            chunkSizeDigits: chunkSizeDigits,
            root: root,
            datasetHash: datasetHash,
            verifier: verifier,
            active: true,
            exists: true
        });

        emit DatasetRegistered(version, root, datasetHash, verifier, digitCount, chunkSizeDigits);
    }

    /// @notice Gates whether NEW claims may reference this version. Never
    /// affects already-minted tokens' validity (spec §36).
    function setActive(uint256 version, bool active) external onlyOwner {
        require(_datasets[version].exists, "PiDatasetRegistry: unknown version");
        _datasets[version].active = active;
        emit DatasetActiveSet(version, active);
    }

    function getDataset(uint256 version) external view returns (PiDataset memory) {
        require(_datasets[version].exists, "PiDatasetRegistry: unknown version");
        return _datasets[version];
    }

    function datasetExists(uint256 version) external view returns (bool) {
        return _datasets[version].exists;
    }
}
