# ROLE

You are a senior full-stack Web3 engineer, smart-contract engineer, cryptography engineer, product designer, and DevOps engineer.

Your task is to design and implement a production-quality MVP of a viral Web3 platform built around the digits of π (Pi).

The core concept:

> Users enter a number, word, phrase, date, username, or random text.
> The platform deterministically converts the input into a digit sequence, searches for that sequence inside the decimal expansion of π, and, when found, lets the user permanently claim that specific occurrence as an NFT.

The product should feel like a game first and crypto infrastructure second.

The experience should be:

**Enter → Search π → Discover → Claim → Mint → Share**

Do not build a generic NFT marketplace. Build a highly polished, playful "find your place in π" discovery game.

---

# 1. PRODUCT VISION

Working name:

**PI HUNTER**

The name can be changed later.

Core marketing concept:

> "Find your place in π."

Alternative:

> "Your number exists somewhere in infinity."

The platform should make users want to:

* search their birthday
* search their name
* search their lucky number
* search their phone number
* search random numbers
* search words
* compete for rare/long matches
* share discoveries
* collect multiple π discoveries
* beat their previous record

The primary viral loop is:

1. User discovers a match.
2. Platform presents a beautiful result card.
3. User claims/mints it.
4. User shares the card.
5. Friend clicks the card.
6. Friend searches their own number.
7. Friend discovers another match.
8. Repeat.

---

# 2. IMPORTANT PRODUCT PRINCIPLE

Do NOT make the NFT the center of the UX.

The discovery is the product.

The NFT is the permanent on-chain proof/collectible representing the discovery.

The platform should still be fun for users who do not connect a wallet.

Wallet connection should happen naturally when the user decides to claim/mint.

---

# 3. MVP USER FLOW

## Landing page

Hero:

"FIND YOUR PLACE IN π"

Subtitle:

"Enter anything. We'll search billions of digits of π to find where you belong."

Input:

"Enter a number, name, date, word, or anything..."

Primary button:

**FIND IT IN π**

Secondary CTA:

**How does it work?**

Show animated π digits in the background.

Include examples:

* 314159
* 123456
* 2001-09-11
* SATOSHI
* ALICE
* 777777
* "I LOVE PI"

Do not make unsupported mathematical claims.

---

# 4. INPUT CONVERSION SYSTEM

The platform must support multiple conversion modes.

## Mode A — Numbers

If the user enters:

123456

the normalized sequence is:

123456

Strip formatting where appropriate.

Examples:

12/03/1995

could become:

12031995

or allow the user to choose a date normalization mode.

---

## Mode B — Text

Text must be deterministically converted to digits.

Do NOT silently invent a proprietary conversion.

Implement clearly documented conversion modes.

At minimum:

### ASCII decimal encoding

Example concept:

A → 65
B → 66
C → 67

Concatenate decimal representations according to a deterministic rule.

### UTF-8 byte encoding

Convert UTF-8 bytes to decimal or another deterministic decimal representation.

### Hash mode

Hash the input using a cryptographic hash such as SHA-256.

Convert the hash deterministically into a decimal digit sequence.

The UI should explain:

> "Words aren't numbers, so choose how you'd like your input converted."

Allow users to see:

INPUT:

`ALICE`

MODE:

`SHA-256 → decimal`

RESULT:

`...`

The exact conversion algorithm must be documented and implemented identically by frontend, backend, and verification code.

---

# 5. π DATASET

Do NOT attempt to store billions/trillions of π digits directly on-chain.

π is deterministic and does not need to be replicated in a smart contract.

Instead build a canonical π dataset/indexing architecture.

For MVP:

* Obtain a trusted π digit dataset.
* Store it in chunked form.
* Create a canonical dataset version.
* Generate cryptographic commitments for chunks.
* Build a fast searchable index.

The system must record:

* π version
* number of digits
* dataset hash / commitment
* generation/source metadata
* chunk size
* indexing version

Example:

```text
Pi Dataset
Version: 1
Digits: 1,000,000,000
Chunk Size: 1,000,000
Root Commitment: 0x...
```

Do not claim the system searches "all of π".

The UI must accurately state the number of digits currently indexed.

For example:

> "Searching the first 1 billion digits of π."

---

# 6. π SEARCH ENGINE

Build a dedicated backend search service.

Requirements:

* extremely fast substring search
* support sequences of arbitrary practical length
* support millions of queries
* cache popular searches
* avoid loading the entire π dataset into memory unnecessarily
* support horizontal scaling

Evaluate appropriate indexing/search technologies.

Possible approaches:

* suffix arrays
* suffix automata
* FM-index
* BWT-based indexing
* database-backed chunk indexing
* memory-mapped files
* specialized substring search
* hybrid indexes

Choose the best approach based on benchmark results.

Do NOT blindly implement a naïve SQL LIKE query.

The search response should include:

```json
{
  "query": "123456",
  "normalized_input": "123456",
  "conversion_mode": "number",
  "found": true,
  "position": 123456789,
  "match_length": 6,
  "pi_dataset_version": "1",
  "digits_indexed": 1000000000
}
```

Positions must have an explicitly documented convention.

For example:

* decimal digits only
* position 1 = first digit after decimal point

Do not count the leading "3" unless explicitly specified.

---

# 7. MULTIPLE OCCURRENCES

A sequence can appear more than once.

Therefore:

DO NOT represent a discovery simply as:

"sequence = 123456"

Instead represent:

"sequence = 123456 at position X in π dataset version Y"

The NFT represents a specific occurrence.

Allow the search result to show:

> Found 17 occurrences.

Then optionally allow the user to choose one.

For MVP, the default can be the first occurrence.

Future versions can make position itself part of the game.

---

# 8. RARITY

Create an approximate rarity system based on match length.

For a random digit sequence of length N:

expected frequency is approximately:

10^N

Therefore:

3 digits ≈ 1 / 1,000

6 digits ≈ 1 / 1,000,000

9 digits ≈ 1 / 1,000,000,000

12 digits ≈ 1 / 1,000,000,000,000

However:

DO NOT describe this as proven empirical rarity unless statistically justified.

UI wording should say:

> "Theoretical rarity"

or

> "Expected probability"

Create rarity tiers:

COMMON
3–5 digits

UNCOMMON
6–8 digits

RARE
9–11 digits

EPIC
12–14 digits

LEGENDARY
15–19 digits

MYTHIC
20+ digits

Make these configurable.

---

# 9. RESULT SCREEN

After a successful search, create a dramatic reveal animation.

Example:

## FOUND IN π

Your sequence:

`314159`

was found at:

**position 482,193**

Match length:

**6 digits**

Theoretical rarity:

**1 in ~1,000,000**

Dataset:

**π v1 — first 1,000,000,000 digits**

Then show:

**CLAIM THIS DISCOVERY**

and:

**SEARCH AGAIN**

The reveal should feel exciting.

Use animated digits, transitions, counters, subtle particle effects, and a polished Web3 aesthetic.

---

# 10. DISCOVERY ID

Every claimable occurrence needs a deterministic identity.

Conceptually:

```text
discoveryId =
hash(
    piDatasetCommitment,
    piPosition,
    matchLength,
    sequence
)
```

The precise canonical serialization must be specified.

The same discovery must always produce the same ID.

The contract should use this ID to prevent duplicate claims.

---

# 11. ON-CHAIN ARCHITECTURE

Choose a low-cost EVM-compatible chain for MVP.

Do not hard-code a chain without evaluating:

* gas cost
* NFT support
* ecosystem
* RPC reliability
* wallet compatibility
* developer tooling
* long-term viability

Make the blockchain configuration environment-driven.

The smart contract must NOT store the entire π dataset.

---

# 12. SMART CONTRACT

Implement a secure NFT contract.

Use a well-audited standard such as ERC-721 unless there is a compelling reason to use another standard.

The contract should support:

## Claim / mint

Conceptually:

```solidity
claim(
    bytes32 discoveryId,
    uint256 position,
    uint256 matchLength,
    bytes32 sequenceHash,
    bytes calldata proof
)
```

Exact interface may differ after architecture design.

Requirements:

* prevent duplicate claims
* immutable discovery identity
* record π dataset commitment/version
* record position
* record match length
* record sequence hash
* assign NFT ownership
* emit detailed events

Example event:

```solidity
event DiscoveryClaimed(
    uint256 indexed tokenId,
    bytes32 indexed discoveryId,
    address indexed owner,
    uint256 position,
    uint256 matchLength,
    bytes32 sequenceHash
);
```

---

# 13. PROOF SYSTEM

This is a critical component.

The platform must not blindly trust the API server.

Design a mechanism allowing the smart contract or an independent verifier to establish that:

> At position X in the canonical π dataset, the claimed sequence actually occurs.

For MVP, investigate:

### Option 1

Merkleized π chunks.

### Option 2

Vector/Verkle-style commitment.

### Option 3

ZK proof of substring membership.

### Option 4

Hybrid approach.

Select the simplest secure architecture appropriate for the chosen chain.

Do not over-engineer the MVP if a transparent commitment system is sufficient.

Document the trust assumptions.

If full on-chain verification is too expensive, explicitly separate:

* cryptographic commitment
* proof verification
* mint authorization

and make the architecture upgradeable toward trustless verification.

---

# 14. IMPORTANT SECURITY REQUIREMENT

Never allow:

```text
frontend says "found"
→ backend says "found"
→ contract blindly mints
```

without a documented integrity model.

The backend can discover the match, but the protocol must have a verifiable relationship between:

* canonical π dataset
* sequence
* position
* discovery ID

---

# 15. NFT METADATA

Each NFT should have metadata similar to:

```json
{
  "name": "π Discovery #1234",
  "description": "A permanent claim to a specific occurrence in the digits of π.",
  "image": "ipfs://...",
  "attributes": [
    {
      "trait_type": "Position",
      "value": 482193
    },
    {
      "trait_type": "Match Length",
      "value": 6
    },
    {
      "trait_type": "Rarity Tier",
      "value": "Uncommon"
    },
    {
      "trait_type": "Conversion",
      "value": "Number"
    },
    {
      "trait_type": "π Dataset",
      "value": "Pi v1"
    }
  ]
}
```

The original user input may be sensitive.

Therefore DO NOT automatically put raw private user input on-chain.

Prefer:

* normalized sequence
* sequence hash
* optional public display text
* user-controlled privacy setting

---

# 16. PRIVACY

Never encourage users to enter sensitive information.

Add a subtle warning:

> "Don't enter passwords, private keys, financial information, or other sensitive data."

Do not store raw input unless necessary.

Default behavior:

* raw input stays client-side or is immediately discarded
* store only required normalized data / hashes
* NFT metadata should not expose sensitive input

---

# 17. WALLET FLOW

Users should not need a wallet to search.

Flow:

SEARCH

↓

FOUND

↓

CLAIM

↓

CONNECT WALLET

↓

SIGN / CONFIRM TRANSACTION

↓

MINTING

↓

SUCCESS

Wallet support should be implemented using a robust Web3 wallet connection library.

Support:

* injected wallets
* WalletConnect where appropriate
* mobile wallets

Do not require users to understand blockchain terminology.

Instead of:

"Submit transaction"

use:

**"Mint my discovery"**

During pending:

> "Your π discovery is becoming permanent..."

---

# 18. GAS / FEES

Make the minting economics configurable.

Support:

* free mint
* user pays gas
* protocol fee
* sponsored transaction / gasless mint

Do not assume users want to pay significant gas for a joke/game NFT.

Design the architecture so sponsored transactions can be added later.

If a mint fee exists:

Clearly disclose it before the transaction.

No hidden fees.

---

# 19. USER PROFILES

Allow users to create a profile based on wallet address.

Profile:

```text
PI HUNTER

Wallet
0x1234...5678

Discoveries
27

Longest Match
14 digits

Rarest Discovery
LEGENDARY

Furthest Position
928,472,819
```

Show owned discoveries.

Leaderboard:

* longest match
* rarest match
* furthest position
* most discoveries
* newest legendary discovery

Avoid rankings that reward spending money.

---

# 20. SOCIAL SHARING

This is one of the most important features.

Every discovery gets a public URL:

```text
/discovery/1234
```

The page should contain:

* sequence
* π position
* match length
* rarity
* owner
* dataset
* beautiful visualization

Generate an OG/social image.

Example:

```text
I FOUND MY PLACE IN π

314159

Position
482,193

6 DIGIT MATCH

UNCOMMON

Find yours →
```

Support sharing to:

* X
* Telegram
* Discord
* copy link
* generic Web Share API

The shared page should immediately explain the game.

---

# 21. VIRAL MECHANICS

Implement:

## Challenge

User can generate:

> "Can you beat my π score?"

Friend clicks.

Friend gets:

**BEAT 6 DIGITS**

and searches.

---

## Daily challenge

Every day:

**TODAY'S π CHALLENGE**

Example:

> Find a sequence of at least 10 digits.

Leaderboard resets daily.

---

## Random discovery

Button:

**SURPRISE ME**

Generate a random digit sequence and search it.

---

## Name challenge

Button:

**FIND MY NAME**

Ask for name → convert → search.

---

## Birthday challenge

Button:

**FIND YOUR BIRTHDAY IN π**

Convert date according to a documented format.

---

# 22. GAMIFICATION

Track:

* searches
* successful searches
* claims
* longest match
* total digits discovered
* achievements

Achievements:

FIRST FIND

LUCKY 7

10 DIGIT CLUB

π EXPLORER

LEGENDARY FIND

MYTHIC FIND

DEEP DIVER

π ADDICT

Do not create fake scarcity.

---

# 23. FRONTEND

Use a modern React-based framework such as Next.js.

Suggested stack:

* Next.js
* TypeScript
* Tailwind CSS
* modern component system
* viem
* wagmi or equivalent
* TanStack Query where useful
* Framer Motion or equivalent animation system

Use strict TypeScript.

No unnecessary dependencies.

---

# 24. DESIGN DIRECTION

Visual identity:

* mathematical
* futuristic
* playful
* premium
* mysterious
* slightly arcade-like

Avoid generic crypto aesthetics.

Do NOT make it look like:

* a DeFi dashboard
* a casino
* a generic NFT marketplace

Think:

**Google Search + arcade game + astronomical visualization + premium Web3 collectible**

Typography should be modern and highly readable.

π should be a major visual element.

Use motion carefully.

Mobile-first.

---

# 25. MAIN PAGES

Implement:

```text
/
```

Landing/search

```text
/search
```

Search interface

```text
/discovery/[id]
```

Public discovery

```text
/profile/[address]
```

User profile

```text
/leaderboard
```

Leaderboard

```text
/how-it-works
```

Technical explanation

```text
/faq
```

FAQ

```text
/terms
```

Terms

```text
/privacy
```

Privacy

---

# 26. API

Create a clean API layer.

Endpoints conceptually:

```text
POST /api/search
GET  /api/discovery/:id
GET  /api/profile/:address
GET  /api/leaderboard
POST /api/proof
POST /api/metadata
```

Use proper validation.

Rate-limit search endpoints.

Prevent abuse.

Never trust client-provided:

* position
* rarity
* sequence
* discovery ID
* ownership

Recalculate/verify server-side.

---

# 27. DATABASE

Use PostgreSQL or another production-grade relational database.

Suggested tables:

```text
users
searches
discoveries
claims
nfts
pi_datasets
pi_chunks
achievements
leaderboard_entries
```

Do not store unnecessary raw user input.

Add appropriate indexes.

Use migrations.

---

# 28. DATA MODEL

Discovery:

```text
id
discovery_id
sequence_hash
position
match_length
pi_dataset_id
conversion_method
created_at
claimed
token_id
owner
```

π Dataset:

```text
id
version
digit_count
chunk_size
root_commitment
dataset_hash
created_at
```

Claim:

```text
id
discovery_id
wallet_address
transaction_hash
token_id
claimed_at
```

---

# 29. ANTI-CHEAT

The backend must prevent users from submitting arbitrary fake discoveries.

Validation pipeline:

```text
user input
↓
canonical conversion
↓
search canonical π dataset
↓
obtain occurrence
↓
construct proof
↓
verify proof
↓
generate discovery ID
↓
check unclaimed
↓
mint
```

Never trust:

```text
position supplied by frontend
```

---

# 30. REORGANIZATION / BLOCKCHAIN INDEXING

Implement blockchain event indexing.

Listen for:

```text
DiscoveryClaimed
Transfer
```

Maintain database synchronization.

Handle:

* pending transactions
* failed transactions
* chain reorganizations where relevant
* duplicate event processing
* RPC failures
* retries

Make indexing idempotent.

---

# 31. SMART-CONTRACT SECURITY

Follow secure Solidity practices.

Include:

* OpenZeppelin contracts where appropriate
* reentrancy considerations
* access control
* replay protection
* duplicate claim prevention
* safe minting
* integer safety
* pausable emergency mechanism if justified
* upgradeability only if genuinely needed

Do not introduce upgradeability merely for convenience.

If upgradeable contracts are used, clearly document governance/admin risks.

Write comprehensive unit tests.

Add fuzz/property tests for critical functions.

---

# 32. TESTING

Implement:

## Unit tests

Frontend utilities:

* number normalization
* text conversion
* hash conversion
* position handling
* rarity calculation

Backend:

* search
* proof generation
* verification
* discovery ID generation

Smart contract:

* mint
* duplicate claim
* invalid proof
* invalid dataset
* ownership
* events
* edge cases

---

## Integration tests

Test:

```text
input
→ conversion
→ search
→ proof
→ contract verification
→ NFT mint
→ database index
→ public discovery page
```

---

## E2E tests

Use Playwright or equivalent.

Test:

1. User lands on homepage.
2. Enters number.
3. Search animation plays.
4. Match found.
5. User connects wallet.
6. User mints.
7. Transaction succeeds.
8. Discovery page appears.
9. Social share metadata works.

---

# 33. PERFORMANCE

The search service must be optimized.

Benchmark:

* 1,000 searches
* 10,000 searches
* concurrent searches
* long sequences
* repeated searches

Cache repeated searches.

Popular queries should become extremely fast.

Do not expose the entire π dataset through an API.

---

# 34. OBSERVABILITY

Implement:

* structured logs
* error tracking
* request IDs
* metrics
* search latency
* search success rate
* mint success rate
* RPC failures
* proof verification failures

Never log:

* private keys
* wallet signatures unnecessarily
* sensitive raw user inputs

---

# 35. ADMIN DASHBOARD

Create a simple protected admin interface.

Show:

* π dataset version
* indexed digits
* search count
* unique users
* discoveries
* claims
* minted NFTs
* failed transactions
* proof failures
* API health
* blockchain health

Allow:

* activate dataset
* deactivate dataset
* pause claiming if necessary

Admin operations must be strongly protected.

---

# 36. DATASET VERSIONING

This is critical.

π is fixed, but your dataset/index implementation can change.

Every discovery must identify the dataset.

Example:

```text
Pi v1
First 1,000,000,000 digits
```

Later:

```text
Pi v2
First 10,000,000,000 digits
```

A discovery from v1 remains valid forever.

Do not silently change the meaning of existing NFTs.

---

# 37. NFT IMAGE GENERATION

Create deterministic visual artwork.

The artwork should visually encode:

* π symbol
* sequence
* position
* match length
* rarity
* token/discovery number

Example composition:

```text
π

314159

POSITION
482,193

6 DIGITS

UNCOMMON
```

Artwork must be reproducible from canonical discovery data.

Prefer SVG or deterministic rendering where practical.

Store immutable metadata/artwork using decentralized storage where appropriate.

Do not rely solely on an API endpoint that can disappear.

---

# 38. PUBLIC VERIFICATION PAGE

Every NFT/discovery should have a verification section.

Example:

```text
DISCOVERY VERIFIED

Sequence
314159

Position
482,193

π Dataset
Pi v1

Dataset Commitment
0xABC...

Sequence Hash
0x123...

Owner
0xDEF...

NFT
#1234
```

Provide links to the blockchain explorer using the selected network.

---

# 39. DECENTRALIZATION ROADMAP

Build MVP architecture so the platform can eventually become more trustless.

Phase 1:

Centralized π index + cryptographic commitment + smart contract.

Phase 2:

Public downloadable π dataset.

Phase 3:

Independent verification tools.

Phase 4:

ZK or stronger trustless proof mechanism.

Phase 5:

Multiple independent indexers/verifiers.

The frontend should eventually be able to verify a discovery independently.

---

# 40. ECONOMIC MODEL

Do NOT create a token unless there is a legitimate reason.

The MVP does not require a platform token.

Possible future revenue:

* optional mint fee
* premium visual styles
* sponsored challenges
* collectibles
* partnerships
* leaderboard events

Avoid:

* artificial token speculation
* pay-to-win
* gambling mechanics
* promises of financial returns

The platform should work as a fun collectible game without a speculative token.

---

# 41. LEGAL / PRODUCT SAFETY

Do not market discoveries as investments.

NFT ownership should represent ownership of the token/collectible, not ownership of π itself.

Clearly state:

> "You do not own π or the mathematical sequence itself. You own a blockchain token representing a specific recorded occurrence."

Do not imply financial appreciation.

Add appropriate disclaimers and terms.

---

# 42. README

Create a comprehensive README containing:

* product overview
* architecture
* local development
* environment variables
* database setup
* π dataset setup
* indexing
* smart contracts
* deployment
* testing
* proof architecture
* security assumptions
* limitations
* roadmap

---

# 43. MONOREPO

Use a clean monorepo structure.

Example:

```text
/apps
  /web
  /api
  /indexer
  /admin

/packages
  /contracts
  /pi-core
  /pi-search
  /proofs
  /types
  /ui
  /config

/infrastructure
  /docker
  /terraform

/docs
```

Adapt this structure if a better architecture emerges.

---

# 44. ENVIRONMENT VARIABLES

Use `.env.example`.

Never commit secrets.

Examples:

```text
DATABASE_URL=
RPC_URL=
CHAIN_ID=
DEPLOYER_PRIVATE_KEY=
NFT_CONTRACT_ADDRESS=
PI_DATASET_PATH=
PI_DATASET_HASH=
STORAGE_PROVIDER=
STORAGE_BUCKET=
```

Never expose private keys to frontend code.

---

# 45. LOCAL DEVELOPMENT

The entire project must run locally with documented commands.

Ideally:

```bash
pnpm install
pnpm dev
```

Provide Docker configuration for:

* PostgreSQL
* API
* π indexer
* web

Provide a local blockchain environment for contract development/testing.

---

# 46. DEPLOYMENT

Document production deployment for:

Frontend:

* Vercel or equivalent

Backend:

* containerized deployment

Database:

* managed PostgreSQL

π index:

* dedicated persistent storage

Blockchain:

* selected production EVM chain

Storage:

* IPFS-compatible decentralized storage

Do not hard-code vendor-specific architecture unnecessarily.

---

# 47. UX DETAILS

The site must be fast.

Homepage should load quickly.

Search should feel instantaneous even if backend work takes time.

Use a staged animation:

```text
Analyzing input...
Converting...
Searching π...
Scanning...
Match found!
```

Do not fake search results.

The animation can be visual, but the result must correspond to a real backend search.

---

# 48. ERROR STATES

Design polished errors.

Examples:

No match in indexed range:

> "Not found... yet."

Then:

> "We searched the first 1 billion digits of π."

API failure:

> "π is being difficult right now. Try again."

Wallet rejected:

> "Mint cancelled. Your discovery is still waiting for you."

Already claimed:

> "Someone got there first."

Invalid input:

> "Give us something we can turn into digits."

---

# 49. SEARCH HISTORY

For wallet-connected users:

Show recent discoveries/searches.

For anonymous users:

Store locally where possible.

Allow:

* search again
* compare results
* claim later

Do not require an account/password.

---

# 50. SEO

Create strong metadata for:

* homepage
* discovery pages
* leaderboard
* educational pages

Discovery pages should generate dynamic Open Graph metadata.

Example:

Title:

"314159 — Found at position 482,193 in π"

Description:

"Discover your place in the digits of π."

---

# 51. ACCESSIBILITY

Implement:

* keyboard navigation
* screen-reader labels
* sufficient contrast
* reduced-motion mode
* focus states
* accessible dialogs
* mobile usability

Animations must not make the site unusable.

---

# 52. ANALYTICS

Track anonymous product events:

```text
landing_view
search_started
search_completed
match_found
wallet_connected
claim_started
claim_completed
share_clicked
challenge_created
```

Do not collect unnecessary personal information.

---

# 53. BUILD ORDER

Do not try to build everything simultaneously.

Implement in this order:

## Phase 1 — Foundation

* monorepo
* TypeScript
* Next.js
* database
* basic UI
* environment configuration

## Phase 2 — π engine

* dataset ingestion
* dataset hashing
* indexing
* search API
* benchmark

## Phase 3 — Core product

* input conversion
* search UI
* result screen
* discovery IDs
* rarity

## Phase 4 — Smart contract

* NFT contract
* tests
* deployment scripts
* claim flow

## Phase 5 — Proof system

* canonical dataset commitment
* proof generation
* proof verification
* integration

## Phase 6 — NFT

* metadata
* artwork
* decentralized storage
* token pages

## Phase 7 — Social

* discovery pages
* OG images
* sharing
* challenges

## Phase 8 — Gamification

* profiles
* leaderboards
* achievements
* daily challenge

## Phase 9 — Hardening

* security
* rate limiting
* monitoring
* error handling
* performance
* E2E tests

---

# 54. ACCEPTANCE CRITERIA

The MVP is not complete until the following works end-to-end.

### Scenario 1

User enters:

```text
123456
```

System converts it to:

```text
123456
```

System searches canonical π dataset.

System returns an actual position.

UI displays the match.

---

### Scenario 2

User enters:

```text
ALICE
```

User selects conversion mode.

System deterministically converts ALICE into digits.

System searches π.

UI displays the conversion and result.

---

### Scenario 3

User claims a discovery.

Wallet connects.

Transaction is sent.

NFT is minted.

Discovery becomes associated with wallet.

---

### Scenario 4

Someone tries to claim the same occurrence again.

Contract rejects it.

---

### Scenario 5

User shares the discovery URL.

Another user opens it.

They see:

* sequence
* position
* rarity
* owner
* NFT
* explanation

and can immediately click:

**FIND YOUR PLACE IN π**

---

# 55. CRITICAL ENGINEERING RULES

Never:

* fake search results
* invent π positions
* claim to search more digits than are actually indexed
* store unnecessary sensitive user data
* put private keys in frontend code
* trust frontend-provided positions
* allow duplicate discovery claims
* silently change dataset versions
* put the full π expansion on-chain
* create a token simply because the project is crypto
* make financial-return claims

Always:

* use deterministic algorithms
* version the dataset
* hash/commit canonical data
* verify claims
* test smart contracts thoroughly
* document trust assumptions
* make ownership verifiable on-chain
* make discoveries shareable
* keep search usable without a wallet

---

# 56. DELIVERABLES

At the end of implementation provide:

1. Complete source code.
2. Smart contracts.
3. Contract tests.
4. Backend.
5. Frontend.
6. π indexing/search engine.
7. Proof system.
8. Database schema/migrations.
9. NFT metadata generator.
10. NFT artwork generator.
11. Admin dashboard.
12. E2E tests.
13. Docker setup.
14. Deployment scripts.
15. `.env.example`.
16. README.
17. Architecture documentation.
18. Security assumptions.
19. Threat model.
20. Deployment checklist.

---

# 57. DEVELOPMENT PROCESS

Before writing significant code:

1. Analyze the complete specification.
2. Identify architectural uncertainties.
3. Compare at least two approaches for the π proof/indexing architecture.
4. Choose the simplest architecture that provides strong integrity.
5. Document the decision.
6. Create the repository structure.
7. Implement incrementally.
8. Run tests after every major subsystem.
9. Benchmark the π search engine.
10. Perform a security review before calling the MVP complete.

Do not ask unnecessary questions.

When a choice is unspecified, make a reasonable engineering decision and document it.

If a requirement is technically impossible or economically unreasonable, do not fake an implementation. Explain the issue and implement the closest secure alternative.

---

# 58. FINAL PRODUCT TEST

Pretend you are a first-time user.

Open the homepage.

Ask yourself:

> "Do I immediately understand what this does?"

Then:

> "Do I want to type something?"

Then:

> "Did I get an exciting discovery?"

Then:

> "Do I want to share it?"

Then:

> "Do I understand why I might want to mint it?"

If the answer to any is no, improve the UX.

The final product should feel like a **viral internet game that happens to have permanent on-chain collectibles**, not like a blockchain application trying to convince people to use it.

The core emotional moment is:

# "WAIT... MY NUMBER IS ACTUALLY IN π."

Build the entire product around that moment.
