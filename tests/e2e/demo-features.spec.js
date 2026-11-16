const { test, expect } = require('@playwright/test');

async function openDemoDashboard(page) {
  await page.goto('/');
  await page.getByRole('button', { name: /open demo dashboard/i }).click();
  await expect(page.getByText('Welcome back, Jordan.')).toBeVisible();
}

test.describe('CS160 Bank demo features', () => {
  test('schedules and cancels bill payments', async ({ page }) => {
    await openDemoDashboard(page);
    await page.getByRole('button', { name: /Bill payments/ }).click();

    await expect(page.getByText('City Electric')).toBeVisible();
    await page.getByText('Cancel').first().click();
    await expect(page.getByText('The scheduled payment was canceled.')).toBeVisible();
    await expect(page.getByText('City Electric')).toHaveCount(0);
    await expect(page.getByText('Apartment Rent')).toBeVisible();

    await page.getByLabel('Payee').fill('E2E Internet');
    await page.getByLabel('Amount').fill('89.99');
    await page.getByLabel('Payment date').fill('2099-12-31');
    await page.getByRole('radio', { name: 'Monthly' }).click();
    await page.getByRole('button', { name: 'Schedule payment' }).click();

    await expect(page.getByText('Your payment was scheduled.')).toBeVisible();
    await expect(page.getByText('E2E Internet')).toBeVisible();
    await expect(page.getByText('$89.99')).toBeVisible();
  });

  test('filters transaction history by type and search text', async ({ page }) => {
    await openDemoDashboard(page);
    await page.getByRole('button', { name: /Activity/ }).click();

    await page.getByRole('radio', { name: 'Card purchase' }).click();
    await expect(page.getByText('Whole Foods Market')).toBeVisible();
    await expect(page.getByText('Corner coffee')).toBeVisible();
    await expect(page.getByText('Payroll direct deposit')).toHaveCount(0);

    await page.getByLabel('Search').fill('Whole Foods');
    await expect(page.getByText('Whole Foods Market')).toBeVisible();
    await expect(page.getByText('Corner coffee')).toHaveCount(0);
  });

  test('marks a notification as read', async ({ page }) => {
    await openDemoDashboard(page);
    await page.getByRole('button', { name: 'Notifications, 2 unread' }).click();

    await expect(page.getByText('Your payroll deposit of $3,250.00 is available.')).toBeVisible();
    await page.getByText('Your payroll deposit of $3,250.00 is available.').click();

    await expect(page.getByRole('button', { name: 'Notifications, 1 unread' })).toBeVisible();
  });

  test('searches ATM locations in demo mode', async ({ page }) => {
    await openDemoDashboard(page);
    await page.getByRole('button', { name: /Find an ATM/ }).click();

    await expect(page.getByText('Downtown Banking Center')).toBeVisible();
    await page.getByLabel('Location').fill('Oakland, CA');
    await page.getByRole('button', { name: 'Search ATMs' }).click();

    await expect(page.getByText('Showing sample ATM locations near San Francisco.')).toBeVisible();
    await expect(page.getByText('Market Street ATM')).toBeVisible();
  });
});
