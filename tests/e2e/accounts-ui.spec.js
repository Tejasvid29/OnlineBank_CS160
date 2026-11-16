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

test('successfully opens an account through the website', async ({ page }) => {
  await loginTestUser(page);
  await page.getByRole('button', { name: /Accounts$/ }).click();

  await page.getByRole('button', {
    name: /Open an account/
  }).click();

  await page.getByRole('radio', {
    name: 'Checking',
    exact: true
  }).click();

  const createPromise = page.waitForResponse(response =>
    response.url().endsWith('/accounts') &&
    response.request().method() === 'POST'
  );

  await page.getByRole('button', {
    name: /Create account/
  }).click();

  const createResponse = await createPromise;
  expect(createResponse.status()).toBe(201);
  const { account } = await createResponse.json();
  expect(account.account_type).toBe('checking');
  expect(Number(account.balance)).toBe(0);
  expect(account.status).toBe('activated');
  await expect(page.getByText('Your account was created.')).toBeVisible();

  await expect(page.getByText(account.account_number, {
    exact: true
  })).toBeVisible();
});

test('successfully closes an account through the website', async ({ page, request }) => {
  const access_token = await loginTestUser(page);

  const createResponse = await request.post(
    'http://127.0.0.1:8000/accounts',
    {
      headers: {
        Authorization: 'Bearer ' + access_token
      },
      data: {
        account_type: 'checking'
      }
    }
  );
  expect(createResponse.status()).toBe(201);
  const { account } = await createResponse.json();
  expect(Number(account.balance)).toBe(0);
  await page.reload();
  await page.getByRole('button', { name: /Accounts$/ }).click();

  const accountRow = page.getByText(
    'Checking ' + account.account_number,
    { exact: true }
  ).locator('xpath=..');

  await accountRow.getByRole('button', {
    name: 'Close account',
    exact: true
  }).click();

  const closePromise = page.waitForResponse(response =>
    response.url().endsWith('/accounts/' + account.id + '/close') &&
    response.request().method() === 'POST'
  );

  await accountRow.getByRole('button', {
    name: 'Confirm close',
    exact: true
  }).click();
  const closeResponse = await closePromise;
  expect(closeResponse.status()).toBe(200);
  const { account: closedAccount } = await closeResponse.json();
  expect(closedAccount.status).toBe('deactivated');
  expect(closedAccount.closed_at).toBeTruthy();

  await expect(page.getByText(
    'The account was closed. Its history remains available.',
    { exact: true }
  )).toBeVisible();
});