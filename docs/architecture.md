# Architecture Overview — Pi Hunter

Companion documents: `docs/threat-model.md` (what can go wrong and why it's
mitigated), `docs/proof-system.md` (the on-chain verification design in
depth), `docs/rarity.md` (rarity tiers vs. what's actually discoverable in
the current dataset). This document covers the system as a whole and the
decisions made to get from the spec (`agent_prompt.md`) to a buildable plan.

## 1. Component map

```text
apps/web        Next.js frontend — search UX, wallet flow, discovery/profile/
                 leaderboard pages, OG image generation
apps/api         Search API, conversion, discovery/claim/proof endpoints,
                 rate limiting, auth-free by design (wallet only needed at claim time)
apps/indexer     Chain event indexer (DiscoveryClaimed, Transfer) -> Postgres,
                 reorg-safe, idempotent
apps/admin       Protected dashboard: dataset status, health, pause controls

packages/contracts   PiHunterNFT (ERC-721), PiDatasetRegistry, MerkleVerifierV1
                 (immutable, versioned per dataset — no upgradeable verifier)
packages/pi-core     Canonical conversion algorithms, discoveryId derivation,
                 rarity tiers — single source of truth, imported by web/api/contracts tests
packages/pi-search   Search engine: dataset ingestion, indexing, substring search
packages/proofs      Merkle chunk proof construction + a *standalone* verifier
                 (no dependency on apps/api) — the "don't trust our server" escape hatch
packages/types       Shared TS types / generated contract ABIs
packages/ui          Shared component primitives
packages/config      Shared eslint/tsconfig/tailwind config

infrastructure/docker      Postgres, api, indexer, web services for local dev
infrastructure/terraform   Production infra (deferred until MVP functional)
docs/                      This file, threat-model.md, proof-system.md, runbooks
```

## 2. Data flow (search → claim)

```text
user input
  -> pi-core: normalize + convert (number / ASCII / UTF-8 / SHA-256 modes)
  -> apps/api /api/search
       -> pi-search: substring search over canonical dataset (cached)
       -> response: { found, position, matchLength, occurrenceCount, ... }
  -> apps/web: reveal animation, rarity tier, "Claim this discovery"
  -> user connects wallet
  -> apps/api /api/proof: given (datasetVersion, position, matchLength),
       packages/proofs builds the Merkle chunk proof (chunk data + sibling
       hashes) against the *currently registered* root
  -> apps/web: wallet submits contracts.claim(datasetVersion, position,
       sequence, proofs) directly to the chain (not proxied through the API)
  -> PiProofVerifier re-derives the proof on-chain; PiHunterNFT checks
       discoveryId unclaimed, mints, emits DiscoveryClaimed
  -> apps/indexer picks up the event, writes discoveries/claims/nfts rows
  -> apps/web /discovery/[id]: reads indexed state, renders public page + OG image
```

The critical property: the claim transaction's *inputs* are exactly what the
contract needs to verify from scratch. The API's `/api/proof` endpoint is a
convenience for constructing calldata, not a trust boundary — the contract
does not call back into the API, and `packages/proofs` is deliberately
usable standalone (given only a copy of the public dataset and chunk files)
so a user or auditor never has to trust our backend to submit a valid claim.

## 3. Chain selection

Requirement (spec §11): evaluate, don't hardcode. Candidates considered:
Base, Optimism, Arbitrum, Polygon PoS.

Chosen for MVP: **Base** (OP-Stack L2).

* Gas cost: sub-cent for the calldata-heavy `claim()` transaction profile in
  `docs/proof-system.md` §4 — comparable to other OP-Stack/Arbitrum L2s,
  cheaper than Polygon PoS's current fee volatility.
* NFT/wallet tooling: first-class support in viem/wagmi, broad wallet
  coverage (Coinbase Wallet, MetaMask, WalletConnect), mature block
  explorer (Basescan) for the public verification page (§38).
* RPC reliability: multiple public/paid providers, no single point of
  failure requirement for MVP.
* Ecosystem/long-term viability: active L2 with continued roadmap
  investment; reasonable bet for a consumer-facing collectible app.
* This is not a hardcoded assumption in code — `CHAIN_ID`, `RPC_URL`, and
  contract addresses are all environment-driven (see `.env.example`), so
  redeploying to another OP-Stack or generic EVM chain is a config change,
  not a rewrite.

## 4. π search engine approach

Requirement (spec §6): fast substring search, not naive `LIKE`. Chosen
approach for MVP scale (first ~1B digits): an **FM-index (BWT-based)** built
once at ingestion time, memory-mapped rather than loaded fully into process
memory. Rationale vs. alternatives:

* **Suffix array (plain)**: simpler to build than FM-index, O(n) space at
  ~4-8 bytes/digit — for 1B digits that's 4-8GB, workable but memory-heavy
  per instance and doesn't compress well.
* **FM-index**: compressed (close to entropy of the digit alphabet, size
  10), supports O(m log n) substring search, memory-mappable for
  horizontal scaling without duplicating gigabytes of RAM per replica.
  **Chosen** — matches the spec's explicit requirement to avoid loading the
  full dataset into memory unnecessarily and to support horizontal scaling.
* **Naive scan / SQL LIKE**: explicitly excluded by the spec; doesn't scale
  past a few million digits at interactive latency.

Popular queries (repeated searches for common numbers/words) are cached
(short numeric sequences especially — birthdays, `123456`, etc. — will be
hot keys) in front of the index. Benchmarking (spec §33) validates this
choice empirically before locking it in; if FM-index build/query times don't
meet targets at 1B digits, the fallback is a suffix-array-on-disk with
memory-mapped access as the simpler alternative — both are compatible with
the same chunked-Merkle proof layer, since proof construction only needs
random access to raw digits at a known position, not the index structure
itself.

## 5. Dataset provenance

Digits sourced from a reproducible generation process (spigot/Chudnovsky
algorithm implementation) rather than an unverifiable third-party file,
specifically so the "anyone can regenerate and check the root" property in
`docs/threat-model.md` T3 is real and not just theoretical. The generation
script, parameters, and resulting chunked dataset are versioned artifacts
checked into (or referenced by) the repo, not a one-off manual step.

**Revised on review: independent verification ships in MVP, not Phase 3.**
The decentralization roadmap originally scheduled public dataset download
and independent verifier tooling for Phases 2–3. On review this was judged
too fundamental to the project's core trust claim to defer — a "don't trust
our server" architecture whose only verification tool is unpublished doesn't
earn that claim yet. Phase 2 (π engine, §7 below) therefore now includes, as
in-scope MVP deliverables, not later phases:

* the generation algorithm's exact source code and parameters, published;
* the full chunked dataset, published (static file, not just an API);
* `datasetHash` and `root` recorded together so either can be checked
  against the other;
* an `independent-verify` script that regenerates the digits from the
  published algorithm and recomputes the Merkle root standalone (no
  dependency on `apps/api` or any of this project's running infrastructure);
* a short reproducibility doc walking a third party through running it.

Phases 2–3 of the decentralization roadmap (spec §39) now read as "make this
easier and more widely mirrored," not "make this possible for the first
time."

## 6. Testing strategy

Per spec §32, three layers, mapped onto the components above:

* **Unit**: `pi-core` conversion/discoveryId/rarity (property-tested against
  the documented spec — same digit in, same output, always); `pi-search`
  correctness against a small known-digits fixture; `proofs` Merkle
  construction/verification round-trips; contract unit tests (mint,
  duplicate claim, invalid proof, invalid dataset version, ownership,
  events) plus fuzz tests on `verifyOccurrence` (malformed proofs, off-by-one
  offsets, wrong chunk order).
* **Integration**: the full input → conversion → search → proof →
  contract-verification → mint → indexer → public page path, run against a
  local chain (Anvil/Hardhat) and a small real π dataset slice.
* **E2E**: Playwright over the actual UI flow (§32), gated behind Phase 9
  (Hardening) once the product surface is stable enough to be worth
  locking down with browser tests.

## 7. Build order

Following spec §53 as-is: Foundation → π engine → Core product (search UX
without claiming) → Smart contract → Proof system → NFT metadata/artwork →
Social → Gamification → Hardening. The proof system (this document's core
subject) lands in Phase 5, but its *design* is fixed now, before Phase 1
code, specifically so the discoveryId/serialization/chunking decisions don't
have to be revisited or migrated later — they're shared, load-bearing
contracts between `pi-core`, `packages/contracts`, and `packages/proofs`
from day one.

## 8. Open engineering decisions made without further input (spec §57 rule 10)

* Chunk size 128 digits packed 4-bit/digit, max on-chain-provable match
  length 64 digits — benchmarked, not assumed; see `docs/proof-system.md`
  §3.1 and §4.
* Chain: Base for MVP, config-driven.
* Search index: FM-index, to be confirmed/adjusted after benchmarking.
* Verifier upgrade path: immutable, versioned verifier contracts per dataset
  version, not a swappable/upgradeable module — see `docs/proof-system.md`
  §3.6.
* Front-running: optional `commitClaim`/`revealClaim` path shipped alongside
  direct `claim()` from day one, used above a configurable rarity threshold
  — see `docs/proof-system.md` §3.7.
* Dataset generation: self-computed via a reproducible algorithm rather than
  an externally sourced file, for provenance reasons (§5 above); the
  regeneration/verification script ships in MVP, not deferred.
* Rarity UX: theoretical tier is shown separately from what's realistically
  discoverable in the currently indexed range — see `docs/rarity.md`.

These are documented decisions, not open questions — flag if any should be
revisited before Phase 1 begins.
