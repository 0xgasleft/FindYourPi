import "dotenv/config";
import { createPublicClient, http, type Log } from "viem";
import { Pool } from "pg";
import { piHunterNFTAbi } from "@pi-hunter/types";

const RPC_URL = process.env.RPC_URL ?? "http://127.0.0.1:8545";
const NFT_CONTRACT_ADDRESS = process.env.NFT_CONTRACT_ADDRESS as `0x${string}` | undefined;
const DATABASE_URL = process.env.DATABASE_URL;
const POLL_INTERVAL_MS = Number(process.env.INDEXER_POLL_INTERVAL_MS ?? 4000);
// Reorg safety margin (docs/threat-model.md T9)  -  only process blocks at
// least this many confirmations deep. Small for local/testnet dev, should
// be raised for mainnet-grade chains.
const CONFIRMATIONS = BigInt(process.env.INDEXER_CONFIRMATIONS ?? 2);
const MAX_BLOCK_RANGE = 2000n;

if (!NFT_CONTRACT_ADDRESS) throw new Error("NFT_CONTRACT_ADDRESS is not set");
if (!DATABASE_URL) throw new Error("DATABASE_URL is not set");

const pool = new Pool({ connectionString: DATABASE_URL });
const client = createPublicClient({ transport: http(RPC_URL) });

async function getLastProcessedBlock(): Promise<bigint> {
  const { rows } = await pool.query("SELECT last_processed_block FROM indexer_state WHERE contract_address = $1", [
    NFT_CONTRACT_ADDRESS!.toLowerCase(),
  ]);
  if (rows.length > 0) return BigInt(rows[0].last_processed_block);
  const startBlock = BigInt(process.env.INDEXER_START_BLOCK ?? 0);
  await pool.query("INSERT INTO indexer_state (contract_address, last_processed_block) VALUES ($1, $2)", [
    NFT_CONTRACT_ADDRESS!.toLowerCase(),
    startBlock.toString(),
  ]);
  return startBlock;
}

async function setLastProcessedBlock(block: bigint) {
  await pool.query("UPDATE indexer_state SET last_processed_block = $1 WHERE contract_address = $2", [
    block.toString(),
    NFT_CONTRACT_ADDRESS!.toLowerCase(),
  ]);
}

async function processDiscoveryClaimed(log: Log & { args: any }) {
  const { tokenId, discoveryId, owner, position, matchLength } = log.args;
  const txHash = log.transactionHash!;
  const logIndex = log.logIndex!;
  const blockNumber = log.blockNumber!;

  // Idempotent: unique (transaction_hash, log_index) means a re-processed
  // log (e.g. after a restart re-scans a not-yet-advanced range) is a no-op.
  const inserted = await pool.query(
    `INSERT INTO claims (discovery_id, wallet_address, transaction_hash, token_id, block_number, log_index)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (transaction_hash, log_index) DO NOTHING
     RETURNING id`,
    [discoveryId, owner.toLowerCase(), txHash, tokenId.toString(), blockNumber.toString(), logIndex]
  );
  if (inserted.rows.length === 0) {
    console.log(`[indexer] claim already recorded, skipping: ${txHash}#${logIndex}`);
    return;
  }

  await pool.query(
    `UPDATE discoveries SET claimed = true, token_id = $1, owner_address = $2 WHERE discovery_id = $3`,
    [tokenId.toString(), owner.toLowerCase(), discoveryId]
  );
  await pool.query(
    `INSERT INTO nfts (token_id, discovery_id, owner_address) VALUES ($1, $2, $3)
     ON CONFLICT (token_id) DO UPDATE SET owner_address = EXCLUDED.owner_address, updated_at = now()`,
    [tokenId.toString(), discoveryId, owner.toLowerCase()]
  );

  console.log(`[indexer] recorded claim: token #${tokenId} discovery ${discoveryId} owner ${owner} (position ${position}, length ${matchLength})`);
}

async function processTransfer(log: Log & { args: any }) {
  const { to, tokenId } = log.args;
  // Covers post-mint transfers; the mint transfer is redundant with
  // DiscoveryClaimed's owner (same address) but harmless to also apply here.
  await pool.query(`UPDATE nfts SET owner_address = $1, updated_at = now() WHERE token_id = $2`, [to.toLowerCase(), tokenId.toString()]);
  await pool.query(`UPDATE discoveries SET owner_address = $1 WHERE token_id = $2`, [to.toLowerCase(), tokenId.toString()]);
}

async function tick() {
  const lastProcessed = await getLastProcessedBlock();
  const latest = await client.getBlockNumber();
  const safeBlock = latest > CONFIRMATIONS ? latest - CONFIRMATIONS : 0n;
  if (safeBlock <= lastProcessed) return;

  const fromBlock = lastProcessed + 1n;
  const toBlock = safeBlock - fromBlock > MAX_BLOCK_RANGE ? fromBlock + MAX_BLOCK_RANGE : safeBlock;

  const claimedLogs = await client.getContractEvents({
    address: NFT_CONTRACT_ADDRESS!,
    abi: piHunterNFTAbi,
    eventName: "DiscoveryClaimed",
    fromBlock,
    toBlock,
  });
  for (const log of claimedLogs) await processDiscoveryClaimed(log as any);

  const transferLogs = await client.getContractEvents({
    address: NFT_CONTRACT_ADDRESS!,
    abi: piHunterNFTAbi,
    eventName: "Transfer",
    fromBlock,
    toBlock,
  });
  for (const log of transferLogs) await processTransfer(log as any);

  await setLastProcessedBlock(toBlock);
  if (claimedLogs.length > 0 || transferLogs.length > 0) {
    console.log(`[indexer] processed blocks ${fromBlock}-${toBlock}: ${claimedLogs.length} claims, ${transferLogs.length} transfers`);
  }
}

async function main() {
  console.log(`[indexer] watching ${NFT_CONTRACT_ADDRESS} on ${RPC_URL}, polling every ${POLL_INTERVAL_MS}ms`);
  for (;;) {
    try {
      await tick();
    } catch (err) {
      console.error("[indexer] tick failed, will retry", err);
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
