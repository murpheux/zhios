import { expect, test } from "@playwright/test";
import { mockOidcSession, mockZumaGateway, SAMPLE_WALLET } from "./helpers";

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

  await page.getByPlaceholder("Primary hot wallet").fill("Primary hot wallet");
  await page.getByPlaceholder("user-123").fill("user-123");
  await page.getByText("Create wallet").click();

  await expect(page.getByRole("heading", { name: "Primary hot wallet" })).toBeVisible();
});

test("sends a transaction from a wallet's detail page", async ({ page }) => {
  await mockZumaGateway(page, {
    Wallet: () => ({ wallet: SAMPLE_WALLET }),
    Transactions: () => ({
      transactions: { items: [], pageInfo: { total: 0, page: 1, limit: 25, totalPages: 0 } },
    }),
    CreateTransaction: () => ({
      createTransaction: {
        id: "tx-1",
        walletId: SAMPLE_WALLET.id,
        txid: null,
        type: "send",
        amount: "5000",
        feeRate: "8",
        status: "pending",
        confirmations: 0,
        rawTx: null,
        createdAt: "",
        updatedAt: "",
      },
    }),
  });

  await page.goto(`/wallets/${SAMPLE_WALLET.id}`);
  await page.getByText("Send →").click();

  await page.getByPlaceholder("tb1q...").fill("tb1qdestinationaddress");
  await page.getByPlaceholder("15000").fill("5000");
  await page.getByText("Send", { exact: true }).click();

  await expect(page).toHaveURL(`/wallets/${SAMPLE_WALLET.id}`);
});
