import { encodeAbiParameters, keccak256, toBytes, type Hex } from "viem";

/**
 * Canonical, single source of truth for discoveryId derivation
 * (docs/proof-system.md §3.5). Frontend, backend, and Solidity test code
 * must all agree with this exact encoding — never reimplement ad hoc.
 *
 * discoveryId = keccak256(abi.encode(
 *   datasetVersion,  // uint256
 *   root,            // bytes32
 *   position,        // uint256
 *   matchLength,      // uint256
 *   sequenceHash      // bytes32 = keccak256(sequence bytes, digit values 0-9, unpacked)
 * ))
 */

/** digit string ("0".."9" chars) -> unpacked byte array of digit values 0-9, matching the on-chain `sequence` encoding. */
export function digitsToBytes(sequence: string): Uint8Array {
  const bytes = new Uint8Array(sequence.length);
  for (let i = 0; i < sequence.length; i++) {
    const d = sequence.charCodeAt(i) - 48; // '0' = 48
    if (d < 0 || d > 9) throw new RangeError(`Invalid digit character at index ${i} in "${sequence}"`);
    bytes[i] = d;
  }
  return bytes;
}

export function sequenceHashOf(sequence: string): Hex {
  return keccak256(digitsToBytes(sequence));
}

export interface DiscoveryIdInput {
  datasetVersion: bigint;
  root: Hex; // bytes32
  position: bigint;
  matchLength: number;
  sequence: string;
}

export function computeDiscoveryId({ datasetVersion, root, position, matchLength, sequence }: DiscoveryIdInput): Hex {
  const sequenceHash = sequenceHashOf(sequence);
  const encoded = encodeAbiParameters(
    [{ type: "uint256" }, { type: "bytes32" }, { type: "uint256" }, { type: "uint256" }, { type: "bytes32" }],
    [datasetVersion, root, position, BigInt(matchLength), sequenceHash]
  );
  return keccak256(encoded);
}

export { keccak256, toBytes };
