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

test('reject customer access to manager dashboard', async ({ page, request }) => {
  const access_token = await loginTestUser(page);

  await expect(page.getByText('Manager dashboard', {
    exact: true
  })).toHaveCount(0);

  await page.goto('/manager');

  await expect(page.getByText('Access denied', {exact: true})).toBeVisible();

  await expect(page.getByText('This page is available to authorized staff only.',{ exact: true })).toBeVisible();

  const managerResponse = await request.get(
    'http://127.0.0.1:8000/manager/customers',
    {
      headers: {
        Authorization: 'Bearer ' + access_token
      }
    }
  );
  expect(managerResponse.status()).toBe(403);
});