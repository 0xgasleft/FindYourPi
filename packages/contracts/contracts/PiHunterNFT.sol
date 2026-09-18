// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC721Enumerable} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {PiDatasetRegistry, PiDataset} from "./PiDatasetRegistry.sol";
import {IPiVerifier, ChunkProof} from "./IPiVerifier.sol";

/// @notice The Pi Hunter NFT. Discovery semantics (discoveryId derivation,
/// duplicate-claim prevention, token/discovery association) never change  -
/// see docs/proof-system.md §3.5-3.6. Verification itself is delegated to
/// whichever immutable verifier contract the referenced dataset version
/// named at registration time; this contract never re-implements or
/// upgrades that logic itself.
///
/// Two ways to claim (docs/proof-system.md §3.7):
///  - `claim`: immediate, simple, the MVP default for ordinary finds.
///  - `commitClaim` + `revealClaim`: for rare finds worth protecting from
///    mempool front-running  -  the commit step reveals only a hash.
/// Both funnel into the same discoveryId derivation and `claimed` mapping,
/// so adding the commit-reveal path never changed what a discovery *is*.
contract PiHunterNFT is ERC721, ERC721Enumerable, Ownable, Pausable {
    PiDatasetRegistry public immutable registry;

    /// @dev Minimum blocks between commitClaim and revealClaim  -  long enough
    /// that a same-block/adjacent-block mempool copy of the reveal transaction
    /// cannot also have committed in time to satisfy this delay.
    uint256 public constant MIN_REVEAL_DELAY = 3;

    uint256 private _nextTokenId = 1;

    /// @dev Owner-settable, NOT part of discovery identity or verification  -
    /// purely where to fetch display metadata (spec §37). The metadata at
    /// this URI is itself deterministically reproducible from on-chain
    /// discovery data (packages/proofs, apps/api's metadata builder), so
    /// changing hosts never changes what a token "is".
    string private _metadataBaseURI;

    mapping(bytes32 => bool) public claimed;
    mapping(uint256 => bytes32) public tokenIdToDiscoveryId;
    mapping(bytes32 => uint256) public discoveryIdToTokenId;

    // The grant POC is deliberately backendless: these are the small pieces
    // of public display data needed to produce durable on-chain metadata.
    // They are not part of verification or discovery identity.
    mapping(uint256 => bytes) private _tokenSequences;
    mapping(uint256 => uint256) private _tokenPositions;

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

    /// @notice Self-contained metadata keeps a POC token inspectable even
    /// when no centralized metadata API is operating. An owner-set base URI
    /// remains an optional future upgrade path for the large-scale product.
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        if (bytes(_metadataBaseURI).length != 0) return super.tokenURI(tokenId);

        bytes memory packedSequence = _tokenSequences[tokenId];
        string memory sequence = _digitsToString(packedSequence);
        string memory position = Strings.toString(_tokenPositions[tokenId]);
        string memory id = Strings.toString(tokenId);
        bytes32 visualSeed = keccak256(abi.encode(packedSequence, _tokenPositions[tokenId], tokenId));
        string memory accent = uint256(visualSeed) % 2 == 0 ? "#22d3ee" : "#8b5cf6";
        string memory orbit = Strings.toString(150 + (uint256(visualSeed) % 260));
        string memory svg = string.concat(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800"><defs><linearGradient id="g" x1="0" x2="1"><stop stop-color="#f2c94c"/><stop offset="1" stop-color="', accent, '"/></linearGradient></defs><rect width="800" height="800" fill="#07080f"/><circle cx="400" cy="400" r="', orbit, '" fill="none" stroke="', accent, '" stroke-width="2" opacity=".5"/><circle cx="400" cy="400" r="', Strings.toString(95 + (uint256(visualSeed) % 75)), '" fill="none" stroke="#f2c94c" stroke-width="2"/><path d="M70 570 Q400 ', Strings.toString(480 + (uint256(visualSeed) % 110)), ' 730 570" fill="none" stroke="', accent, '" stroke-width="3" opacity=".7"/><rect x="32" y="32" width="736" height="736" fill="none" stroke="url(#g)" stroke-width="2"/><text x="72" y="122" fill="#d7ad45" font-family="monospace" font-size="22" letter-spacing="7">PI HUNTER / ARC</text><text x="72" y="385" fill="url(#g)" font-family="monospace" font-size="96">',
            sequence,
            '</text><text x="72" y="450" fill="#a3a3a3" font-family="monospace" font-size="28">VERIFIED AT POSITION ',
            position,
            '</text><text x="72" y="680" fill="', accent, '" font-family="monospace" font-size="24">ON-CHAIN DISCOVERY #',
            id,
            '</text></svg>'
        );
        string memory image = string.concat("data:image/svg+xml;base64,", Base64.encode(bytes(svg)));
        string memory json = string.concat(
            '{"name":"Pi Hunter #', id,
            '","description":"A cryptographically verified occurrence in the decimal expansion of pi.","image":"', image,
            '","attributes":[{"trait_type":"Sequence","value":"', sequence,
            '"},{"trait_type":"Position","display_type":"number","value":', position,
            '}]}'
        );
        return string.concat("data:application/json;base64,", Base64.encode(bytes(json)));
    }

    /// @dev Claims use compact digit bytes (0 through 9) for proof
    /// verification. Metadata needs printable decimal characters instead.
    function _digitsToString(bytes memory packedDigits) private pure returns (string memory) {
        bytes memory decimalDigits = new bytes(packedDigits.length);
        for (uint256 i; i < packedDigits.length; ++i) {
            decimalDigits[i] = bytes1(uint8(packedDigits[i]) + 48);
        }
        return string(decimalDigits);
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC721, ERC721Enumerable) returns (bool) {
        return super.supportsInterface(interfaceId);
    }

    function _update(address to, uint256 tokenId, address auth) internal override(ERC721, ERC721Enumerable) returns (address) {
        return super._update(to, tokenId, auth);
    }

    function _increaseBalance(address account, uint128 value) internal override(ERC721, ERC721Enumerable) {
        super._increaseBalance(account, value);
    }

    /// @notice Direct claim  -  verifies the proof and mints in one transaction.
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
    /// recipient contract hits the duplicate-claim check and reverts  -
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
        _tokenSequences[tokenId] = sequence;
        _tokenPositions[tokenId] = position;

        bytes32 sequenceHash = keccak256(sequence);
        emit DiscoveryClaimed(tokenId, discoveryId, to, position, sequence.length, sequenceHash);

        _safeMint(to, tokenId);
    }
}
