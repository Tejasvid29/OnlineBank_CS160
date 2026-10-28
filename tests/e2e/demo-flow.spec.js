const { test, expect } = require('@playwright/test');

async function openDemoDashboard(page) {
  await page.goto('/');
  await page.getByRole('button', { name: /open demo dashboard/i }).click();
  await expect(page.getByText('Welcome back, Jordan.')).toBeVisible();
}

test.describe('CS160 Bank demo flows', () => {
  test('logs in to the demo dashboard and shows the account overview', async ({ page }) => {
    await openDemoDashboard(page);

    await expect(page.getByText('Your accounts')).toBeVisible();
    await expect(page.getByText('Across 2 accounts')).toBeVisible();
    await expect(page.getByText('Move money')).toBeVisible();
    await expect(page.getByText('Recent activity')).toBeVisible();
  });

  test('can complete a transfer between accounts', async ({ page }) => {
    await openDemoDashboard(page);
    await page.getByText('Move money').click();

    await expect(page.getByText('Transfer money').nth(1)).toBeVisible();
    await page.getByLabel('Amount').fill('250.00');
    await page.getByText('Transfer money').nth(1).click();

    await expect(page.getByText('Transfer of $250.00 completed.')).toBeVisible();
    await expect(page.getByText('Your accounts')).toBeVisible();
  });
});
