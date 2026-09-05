import { loadDataset, type LoadedDataset } from "@pi-hunter/pi-search";
import { buildDatasetTree } from "@pi-hunter/proofs";
import type { MerkleTree } from "@pi-hunter/pi-search";

export interface ActiveDataset extends LoadedDataset {
  tree: MerkleTree;
  chunks: Uint8Array[];
}

let active: ActiveDataset | null = null;

/** Loads the dataset once at process startup and builds the Merkle tree
 * needed for proof construction. This is the only place the (potentially
 * large) raw digit file and suffix array are held in memory — see
 * packages/pi-search/src/dataset.ts for the "why full in-memory is fine at
 * this dataset's actual size" reasoning. */
export function loadActiveDataset(dir: string): ActiveDataset {
  const loaded = loadDataset(dir);
  const { tree, chunks } = buildDatasetTree(loaded.digits, loaded.manifest.chunkSizeDigits);
  active = { ...loaded, tree, chunks };
  return active;
}

export function getActiveDataset(): ActiveDataset {
  if (!active) throw new Error("Dataset not loaded yet — call loadActiveDataset() at startup");
  return active;
}

/** Test-only seam — lets tests inject a small synthetic dataset instead of
 * loading the real (large) one from disk. Never called from server.ts. */
export function setActiveDatasetForTesting(dataset: ActiveDataset): void {
  active = dataset;
}
