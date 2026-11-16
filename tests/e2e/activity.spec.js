const { test, expect } = require('@playwright/test');
const loginEmail = process.env.E2E_TEST_EMAIL;
const loginPassword = process.env.E2E_TEST_PASSWORD;

async function loginTestUser(page) {
  await page.goto('/');
  const loginPromise = page.waitForResponse(response =>
    response.url().includes('/auth/login') &&
    response.request().method() === 'POST'
  );
  await page.getByLabel('Email address').fill(loginEmail);
  await page.getByLabel('Password', { exact: true }).fill(loginPassword);
  await page.getByRole('button', {
    name: 'Sign in'
  }).click();

  const loginResponse = await loginPromise;
  expect(loginResponse.status()).toBe(200);

  const { access_token } = await loginResponse.json();
  return access_token;
}

test('successfully displays transaction history', async ({ page, request }) => {
  const access_token = await loginTestUser(page);
  const accountsResponse = await request.get(
    'http://127.0.0.1:8000/accounts',
    {
      headers: {
        Authorization: 'Bearer ' + access_token
      }
    }
  );
  expect(accountsResponse.status()).toBe(200);
  const { accounts } = await accountsResponse.json();
  let transactions = [];

  for (const account of accounts) {
    const response = await request.get(
      'http://127.0.0.1:8000/accounts/' + account.id + '/transactions',
      {
        headers: {
          Authorization: 'Bearer ' + access_token
        }
      }
    );
    expect(response.status()).toBe(200);
    const data = await response.json();
    transactions.push(...data.transactions);
  }
  expect(transactions.length).toBeGreaterThan(0);
  await page.getByText('Activity', { exact: true }).click();
  await expect(page.getByText('Transaction history', { exact: true })).toBeVisible();
  await page.getByRole('radio', {
    name: 'All accounts',
    exact: true
  }).click();
  await expect(page.getByText(
    transactions[0].description,
    { exact: true }
  ).first()).toBeVisible();
});

test('successfully searches transactions by description', async ({ page }) => {
  await loginTestUser(page);
  await page.getByText('Activity', { exact: true }).click();
  await expect(page.getByText('Transaction history', { exact: true })).toBeVisible();

  await page.getByRole('radio', {
    name: 'All accounts',
    exact: true
  }).click();
  await page.getByLabel('Search', { exact: true }).fill('E2E deposit test');
  await expect(page.getByText('E2E deposit test', {
    exact: true
  }).first()).toBeVisible();
  await page.getByLabel('Search', { exact: true }).fill('NonexistentTransaction123');

  await expect(page.getByText(
    'No transactions match these filters.',
    { exact: true }
  )).toBeVisible();
  await page.getByLabel('Search', { exact: true }).clear();

  await expect(page.getByText('E2E deposit test', {
    exact: true
  }).first()).toBeVisible();
});

test('successfully filters transactions by type', async ({ page }) => {
  await loginTestUser(page);
  
  await page.getByText('Activity', { exact: true }).click();

  await expect(page.getByText('Transaction history', { exact: true })).toBeVisible();

  await page.getByRole('radio', {name: 'All accounts', exact: true}).click();

  await page.getByRole('radio', {name: 'Deposit',exact: true }).click();
  
  await expect(page.getByText('E2E deposit test', {exact: true}).first()).toBeVisible();

  await page.getByRole('radio', {name: 'Transfer',exact: true}).click();

  await expect(page.getByText('E2E deposit test', {exact: true})).toHaveCount(0);

  await page.getByRole('radio', {name: 'All',exact: true}).click();

  await expect(page.getByText('E2E deposit test', {exact: true}).first()).toBeVisible();
});