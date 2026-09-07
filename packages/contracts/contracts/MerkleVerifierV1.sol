// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IPiVerifier, ChunkProof} from "./IPiVerifier.sol";

/// @notice The only verifier implementation for π dataset v1. Immutable and
/// stateless (all functions are `pure`)  -  deployed once, referenced forever
/// by any dataset version registered against it. A future verifier (e.g. a
/// ZK-based one) ships as an entirely separate contract used only by new
/// dataset versions; this one is never upgraded (docs/proof-system.md §3.6).
///
/// Mirrors packages/proofs/src/proof.ts::verifyOccurrenceProof exactly  -
/// that TS implementation is the standalone, backend-independent way to
/// build and check the same proof this contract checks on-chain.
contract MerkleVerifierV1 is IPiVerifier {
    function verifyOccurrence(
        bytes32 root,
        uint256 chunkSizeDigits,
        uint256 position,
        bytes calldata sequence,
        ChunkProof[] calldata proofs
    ) external pure override returns (bool) {
        uint256 matchLength = sequence.length;
        if (matchLength == 0 || proofs.length == 0) return false;

        uint256 expectedStartChunk = position / chunkSizeDigits;

        // proofs must be contiguous, ascending chunk indices starting at the match's first chunk
        for (uint256 i = 0; i < proofs.length; i++) {
            if (proofs[i].chunkIndex != expectedStartChunk + i) return false;
        }

        // authenticate every chunk against the dataset's Merkle root before trusting its bytes
        for (uint256 i = 0; i < proofs.length; i++) {
            bytes32 leaf = keccak256(proofs[i].chunkData);
            if (!_verifyMerkleProof(leaf, proofs[i].merkleProof, proofs[i].chunkIndex, root)) return false;
        }

        uint256 localOffset = position - expectedStartChunk * chunkSizeDigits;
        for (uint256 i = 0; i < matchLength; i++) {
            uint256 globalIdx = localOffset + i;
            uint256 proofIdx = globalIdx / chunkSizeDigits;
            uint256 withinChunkIdx = globalIdx % chunkSizeDigits;
            if (proofIdx >= proofs.length) return false;
            uint8 digit = _unpackDigit(proofs[proofIdx].chunkData, withinChunkIdx);
            if (digit != uint8(sequence[i])) return false;
        }

        return true;
    }

    function _verifyMerkleProof(bytes32 leaf, bytes32[] calldata proof, uint256 index, bytes32 root) private pure returns (bool) {
        bytes32 hash = leaf;
        uint256 idx = index;
        for (uint256 i = 0; i < proof.length; i++) {
            if (idx % 2 == 0) {
                hash = keccak256(abi.encodePacked(hash, proof[i]));
            } else {
                hash = keccak256(abi.encodePacked(proof[i], hash));
            }
            idx /= 2;
        }
        return hash == root;
    }

    function _unpackDigit(bytes calldata packed, uint256 digitIndex) private pure returns (uint8) {
        uint8 b = uint8(packed[digitIndex / 2]);
        return digitIndex % 2 == 0 ? (b >> 4) : (b & 0x0F);
    }
}
