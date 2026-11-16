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

test('successfully displays user profile information', async ({ page, request }) => {
  const access_token = await loginTestUser(page);

  const profileResponse = await request.get(
    'http://127.0.0.1:8000/auth/me',
    {
      headers: {
        Authorization: 'Bearer ' + access_token
      }
    }
  );

  expect(profileResponse.status()).toBe(200);
  const { profile } = await profileResponse.json();

  await page.getByRole('button', {
    name: 'Profile and settings',
    exact: true
  }).click();

  await expect(page.getByText('Personal details', {exact: true})).toBeVisible();
  await expect(page.getByLabel('First name', {exact: true})).toHaveValue(profile.first_name);
  await expect(page.getByLabel('Last name', {exact: true})).toHaveValue(profile.last_name);
  await expect(page.getByLabel('Phone number', {exact: true})).toHaveValue(profile.phone || '');
  await expect(page.getByText(profile.email, {exact: true}).first()).toBeVisible();
  await expect(page.getByRole('button', {name: /Save changes/})).toBeEnabled();
});