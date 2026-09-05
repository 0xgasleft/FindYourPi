// Committed, generated ABI files — see scripts/sync-abis.mjs. Deliberately
// NOT read live from packages/contracts/artifacts (a gitignored Hardhat
// build output): that would make anything depending on this package
// (apps/web included) require a working Solidity toolchain at build time,
// which breaks on a plain `git clone` + `pnpm install` (e.g. on Vercel).
import piHunterNFTAbi from "./generated/PiHunterNFT.abi.json";
import piDatasetRegistryAbi from "./generated/PiDatasetRegistry.abi.json";
import merkleVerifierV1Abi from "./generated/MerkleVerifierV1.abi.json";

export { piHunterNFTAbi, piDatasetRegistryAbi, merkleVerifierV1Abi };
