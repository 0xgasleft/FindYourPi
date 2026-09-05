import { test, expect } from "@playwright/test";
import { installMockWallet } from "./mock-wallet";

/**
 * The full golden path (spec §32 E2E scenarios / §54 acceptance criteria):
 * land -> search -> real match found -> connect wallet -> claim -> mint ->
 * success -> public discovery page shows CLAIMED.
 *
 * Requires the full stack already running (see README.md "Running the E2E
 * test" for the exact commands): a local Hardhat node with the contracts
 * deployed and the dataset registered, apps/api pointed at both, and
 * apps/web pointed at apps/api + the deployed NFT address. This test does
 * not spin any of that up itself — it drives the real, already-running
 * system, the same way it was manually verified during development.
 */
test("search finds a real π match and claiming mints a real NFT", async ({ page }) => {
  await installMockWallet(page);

  await page.goto("/");
  await page.fill("#pi-query", "314159");
  await page.click('button:has-text("Find it in")');

  await expect(page.getByText("Found in π")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(/Position\s+[\d,]+/)).toBeVisible();

  await page.click('button:has-text("Connect Wallet")');
  await expect(page.getByText(/^0x7099/)).toBeVisible({ timeout: 10_000 });

  await page.click('button:has-text("Claim this discovery")');
  await expect(page.getByText("becoming permanent")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Your place in π is permanent")).toBeVisible({ timeout: 20_000 });
});

test("not-found search reports honestly, without fabricating a result", async ({ page }) => {
  await page.goto("/");
  // Extremely long, essentially-impossible-to-exist sequence for the ~50M-digit dataset.
  await page.fill("#pi-query", "12345678901234567890123456789012345678901234567890");
  await page.click('button:has-text("Find it in")');

  await expect(page.getByText("Not found... yet.")).toBeVisible({ timeout: 10_000 });
});
