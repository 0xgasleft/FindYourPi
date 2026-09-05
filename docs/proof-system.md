# Proof System Design — π Occurrence Verification

This is the single most important design decision in the project. Everything else
(search engine, contract, frontend) is replaceable; the proof system is what
determines whether "Pi Hunter" is a real cryptographic protocol or a UI wrapped
around a database that users are simply asked to trust.

> **Revision note:** this document was reviewed before Phase 1 implementation
> began. The review changed three things from the original draft: the chunk
> encoding (now benchmarked, not assumed — §4), the verifier upgrade story
> (now immutable/versioned, not a swappable module — §3.6), and front-running
> handling (now architected as an optional commit-reveal path, not just
> accepted — §3.7). See `docs/threat-model.md` for the full threat list.

## 1. The problem, precisely

We need a mechanism such that:

> Given a claimed `(position, matchLength, sequence)`, a smart contract (or any
> independent third party) can verify that the digits of π at `position` in the
> **canonical, versioned π dataset** actually equal `sequence` — without the
> contract storing the dataset, and without unconditionally trusting the API
> server that ran the search.

The dataset itself is not secret and not adversarial (π's digits are a fixed,
public, recomputable constant). The actual attacker model is:

* A malicious or buggy **backend** claiming a match that doesn't exist, or at
  the wrong position, in order to mint fraudulent/duplicate NFTs.
* A malicious **frontend/user** submitting a forged proof directly to the
  contract, bypassing the backend entirely.

The dataset's *authenticity relative to real π* is a separate, weaker trust
problem (see §5) — it is auditable by anyone, rather than something that must
be re-trusted on every claim.

## 2. Options considered

### Option 1 — Merkleized π chunks (chosen)

Partition the canonical dataset into fixed-size chunks. Build a standard
binary Merkle tree over `keccak256(chunk_bytes)` leaves. The root is the
**dataset commitment**, published on-chain per dataset version.

To prove an occurrence, the prover supplies the 1–2 chunks the match spans,
each chunk's raw digit bytes, and a standard Merkle inclusion proof for each
chunk against the published root. The verifier (on-chain or off-chain)
recomputes the leaf hash, walks the Merkle path to the root, and then slices
the claimed substring out of the (now-authenticated) chunk bytes and compares
it to the claimed sequence.

**Properties:** cheap to generate, cheap to verify on any EVM chain, fully
transparent, no novel cryptography, easy to audit, easy to reimplement
independently. Weaknesses: proof size grows with `log(chunks)`; a
compromised/incorrect *root* is not detected by this scheme alone (see §5) —
it only proves "this substring is part of whatever dataset produced this
root."

### Option 2 — Vector / Verkle commitment

Constant-size proofs regardless of dataset size, but requires a trusted setup
or newer elliptic-curve primitives, immature/nonstandard tooling for
arbitrary EVM chains today, and meaningfully more implementation and audit
risk for a first version. **Rejected for MVP** — the benchmark in §4 shows
Merkle proofs are already cheap enough (~99k gas total, dominated by ordinary
ERC-721 mint overhead, not proof size) that Verkle's main advantage doesn't
move the needle yet. Revisit if dataset size or claim volume grows enough
that proof calldata becomes the actual bottleneck.

### Option 3 — ZK proof of substring membership

A zk-SNARK/STARK proving "the committed dataset contains `sequence` at
`position`" without revealing anything else. The natural Phase 4 target in
the decentralization roadmap, but disproportionate for MVP: substring-
matching circuits over a multi-hundred-million-digit dataset are a real
research/engineering project on their own, and the threat they uniquely
defend against — chunk data disclosure — isn't a real concern here, since
chunk contents are just public π digits with no privacy value. **Rejected
for MVP, scheduled as Phase 4.**

### Option 4 — Immutable, versioned verifier contracts (chosen upgrade path)

Rather than a swappable/upgradeable verifier module sitting behind the NFT
contract, each dataset version permanently records the address of the
verifier contract used to accept claims against it, set once at registration
and never changed. A future ZK verifier ships as a new contract
(`ZKVerifierV2`) used only by *new* dataset versions; existing tokens keep
referencing `MerkleVerifierV1` forever. See §3.6 — this was changed from the
original "swappable module" draft specifically so "your place in π is
permanent" isn't undercut by an admin key that can change what verification
means for already-minted tokens.

## 3. Chosen design

### 3.1 Canonical dataset & chunking

* Digits stored as decimal values `0–9` (not ASCII), decimal digits only,
  **position 0 = first digit after the decimal point** (the leading `3` is
  never counted — this is the one global convention every component must
  share).
* **Max on-chain-provable match length: 64 digits.** Rarity tiers go up to
  "MYTHIC, 20+ digits," but even a future 100-billion-digit dataset (v3+ in
  the roadmap) has an expected count of ~10⁻⁹ for a 20-digit sequence —
  practically unreachable. A 64-digit cap leaves enormous headroom over
  anything realistically discoverable at any dataset size this project will
  reach, while keeping the proof's worst case bounded.
* **Chunk size: 128 digits, packed 4 bits/digit (64 bytes/chunk).** Chosen
  by benchmarking, not assumption — see §4. Chunk size ≥ max match length
  guarantees any match spans **at most 2 adjacent chunks**, so proof/calldata
  size is bounded regardless of match length or position.
* Tree depth for a 1B-digit dataset at this chunk size:
  `ceil(log2(1,000,000,000 / 128))` = 23 levels, i.e. proofs are 23 sibling
  hashes (736 bytes) per chunk touched.
* `root` = Merkle root over `keccak256(chunk)` leaves, standard indexed
  proof (sibling order derived from the chunk index's bits).

### 3.2 Dataset registry (on-chain)

A small `PiDatasetRegistry` contract (separate from the NFT contract) stores,
per version:

```solidity
struct PiDataset {
    uint256 version;
    uint256 digitCount;
    uint256 chunkSize;     // in digits (128 for v1)
    bytes32 root;          // Merkle commitment over packed chunks
    bytes32 datasetHash;   // hash of the full canonical file, for off-chain audit
    address verifier;      // immutable once set — see 3.6
    bool active;           // gates NEW claims only, never invalidates past ones
}

function registerDataset(...) external onlyOwner {
    require(datasets[version].root == bytes32(0), "version already registered");
    // ... store; verifier and root can never be changed for this version again
}
```

Versions are append-only and immutable once published (§36 of the spec: old
discoveries remain valid forever).

### 3.3 On-chain verifier

Chunk data is packed 4 bits/digit (two digits per byte, high nibble first);
the claimed `sequence` itself is kept **unpacked** (1 byte/digit) since it's
short (≤64 bytes) and this keeps the value the contract actually compares
against trivially human-auditable — packing it saves negligible gas (~1% of
the total, confirmed in the benchmark) at the cost of readability.

```solidity
struct ChunkProof {
    uint256 chunkIndex;
    bytes   chunkData;      // packed 4-bit/digit, 64 bytes for a full 128-digit chunk
    bytes32[] merkleProof;  // sibling hashes, leaf -> root
}

interface IPiVerifier {
    function verifyOccurrence(
        bytes32 root,
        uint256 chunkSize,       // digits per chunk, from the dataset registry
        uint256 position,        // global digit offset, 0-indexed
        bytes calldata sequence, // digit values 0-9, one byte each, length = matchLength
        ChunkProof[] calldata proofs // 1 or 2 entries
    ) external pure returns (bool);
}
```

Verification (`MerkleVerifierV1`, the only implementation for MVP):

1. For each `proofs[i]`: `leaf = keccak256(chunkData)`; walk `merkleProof`
   using `chunkIndex` bits to determine left/right concatenation at each
   level; require the final hash equals `root`.
2. Unpack each authenticated `chunkData` into digit values (two per byte);
   concatenate in chunk-index order; compute local offset =
   `position - proofs[0].chunkIndex * chunkSize`; require
   `unpacked[localOffset : localOffset + sequence.length] == sequence`.
3. Return true only if every check passes.

This function is deterministic, side-effect-free, and independently
reimplementable by anyone from the public dataset — it is the load-bearing
piece that stops the failure mode called out in the spec (§14): the contract
never mints on the backend's say-so, it recomputes the proof itself.

### 3.4 Claim / mint flow

```solidity
function claim(
    uint256 datasetVersion,
    uint256 position,
    bytes calldata sequence,
    ChunkProof[] calldata proofs
) external {
    PiDataset memory ds = registry.get(datasetVersion);
    require(ds.active, "dataset not open for new claims");
    require(IPiVerifier(ds.verifier).verifyOccurrence(ds.root, ds.chunkSize, position, sequence, proofs), "bad proof");

    bytes32 sequenceHash = keccak256(sequence);
    bytes32 discoveryId = keccak256(abi.encode(datasetVersion, ds.root, position, sequence.length, sequenceHash));
    require(!claimed[discoveryId], "already claimed");
    claimed[discoveryId] = true;

    uint256 tokenId = _nextTokenId++;
    _mint(msg.sender, tokenId);
    tokenDiscovery[tokenId] = discoveryId;
    emit DiscoveryClaimed(tokenId, discoveryId, msg.sender, position, sequence.length, sequenceHash);
}
```

The backend's only role is to *find* candidate occurrences fast and hand the
frontend a ready-made proof — but the proof is fully self-contained and the
contract does not call out to any off-chain service to accept it. A user with
their own copy of the π dataset and a script (deliberately provided in
`packages/proofs` as a standalone verifier, independent of the API) can
construct and submit the exact same `claim()` call without touching the
backend at all.

### 3.5 discoveryId canonical serialization

```text
discoveryId = keccak256(abi.encode(
    datasetVersion,   // uint256
    root,             // bytes32, the dataset's Merkle commitment
    position,         // uint256, 0-indexed, digits-after-decimal-point convention
    matchLength,      // uint256
    sequenceHash      // bytes32 = keccak256(sequence bytes, digit values 0-9, unpacked)
))
```

Fixed, ABI-encoded, defined once in `packages/pi-core` and imported by
frontend, backend, and contract test code — never reimplemented ad hoc. A
discovery's identity does not depend on which verifier contract accepted it
— that's pinned separately, permanently, at the dataset-registry level
(§3.6), so it never needs to appear in the id.

### 3.6 Why the verifier is immutable and versioned, not upgradeable

The original draft proposed a swappable verifier module behind the NFT
contract, reasoning that ZK verification could later replace Merkle proofs
without a migration. On review this was rejected: an upgradeable
verification path means users implicitly trust whoever controls the upgrade
— directly at odds with "your place in π is permanent." The fix keeps the
upgrade path but removes the trust dependency:

* `PiDatasetRegistry` — dataset commitments are immutable once registered.
* `PiHunterNFT` — discovery semantics (`discoveryId` derivation, `claimed`
  tracking, token/discovery association) never change.
* Verifier contracts — each one is deployed once, immutable, and referenced
  by exactly the dataset versions that named it at registration time
  (`MerkleVerifierV1` for v1; a hypothetical `ZKVerifierV2` would only ever
  be referenced by v2+). Deploying a new verifier and registering a new
  dataset version against it never touches how existing tokens were, or
  continue to be, verified.

This makes "NFT #827 was minted under π Dataset v1 using Verification
Protocol v1" a permanent, checkable fact — exposed on the public
verification page (§38 of the spec) — rather than something an admin could
retroactively redefine.

### 3.7 Front-running: commit-reveal as a first-class, optional path

Direct `claim()` (§3.4) is vulnerable to the standard public-mint race: a
pending claim transaction reveals `(position, sequence, proof)` in the
mempool, and a bot can resubmit it with higher gas and win the mint. For
common/short matches this doesn't matter (no one is racing for a 4-digit
common find), but the platform's own rarity/social mechanics make rare
finds worth racing for, so the contract ships a second, optional claim path
from day one rather than needing a migration later:

```solidity
// Step 1 (mempool-safe): reveals nothing except that *some* claim is coming.
function commitClaim(bytes32 commitHash) external {
    commits[msg.sender][commitHash] = block.number;
}

// Step 2, after MIN_REVEAL_DELAY blocks:
function revealClaim(
    uint256 datasetVersion,
    uint256 position,
    bytes calldata sequence,
    ChunkProof[] calldata proofs,
    bytes32 secret
) external {
    bytes32 discoveryId = _computeDiscoveryId(datasetVersion, position, sequence); // same derivation as claim()
    bytes32 commitHash = keccak256(abi.encode(msg.sender, discoveryId, secret));
    uint256 committedAt = commits[msg.sender][commitHash];
    require(committedAt != 0 && block.number >= committedAt + MIN_REVEAL_DELAY, "reveal too early or no commit");
    delete commits[msg.sender][commitHash];
    _verifyAndMint(datasetVersion, position, sequence, proofs); // shared with claim()
}
```

`commitClaim` reveals only a hash — not the discovery, not even which
occurrence is being targeted — so a mempool observer has nothing to
front-run. MVP UX default is still direct `claim()` (simpler, no wait, fine
for the common case); the frontend switches a given claim to the
commit-reveal path once the match's rarity tier crosses a configurable
threshold (e.g. RARE and above), where the extra step is worth the
protection. Both paths share the same `discoveryId` derivation, the same
`claimed` mapping, and the same verifier call, so this is additive — it
doesn't change what a discovery *is*, only how contested ones get claimed.

### 3.8 Discovery state as a first-class product object

A discovery (`datasetVersion, root, position, matchLength, sequenceHash` →
`discoveryId`) exists, and is publicly showable, independently of whether
anyone has claimed it yet:

```text
FOUND
UNCLAIMED
  sequence, position, dataset, rarity, discoveryId

           ↓ someone calls claim() / revealClaim()

CLAIMED
  + tokenId, owner, claimedAt, transactionHash
```

`claimed[discoveryId]` (plus the indexer's `discoveries`/`claims` tables) is
exactly this state machine — the API can show a search result as "FOUND —
UNCLAIMED" immediately, independent of the mint transaction, which is both
more honest (the discovery existed the moment π was indexed, minting doesn't
create it) and a stronger competitive/social hook ("someone else might claim
this before you") than treating discovery and claim as the same event.

## 4. Chunk encoding benchmark

Reviewed and challenged: the original draft picked 1,024-byte chunks
(1 byte/digit) and justified the resulting ~3.3KB calldata as "cheap on
Base" without numbers. Re-done as an actual computation against fixed EVM
gas-schedule constants (EIP-2028 calldata pricing: 16 gas/nonzero byte;
`keccak256`: 30 + 6 gas/word) — reproducible via
`packages/proofs/benchmark/chunk-encoding.js`:

```text
Dataset: 1,000,000,000 digits, max on-chain match length: 64 digits

label                                          | depth | chunkDataB | totalCalldataB | TOTAL_GAS
1024-digit chunks, 1 byte/digit (naive)        |  20   | 1024       | 3588           | 126,574
256-digit chunks, 1 byte/digit                 |  22   | 256        | 2180           | 103,926
128-digit chunks, 1 byte/digit                 |  23   | 128        | 1988           | 100,890
256-digit chunks, packed 4-bit/digit           |  22   | 128        | 1924           |  99,782
128-digit chunks, packed 4-bit/digit (chosen)  |  23   | 64         | 1860           |  98,818
96-digit chunks, packed 4-bit/digit            |  24   | 48         | 1892           |  99,414
64-digit chunks, packed 4-bit/digit            |  24   | 32         | 1860           |  98,890
512-digit chunks, packed 4-bit/digit           |  21   | 256        | 2116           | 102,818
```

Findings:

* **Calldata dominates cost**, not `keccak256` (proof hashing is ~2,000 gas
  total across every scenario — tree-depth growth from smaller chunks is
  effectively free).
* Packing digits 4-bit halves chunk-data calldata for the same chunk size —
  a strictly better move at every chunk size tested (256B packed beats 256B
  unpacked; 128B packed beats 128B unpacked).
* Total gas is a **flat minimum between ~64 and ~160 digits/chunk** once
  packed (98,300–99,400 gas) — the naive 1,024-byte design was ~22% more
  expensive than the chosen point for no benefit.
* **Chosen: 128-digit chunks, packed 4-bit/digit** — sits at the flat
  minimum, a round number comfortably ≥ the 64-digit max-match-length cap
  (preserving the ≤2-chunks-touched invariant with headroom), ~98.8k total
  gas for a worst-case claim on Base. At typical Base L2 gas prices this is
  a sub-cent-to-low-single-digit-cent transaction; the precise USD figure
  moves with L1 data-availability pricing, so the gas number — not a dollar
  estimate — is the durable claim here.

This replaces "cheap on Base" with a number, and the benchmark script stays
in the repo so the choice can be re-validated (or revisited) whenever
`MAX_MATCH_LEN`, dataset size, or the mint-overhead estimate changes.

### 4.1 Real measured gas (supersedes the analytical mint-overhead guess)

The analytical model above estimated mint overhead as a flat "~46,000 gas"
placeholder. Once `PiHunterNFT`/`MerkleVerifierV1`/`PiDatasetRegistry` were
actually implemented and tested (`packages/contracts/test/gas-report.test.ts`,
run against a local Hardhat chain with real generated proofs from
`packages/proofs`), **measured gas for `claim()` came in at ~192,000–195,000
gas** — roughly double the analytical estimate. The gap is entirely on the
storage side, not proof verification: `_finalizeClaim` writes three fresh
mapping slots (`claimed`, `tokenIdToDiscoveryId`, `discoveryIdToTokenId`)
plus standard ERC-721 `_owners`/`_balances` writes, and several of those are
cold SSTOREs (~20,000+ gas each) — the "~46,000 gas, rough" placeholder
simply undercounted how many distinct storage slots a real mint touches.
Proof verification itself (calldata + `keccak256`) matches the analytical
model closely; the correction is specific to mint bookkeeping cost, not the
Merkle scheme. ~195k gas is still a cheap transaction on an L2 like Base —
the conclusion "keep the chosen chunk encoding, it's not the bottleneck"
stands, but the dollar-cost intuition should be calibrated off this
measured number, not the original analytical one.

## 5. What this scheme does *not* solve (explicit trust assumption)

The Merkle proof guarantees "this substring is part of the dataset behind
`root`." It does **not**, by itself, guarantee "`root` was computed from the
*real, correct* digits of π." That is a one-time, auditable-by-anyone claim
about how the dataset was produced, not a per-claim trust requirement — and,
per review, this auditability ships **as part of MVP, not deferred to a
later phase**:

* The dataset generation method (algorithm, source, parameters), the full
  generation source code, and the raw chunked dataset are published in the
  repo alongside `datasetHash`/`root` from the first release.
* An `independent-verify` script (`packages/pi-search` /
  `packages/proofs`, exact location finalized in Phase 2) regenerates the
  digits from the published algorithm/parameters and recomputes the Merkle
  root, so a third party can run one command and confirm the on-chain root
  matches — no trust in this project's infrastructure required for that
  check.
* Dataset versions are immutable and append-only — a bad version can be
  deactivated for new claims but never silently edited (§36 of the spec).

This is the honest MVP answer required by the spec (§13, §57): the simplest
architecture that gives strong, on-chain-checked integrity for *every claim*,
with a single, disclosed, and independently and immediately auditable
assumption about *dataset construction* rather than an ongoing trust
requirement on the company's server. See `docs/architecture.md` §5 for where
this lands in the build order, and `docs/threat-model.md` T3 for the full
threat writeup.
