# Threat Model

Scope: the path from user input to a minted NFT, and the integrity of
already-minted discoveries afterward. Out of scope for this pass: generic web
app hygiene (XSS/CSRF/etc.), which is handled by standard practice and noted
only where π-specific behavior interacts with it.

## 1. Assets being protected

* **Integrity of discoveries** — a minted NFT must correspond to a real,
  verifiable occurrence in the canonical π dataset.
* **Uniqueness of claims** — a given occurrence can be claimed at most once.
* **User funds/wallets** — never touched directly by the search flow; only
  at risk during the explicit mint transaction.
* **User input privacy** — raw search input (which may be a name, birthday,
  or something more sensitive despite warnings) must not leak beyond what's
  necessary.
* **Platform availability** — search must stay usable under load/abuse
  without becoming a vector for the other assets above.

## 2. Actors

* **Anonymous user** — searches without a wallet.
* **Claiming user** — connects a wallet and submits `claim()`.
* **Malicious user** — attempts to forge proofs, replay claims, or abuse
  endpoints.
* **Backend/API operator (us)** — trusted for *availability and search
  correctness as a convenience*, explicitly **not trusted** as the sole
  source of truth for what gets minted (see `docs/proof-system.md` §1).
* **Third-party verifier** — anyone running the open verification tooling
  independently of our backend.

## 3. Threats and mitigations

### T1 — Backend claims a false/incorrect occurrence
**Attack:** bug or compromise causes the API to return a `(position,
sequence)` pair that isn't actually in the canonical dataset.
**Mitigation:** the contract independently re-verifies the Merkle proof and
re-slices the claimed substring out of authenticated chunk data before
minting (`docs/proof-system.md` §3.3–3.4). A compromised backend can at
worst *refuse to serve* correct results (availability), not mint a false
discovery, because it cannot forge a Merkle proof against the on-chain root
without breaking `keccak256` preimage resistance.

### T2 — User submits a forged proof directly to the contract
**Attack:** bypass the backend entirely, submit a hand-crafted `claim()`
with fabricated chunk data / Merkle proof.
**Mitigation:** identical to T1 — the verifier doesn't distinguish between
"backend-provided" and "user-provided" proofs; it only accepts
cryptographically valid ones. This is intentional: it makes the backend a
convenience, not a privileged party.

### T3 — Dataset commitment itself is wrong (doesn't match real π)
**Attack:** the published Merkle root was computed from an incorrect or
tampered digit file, so all proofs against it are "valid" but meaningless.
**Mitigation:** not solved by the Merkle scheme itself — this is a disclosed
residual trust assumption. Mitigations: (a) dataset generation script,
source parameters, and the full chunked file are published so **anyone can
regenerate π independently and recompute the root**; (b) `datasetHash` is
recorded alongside `root` so a mismatch between "digits we say we used" and
"digits that hash to the registered root" is independently and immediately
detectable; (c) dataset versions are immutable and append-only — a bad
version can be deactivated for new claims but never silently edited (this
would invalidate the integrity guarantee for existing tokens, which the spec
explicitly forbids in §36). **Revised on review:** the independent
`independent-verify` script and reproducibility documentation ship as part
of MVP itself, not a later phase — this was originally scheduled as Phase 3
in the decentralization roadmap, but is too fundamental to the "don't trust
our server" claim to defer. This is the headline trust assumption of the
MVP and is called out, not hidden — see `docs/proof-system.md` §5 and the
decentralization roadmap in `docs/architecture.md`.

### T4 — Duplicate claim on the same occurrence
**Attack:** two users (or one user twice) try to mint the same
`(datasetVersion, position, sequence)`.
**Mitigation:** `discoveryId` is deterministic and content-addressed; the
contract's `claimed[discoveryId]` mapping is checked-then-set atomically
within `claim()`. Second transaction reverts. No off-chain component is
trusted for uniqueness.

### T5 — Discovery/claim race (front-running)
**Attack:** an attacker observes a pending `claim()` in the mempool and
submits the same discoveryId with higher gas to front-run it.
**Revised on review:** the original draft accepted this as a standard
public-mint race and stopped there. That understates the risk once rarity
and social mechanics are in play — a rare/legendary discovery is exactly the
case where someone would run a mempool-watching bot, and "someone stole my
π NFT" is a bad first viral moment. **Mitigation:** the contract ships an
optional `commitClaim`/`revealClaim` path from day one
(`docs/proof-system.md` §3.7) — the commit step reveals only a hash, not the
discovery or even which occurrence is targeted, so there is nothing for a
mempool observer to front-run. Direct `claim()` remains the MVP default for
ordinary (common/uncommon) finds, where racing isn't worth anyone's gas; the
frontend routes claims above a configurable rarity threshold through
commit-reveal instead. This is an additive claim path — it doesn't change
`discoveryId` derivation or the `claimed` mapping, so it needed no later
migration to add.

### T6 — Client-provided position/rarity/discoveryId trusted by the API
**Attack:** frontend sends a manipulated position or rarity tier to the
backend, which stores/serves it as if authoritative.
**Mitigation:** backend recomputes conversion, search, discoveryId, and
rarity server-side on every request; client-supplied values for these fields
are never persisted or trusted (§26/§29 of the spec). The contract doesn't
trust the backend either way (T1/T2), so this is defense-in-depth for
database/API integrity, not the core security boundary.

### T7 — Search endpoint abuse (DoS, scraping the full dataset via repeated queries)
**Attack:** high-volume automated querying to degrade service or
reconstruct large portions of the dataset through the API.
**Mitigation:** rate limiting per IP/session, response caching for popular
queries, and the dataset/index is never exposed as a bulk-downloadable API
response — only individual search results. (Bulk dataset access is instead
handled by the *intentional* public-download path in the decentralization
roadmap, served as a static file/torrent, not through the query API.)

### T8 — Sensitive user input persisted or put on-chain
**Attack:** a user searches something sensitive (phone number, SSN-like
pattern, private info) despite the UI warning, and it ends up stored or
minted into public metadata.
**Mitigation:** raw input is normalized/hashed as early as possible and not
persisted server-side beyond what's operationally required; NFT metadata
stores the normalized sequence/hash and an explicit user-controlled display
opt-in, never raw input by default (§15–16).

### T9 — Chain reorg / duplicate event processing corrupts the indexer's view
**Attack:** a reorg drops a `DiscoveryClaimed`/`Transfer` event the indexer
already processed, or the indexer double-processes a retried event.
**Mitigation:** indexing keyed by `(txHash, logIndex)` for idempotency,
confirmation-depth threshold before treating an event as final, and
reconciliation against on-chain state (`ownerOf`, `claimed[discoveryId]`) as
the source of truth rather than the event log alone.

### T10 — Admin dashboard compromise
**Attack:** unauthorized access to dataset activation/deactivation or
claim-pausing controls.
**Mitigation:** admin actions are access-controlled (role-gated, not just
UI-hidden), sensitive operations (deactivating a dataset, pausing claims)
are logged and require authenticated, audited requests; the admin surface
never has a path to mint on a user's behalf or alter already-claimed state.

### T11 — API error responses leaking internal details
**Found during the security review pass, not hypothetical:** a malformed
`tokenId` on `/api/metadata/:tokenId` (e.g. a non-numeric string) hit
Postgres directly, which threw a type-cast error (`invalid input syntax for
type bigint: "..."`) that Fastify's default error handling returned to the
client as a raw 500 — driver error code, exact internal message, and
implicitly, confirmation of the database engine and column type. Not
exploitable for data access on its own, but it's the kind of detail that
makes other attacks easier (schema fingerprinting, deciding where to spend
effort) and is unnecessary disclosure regardless.
**Mitigation (shipped):** (a) input validation on the affected routes
rejects non-numeric `tokenId`s with a clean `400` before ever reaching the
database; (b) a global Fastify error handler (`apps/api/src/app.ts`) now
catches everything else — any resulting 5xx response body is always exactly
`{"error":"internal_error"}`, with full detail (stack trace, driver error)
going only to the server-side log. Regression-tested in
`apps/api/test/metadata.test.ts`.

## 4. Explicitly out of scope for MVP (documented, not silently ignored)

* Full trustlessness of dataset *generation* (T3) — deferred to the
  decentralization roadmap, Phases 2–4.
* MEV/front-running protection beyond standard public-mint behavior (T5).
* Formal verification of the Solidity contracts (standard test + fuzz
  coverage only for MVP; see `docs/architecture.md` testing section).
