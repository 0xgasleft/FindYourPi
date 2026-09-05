// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {PiDatasetRegistry, PiDataset} from "./PiDatasetRegistry.sol";
import {IPiVerifier, ChunkProof} from "./IPiVerifier.sol";

/// @notice The Pi Hunter NFT. Discovery semantics (discoveryId derivation,
/// duplicate-claim prevention, token/discovery association) never change —
/// see docs/proof-system.md §3.5-3.6. Verification itself is delegated to
/// whichever immutable verifier contract the referenced dataset version
/// named at registration time; this contract never re-implements or
/// upgrades that logic itself.
///
/// Two ways to claim (docs/proof-system.md §3.7):
///  - `claim`: immediate, simple, the MVP default for ordinary finds.
///  - `commitClaim` + `revealClaim`: for rare finds worth protecting from
///    mempool front-running — the commit step reveals only a hash.
/// Both funnel into the same discoveryId derivation and `claimed` mapping,
/// so adding the commit-reveal path never changed what a discovery *is*.
contract PiHunterNFT is ERC721, Ownable, Pausable {
    PiDatasetRegistry public immutable registry;

    /// @dev Minimum blocks between commitClaim and revealClaim — long enough
    /// that a same-block/adjacent-block mempool copy of the reveal transaction
    /// cannot also have committed in time to satisfy this delay.
    uint256 public constant MIN_REVEAL_DELAY = 3;

    uint256 private _nextTokenId = 1;

    /// @dev Owner-settable, NOT part of discovery identity or verification —
    /// purely where to fetch display metadata (spec §37). The metadata at
    /// this URI is itself deterministically reproducible from on-chain
    /// discovery data (packages/proofs, apps/api's metadata builder), so
    /// changing hosts never changes what a token "is".
    string private _metadataBaseURI;

    mapping(bytes32 => bool) public claimed;
    mapping(uint256 => bytes32) public tokenIdToDiscoveryId;
    mapping(bytes32 => uint256) public discoveryIdToTokenId;

    /// committer => commitHash => block number committed at (0 = no active commit)
    mapping(address => mapping(bytes32 => uint256)) public commits;

    event DiscoveryClaimed(
        uint256 indexed tokenId,
        bytes32 indexed discoveryId,
        address indexed owner,
        uint256 position,
        uint256 matchLength,
        bytes32 sequenceHash
    );
    event ClaimCommitted(address indexed committer, bytes32 indexed commitHash, uint256 blockNumber);

    constructor(address initialOwner, address registryAddress) ERC721("Pi Hunter", "PIHUNT") Ownable(initialOwner) {
        registry = PiDatasetRegistry(registryAddress);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function setMetadataBaseURI(string calldata newBaseURI) external onlyOwner {
        _metadataBaseURI = newBaseURI;
    }

    function _baseURI() internal view override returns (string memory) {
        return _metadataBaseURI;
    }

    /// @notice Direct claim — verifies the proof and mints in one transaction.
    /// Vulnerable to ordinary mempool front-running (docs/threat-model.md T5);
    /// fine for common/uncommon finds, not recommended for rare ones.
    function claim(
        uint256 datasetVersion,
        uint256 position,
        bytes calldata sequence,
        ChunkProof[] calldata proofs
    ) external whenNotPaused returns (uint256 tokenId) {
        (PiDataset memory ds, bytes32 discoveryId) = _datasetAndDiscoveryId(datasetVersion, position, sequence);
        _requireValidProof(ds, position, sequence, proofs);
        tokenId = _finalizeClaim(discoveryId, position, sequence, msg.sender);
    }

    /// @notice Step 1 of the front-running-resistant path: commit only a
    /// hash of (committer, discoveryId, secret). Reveals nothing about which
    /// occurrence is being targeted.
    function commitClaim(bytes32 commitHash) external whenNotPaused {
        require(commits[msg.sender][commitHash] == 0, "PiHunterNFT: already committed");
        commits[msg.sender][commitHash] = block.number;
        emit ClaimCommitted(msg.sender, commitHash, block.number);
    }

    /// @notice Step 2: reveal the real claim details, provided a matching
    /// commit exists and enough blocks have passed.
    function revealClaim(
        uint256 datasetVersion,
        uint256 position,
        bytes calldata sequence,
        ChunkProof[] calldata proofs,
        bytes32 secret
    ) external whenNotPaused returns (uint256 tokenId) {
        (PiDataset memory ds, bytes32 discoveryId) = _datasetAndDiscoveryId(datasetVersion, position, sequence);

        bytes32 commitHash = keccak256(abi.encode(msg.sender, discoveryId, secret));
        uint256 committedAt = commits[msg.sender][commitHash];
        require(committedAt != 0, "PiHunterNFT: no matching commit");
        require(block.number >= committedAt + MIN_REVEAL_DELAY, "PiHunterNFT: reveal too early");
        delete commits[msg.sender][commitHash];

        _requireValidProof(ds, position, sequence, proofs);
        tokenId = _finalizeClaim(discoveryId, position, sequence, msg.sender);
    }

    function _datasetAndDiscoveryId(
        uint256 datasetVersion,
        uint256 position,
        bytes calldata sequence
    ) private view returns (PiDataset memory ds, bytes32 discoveryId) {
        ds = registry.getDataset(datasetVersion);
        // Must match packages/pi-core/src/discoveryId.ts::computeDiscoveryId exactly.
        discoveryId = keccak256(abi.encode(datasetVersion, ds.root, position, sequence.length, keccak256(sequence)));
    }

    function _requireValidProof(
        PiDataset memory ds,
        uint256 position,
        bytes calldata sequence,
        ChunkProof[] calldata proofs
    ) private pure {
        require(ds.active, "PiHunterNFT: dataset not open for new claims");
        require(
            IPiVerifier(ds.verifier).verifyOccurrence(ds.root, ds.chunkSizeDigits, position, sequence, proofs),
            "PiHunterNFT: invalid proof"
        );
    }

    /// @dev `claimed[discoveryId]` is set before `_safeMint`'s external
    /// `onERC721Received` callback, so a reentrant call from a malicious
    /// recipient contract hits the duplicate-claim check and reverts —
    /// standard checks-effects-interactions, no separate reentrancy guard needed.
    function _finalizeClaim(
        bytes32 discoveryId,
        uint256 position,
        bytes calldata sequence,
        address to
    ) private returns (uint256 tokenId) {
        require(!claimed[discoveryId], "PiHunterNFT: already claimed");
        claimed[discoveryId] = true;

        tokenId = _nextTokenId++;
        tokenIdToDiscoveryId[tokenId] = discoveryId;
        discoveryIdToTokenId[discoveryId] = tokenId;

        bytes32 sequenceHash = keccak256(sequence);
        emit DiscoveryClaimed(tokenId, discoveryId, to, position, sequence.length, sequenceHash);

        _safeMint(to, tokenId);
    }
}
