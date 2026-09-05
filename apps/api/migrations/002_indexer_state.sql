-- Tracks the indexer's progress per contract, so restarts resume rather
-- than re-scanning from genesis (docs/architecture.md §30: idempotent indexing).
CREATE TABLE IF NOT EXISTS indexer_state (
    contract_address TEXT PRIMARY KEY,
    last_processed_block BIGINT NOT NULL
);
