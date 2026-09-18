# Arc Grant POC deployment

This branch is intentionally separate from the large-scale API architecture.
It deploys a fully static proof of concept:

- five million real, reproducibly generated π digits;
- browser-side suffix-array search and Merkle-proof construction;
- Arc Mainnet contract verification and NFT minting;
- self-contained on-chain metadata (no database, indexer, or metadata host).

## Verify locally

```powershell
pnpm --filter @pi-hunter/contracts test
pnpm --filter @pi-hunter/web typecheck
pnpm --filter @pi-hunter/web build
```

The public dataset is committed under `apps/web/public/dataset/arc-grant-v3`.
Its manifest is the deployment authority:

```text
version:      3
digits:       5,000,000
Merkle root:  0x202f8b39109be0131002ea039c13c17cd596ba5f417a5e6eeedb8b3c31fa5ad3
dataset hash: 0x078c6cc17a0606cc15cf36116a6c8b51aa283fd8784a026d783a67452511f271
```

To re-create the static files from the already-generated local v1 corpus:

```powershell
pnpm --filter @pi-hunter/pi-search grant-poc-dataset
```

## Deploy the contracts to Arc Mainnet

Do this from a private terminal only. Do not put a wallet key in Vercel or
commit it to any file. Arc Mainnet is chain ID `5042`; gas is paid in USDC.

```powershell
$env:ARC_MAINNET_RPC_URL = "https://rpc.mainnet.arc.io"
$env:DEPLOYER_PRIVATE_KEY = "0x..."
pnpm --filter @pi-hunter/contracts compile
pnpm --filter @pi-hunter/contracts deploy:arc
```

`deploy:arc` selects the committed grant manifest automatically. Only set
`PI_MANIFEST_PATH` when deliberately deploying a different dataset; paths are
resolved from `packages/contracts`, so the grant manifest path is
`../../apps/web/public/dataset/arc-grant-v3/manifest.json`.

The command prints the registry and NFT addresses. Save both in a private
deployment record. The first contract owner is the deployer address, so use a
wallet you control long-term; it can pause claims or deactivate a dataset.

Do not call `setMetadataBaseURI` for this POC. With an empty base URI every
token serves its own immutable `data:application/json` metadata and SVG image
from the contract.

## Deploy the static app to Vercel

Create a Vercel project with root directory `apps/web`. Set these production
environment variables before deploying (they are public browser configuration,
not secrets):

```text
NEXT_PUBLIC_CHAIN_ID=5042
NEXT_PUBLIC_RPC_URL=https://rpc.mainnet.arc.io
NEXT_PUBLIC_NFT_CONTRACT_ADDRESS=<PiHunterNFT address printed above>
```

Use the normal framework detection/build command. This branch has
`output: "export"`, so Vercel serves only static assets; it does not run an
API, database, or indexer.

## Mainnet release checklist

1. Confirm the deployed registry's version 3 root and digit count match this
   document exactly.
2. Open the Vercel URL in a fresh browser profile and wait for `Local proof
   engine online`.
3. Search `314159`, confirm the UI displays `Merkle proof ready`, then connect
   an Arc wallet and complete one mint with a small amount of USDC for gas.
4. Open the transaction in Arc Explorer and inspect the minted token's
   `tokenURI`; it should start with `data:application/json;base64,`.
5. Retain the deployment transaction hashes, contract addresses, Vercel URL,
   manifest, and this branch name for the grant submission.

This is a public testable POC, not an audited production protocol. Do not
place more USDC in the deployer wallet than the planned deployment and
demonstration budget.
