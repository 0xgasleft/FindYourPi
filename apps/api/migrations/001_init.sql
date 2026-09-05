-- Pi Hunter initial schema.
--
-- Deliberately deviates from the spec's suggested table list (§27) in one
-- way: there is no `pi_chunks` table. π chunk data and Merkle proof material
-- live in packages/pi-search's on-disk dataset files (raw digits + packed
-- chunks + suffix array), not in Postgres — that's a deliberate
-- architectural choice (docs/architecture.md), not an oversight. This
-- database stores product/protocol state: search history, discoveries,
-- claims, and gamification data.

CREATE TABLE IF NOT EXISTS pi_datasets (
    id                SERIAL PRIMARY KEY,
    version           INTEGER NOT NULL UNIQUE,
    digit_count       BIGINT NOT NULL,
    chunk_size_digits INTEGER NOT NULL,
    merkle_root       TEXT NOT NULL,
    dataset_hash      TEXT NOT NULL,
    verifier_address  TEXT,
    registry_address  TEXT,
    nft_address       TEXT,
    active            BOOLEAN NOT NULL DEFAULT true,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
    id              SERIAL PRIMARY KEY,
    wallet_address  TEXT NOT NULL UNIQUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Search history. `raw_input` is intentionally absent — see docs/threat-model.md
-- T8 and spec §16: raw user input is not persisted by default.
CREATE TABLE IF NOT EXISTS searches (
    id                SERIAL PRIMARY KEY,
    conversion_mode   TEXT NOT NULL,
    normalized_sequence TEXT NOT NULL,
    found             BOOLEAN NOT NULL,
    position          BIGINT,
    match_length      INTEGER,
    pi_dataset_version INTEGER NOT NULL,
    wallet_address    TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_searches_created_at ON searches (created_at);

-- One row per unique (dataset_version, position, match_length, sequence_hash)
-- discovery — this is what /api/discovery/:id reads, and what a claim
-- transaction ultimately references (see docs/proof-system.md §3.5/§3.8).
CREATE TABLE IF NOT EXISTS discoveries (
    id                  SERIAL PRIMARY KEY,
    discovery_id        TEXT NOT NULL UNIQUE, -- 0x-prefixed bytes32 hex
    sequence             TEXT NOT NULL,        -- digit string, e.g. "314159"
    sequence_hash        TEXT NOT NULL,
    position             BIGINT NOT NULL,
    match_length          INTEGER NOT NULL,
    pi_dataset_version    INTEGER NOT NULL REFERENCES pi_datasets (version),
    conversion_method     TEXT NOT NULL,
    rarity_tier           TEXT NOT NULL,
    display_text          TEXT, -- optional, user-controlled public label (spec §15) — never raw sensitive input by default
    claimed               BOOLEAN NOT NULL DEFAULT false,
    token_id              BIGINT,
    owner_address         TEXT,
    created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_discoveries_owner ON discoveries (owner_address);
CREATE INDEX IF NOT EXISTS idx_discoveries_match_length ON discoveries (match_length);

-- Populated by apps/indexer from on-chain DiscoveryClaimed/Transfer events —
-- the authoritative record of what actually got claimed on-chain, kept
-- separate from `discoveries` (which can exist unclaimed) per docs/proof-system.md §3.8.
CREATE TABLE IF NOT EXISTS claims (
    id                SERIAL PRIMARY KEY,
    discovery_id      TEXT NOT NULL REFERENCES discoveries (discovery_id),
    wallet_address    TEXT NOT NULL,
    transaction_hash  TEXT NOT NULL UNIQUE,
    token_id          BIGINT NOT NULL,
    block_number      BIGINT NOT NULL,
    log_index         INTEGER NOT NULL,
    claimed_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (transaction_hash, log_index)
);

CREATE TABLE IF NOT EXISTS nfts (
    id            SERIAL PRIMARY KEY,
    token_id      BIGINT NOT NULL UNIQUE,
    discovery_id  TEXT NOT NULL REFERENCES discoveries (discovery_id),
    owner_address TEXT NOT NULL,
    metadata_uri  TEXT,
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS achievements (
    id              SERIAL PRIMARY KEY,
    wallet_address  TEXT NOT NULL,
    achievement_key TEXT NOT NULL,
    earned_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (wallet_address, achievement_key)
);

CREATE TABLE IF NOT EXISTS leaderboard_entries (
    id              SERIAL PRIMARY KEY,
    wallet_address  TEXT NOT NULL,
    metric          TEXT NOT NULL, -- 'longest_match' | 'rarest' | 'furthest_position' | 'most_discoveries'
    value           BIGINT NOT NULL,
    discovery_id    TEXT REFERENCES discoveries (discovery_id),
    period          TEXT NOT NULL DEFAULT 'all_time', -- 'all_time' | 'YYYY-MM-DD' for daily
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (wallet_address, metric, period)
);
CREATE INDEX IF NOT EXISTS idx_leaderboard_metric_period ON leaderboard_entries (metric, period, value DESC);
