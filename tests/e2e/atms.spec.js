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

test('reject ATM search without location', async ({ page }) => {
  await loginTestUser(page);

  await page.getByRole('button', { name: /Find an ATM/ }).click();

  await page.getByLabel('Location', { exact: true }).fill('');

  await page.getByRole('button', { name: /Search ATMs/ }).click();

  await expect(page.getByText(
    'Enter a city, ZIP code, or address.',
    { exact: true }
  )).toBeVisible();
});

test('successfully searches for ATMs', async ({ page }) => {
  test.setTimeout(90000);
  await loginTestUser(page);
  await page.getByRole('button', { name: /Find an ATM/ }).click();
  await page.getByLabel('Location', { exact: true }).fill('San Jose, CA');

  const searchPromise = page.waitForResponse(response =>
    response.url().includes('/atm/search') &&
    response.request().method() === 'GET',
    { timeout: 60000 }
  );

  await page.getByRole('button', { name: /Search ATMs/ }).click();
  const searchResponse = await searchPromise;
  expect(searchResponse.status()).toBe(200);
  const { atms } = await searchResponse.json();
  expect(atms.length).toBeGreaterThan(0);

  await expect(page.getByText(atms[0].address, {
    exact: true
  }).first()).toBeVisible();

  await expect(page.getByText('Directions', {
    exact: true
  }).first()).toBeVisible();

  await expect(page.getByTestId('atm-map')).toBeVisible();
});