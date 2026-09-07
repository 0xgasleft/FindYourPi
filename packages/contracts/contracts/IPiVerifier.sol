// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice One chunk's data + its Merkle inclusion proof, exactly as described
/// in docs/proof-system.md §3.3. `chunkData` is packed 4 bits/digit.
struct ChunkProof {
    uint256 chunkIndex;
    bytes chunkData;
    bytes32[] merkleProof;
}

/// @notice A verifier proves that `sequence` occurs at `position` in the
/// dataset committed to by `root`, without the caller (or this interface)
/// needing to know how the proof is constructed internally. Each dataset
/// version permanently records which verifier implementation it uses
/// (docs/proof-system.md §3.6)  -  verifiers are immutable and versioned,
/// never swapped out from under an already-registered dataset.
interface IPiVerifier {
    function verifyOccurrence(
        bytes32 root,
        uint256 chunkSizeDigits,
        uint256 position,
        bytes calldata sequence,
        ChunkProof[] calldata proofs
    ) external pure returns (bool);
}
