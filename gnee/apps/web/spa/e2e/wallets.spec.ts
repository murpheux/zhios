import { expect, test } from "@playwright/test";
import { GraphQLErrorResponse, mockOidcSession, mockZumaGateway, SAMPLE_WALLET, TESTNET_DESTINATION } from "./helpers";

test.beforeEach(async ({ page }) => {
  await mockOidcSession(page);
});

test("lists wallets and navigates to wallet detail", async ({ page }) => {
  await mockZumaGateway(page, {
    Wallets: () => ({
      wallets: { items: [SAMPLE_WALLET], pageInfo: { total: 1, page: 1, limit: 25, totalPages: 1 } },
    }),
    Wallet: () => ({ wallet: SAMPLE_WALLET }),
    Transactions: () => ({
      transactions: { items: [], pageInfo: { total: 0, page: 1, limit: 25, totalPages: 0 } },
    }),
  });

  await page.goto("/");
  await expect(page.getByText("Primary hot wallet")).toBeVisible();

  await page.getByText("Primary hot wallet").click();
  await expect(page.getByRole("heading", { name: "Primary hot wallet" })).toBeVisible();
  await expect(page.getByText("tb1qexampleaddress")).toBeVisible();
});

test("creates a wallet and lands on its detail page", async ({ page }) => {
  await mockZumaGateway(page, {
    Wallets: () => ({ wallets: { items: [], pageInfo: { total: 0, page: 1, limit: 25, totalPages: 0 } } }),
    CreateWallet: () => ({ createWallet: SAMPLE_WALLET }),
    Wallet: () => ({ wallet: SAMPLE_WALLET }),
    Transactions: () => ({
      transactions: { items: [], pageInfo: { total: 0, page: 1, limit: 25, totalPages: 0 } },
    }),
  });

  await page.goto("/");
  await page.getByText("+ New wallet").click();

  await expect(page.getByText(/owner user id/i)).toHaveCount(0);
  await page.getByPlaceholder("Primary hot wallet").fill("Primary hot wallet");
  await page.getByText("Create wallet").click();

  await expect(page.getByRole("heading", { name: "Primary hot wallet" })).toBeVisible();
});

test("sends a transaction through the review step with one idempotency key", async ({ page }) => {
  const keys: unknown[] = [];
  await mockZumaGateway(page, {
    Wallet: () => ({ wallet: SAMPLE_WALLET }),
    Transactions: () => ({
      transactions: { items: [], pageInfo: { total: 0, page: 1, limit: 25, totalPages: 0 } },
    }),
    CreateTransaction: (variables) => {
      const input = variables.input as { idempotencyKey: string; amount: string };
      keys.push(input.idempotencyKey);
      // First attempt fails transiently; the retry must reuse the same key.
      if (keys.length === 1) {
        return new GraphQLErrorResponse([{ message: "Internal server error", extensions: { code: "INTERNAL_ERROR" } }]);
      }
      return {
        createTransaction: {
          id: "tx-1",
          walletId: SAMPLE_WALLET.id,
          txid: null,
          type: "SEND",
          amount: input.amount,
          feeRate: "8",
          status: "PENDING",
          confirmations: 0,
          createdAt: "",
          updatedAt: "",
        },
      };
    },
  });

  await page.goto(`/wallets/${SAMPLE_WALLET.id}`);
  await page.getByText("Send →").click();

  await page.getByLabel(/Destination address/).fill(TESTNET_DESTINATION);
  await page.getByLabel("Amount (BTC)").fill("0.0005");
  await page.getByRole("button", { name: "Review send" }).click();

  await expect(page.getByRole("heading", { name: "Review and confirm" })).toBeVisible();
  await expect(page.getByText("0.00050000 BTC (50,000 sats)")).toBeVisible();

  await page.getByRole("button", { name: "Confirm and send" }).click();
  await expect(page.getByRole("alert")).toContainText("Something went wrong on our side");
  await page.getByRole("button", { name: "Retry send" }).click();

  await expect(page).toHaveURL(`/wallets/${SAMPLE_WALLET.id}`);
  await expect(page.getByRole("status")).toContainText("Transaction submitted");
  expect(keys).toHaveLength(2);
  expect(keys[0]).toBe(keys[1]);
});
