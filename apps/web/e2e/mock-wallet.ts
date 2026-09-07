import type { Page } from "@playwright/test";

/**
 * Injects a minimal EIP-1193 provider backed by a Hardhat node's unlocked
 * default account  -  Hardhat's test accounts can send transactions via plain
 * `eth_sendTransaction` with no private key/signature needed, so this is
 * just a thin proxy to the node's own JSON-RPC endpoint. This is how the
 * full claim flow (connect -> claim -> mint -> success) was actually
 * verified end-to-end during development  -  see README.md "Running the E2E test".
 */
export async function installMockWallet(page: Page, rpcUrl = "http://127.0.0.1:8545", account = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8") {
  await page.addInitScript(
    ({ rpcUrl, account }) => {
      (window as any).ethereum = (function () {
        const listeners: Record<string, Array<(...args: unknown[]) => void>> = {};
        return {
          isMetaMask: true,
          on(event: string, cb: (...args: unknown[]) => void) {
            (listeners[event] ??= []).push(cb);
          },
          removeListener(event: string, cb: (...args: unknown[]) => void) {
            listeners[event] = (listeners[event] ?? []).filter((c) => c !== cb);
          },
          async request({ method, params }: { method: string; params?: unknown[] }) {
            if (method === "eth_requestAccounts" || method === "eth_accounts") return [account];
            if (method === "wallet_switchEthereumChain" || method === "wallet_addEthereumChain") return null;
            const res = await fetch(rpcUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params: params ?? [] }),
            });
            const json = await res.json();
            if (json.error) throw new Error(json.error.message || JSON.stringify(json.error));
            return json.result;
          },
        };
      })();
    },
    { rpcUrl, account }
  );
  return account;
}
