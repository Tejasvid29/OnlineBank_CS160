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

test('reject transfer to the same account', async ({ page }) => {
  await loginTestUser(page);
  await page.getByText('Pay & transfer', { exact: true }).click();
  await expect(page.getByText('Transfer details')).toBeVisible();
  const accountName = await page.getByRole('radio').first().innerText();

  const sameAccount = page.getByRole('radio', {
  name: accountName,
  exact: true
  });
  await expect(sameAccount).toHaveCount(2);
  await sameAccount.nth(0).click();
  await sameAccount.nth(1).click();
  await page.getByLabel('Amount', {exact: true }).fill('10.00');
  await page.getByRole('button', { name: /Transfer money/i }).click();
  await expect(page.getByText('Choose two different accounts.',{ exact: true })).toBeVisible();
});

test('reject transferring zero dollars', async ({ page }) => {
  await loginTestUser(page);
  await page.getByText('Pay & transfer', { exact: true }).click();
  await expect(page.getByText('Transfer details')).toBeVisible();
  const radios = page.getByRole('radio');
  expect(await radios.count()).toBeGreaterThanOrEqual(4);
  await radios.first().click();
  await radios.last().click();
  await page.getByLabel('Amount', {exact: true }).fill('0.00');
  await page.getByRole('button', {name: /Transfer money/i}).click();
  await expect(page.getByText('Enter an amount greater than $0 with up to two decimal places.', { exact: true })).toBeVisible();
});

test('reject transferring negative amounts', async ({ page }) => {
  await loginTestUser(page);
  await page.getByText('Pay & transfer', { exact: true }).click();
  await expect(page.getByText('Transfer details')).toBeVisible();
  const radios = page.getByRole('radio');
  expect(await radios.count()).toBeGreaterThanOrEqual(4);
  await radios.first().click();
  await radios.last().click();
  await page.getByLabel('Amount', { exact: true }).fill('-10.00');
  await page.getByRole('button', {name: /Transfer money/i}).click();
  await expect(page.getByText('Enter an amount greater than $0 with up to two decimal places.', { exact: true })).toBeVisible();
});

test('reject transfer with insufficient funds', async ({ page }) => {
  await loginTestUser(page);
  await page.getByText('Pay & transfer', { exact: true }).click();
  await expect(page.getByText('Transfer details')).toBeVisible();
  const radios = page.getByRole('radio');
  expect(await radios.count()).toBeGreaterThanOrEqual(4);
  await radios.first().click();
  await radios.last().click();
  await page.getByLabel('Amount', { exact: true }).fill('9999999999999999999999999.00');
  await page.getByRole('button', {name: /Transfer money/i}).click();
  await expect(page.getByText('The source account has insufficient funds.', { exact: true })).toBeVisible();
});

test('successfully transfers money between accounts', async ({ page, request }) => {
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

  const source = accounts.find(account =>
    account.status === 'activated' &&
    Number(account.balance) >= 5
  );
  expect(source).toBeDefined();

  const destination = accounts.find(account =>
    account.status === 'activated' &&
    account.id !== source.id
  );
  expect(destination).toBeDefined();
  const sourceBefore = Number(source.balance);
  const destinationBefore = Number(destination.balance);
  await page.getByText('Pay & transfer', { exact: true }).click();
  await expect(page.getByText('Transfer details')).toBeVisible();
  await page.getByRole('radio', {
    name: new RegExp(source.account_number)
  }).first().click();

  await page.getByRole('radio', {
  name: new RegExp(destination.account_number)
  }).last().click();
  await page.getByLabel('Amount', { exact: true }).fill('5.00');
  const transferPromise = page.waitForResponse(response =>
    response.url().endsWith('/transfers') &&
    response.request().method() === 'POST'
  );
  await page.getByRole('button', { name: /Transfer money/i }).click();
  const transferResponse = await transferPromise;
  expect(transferResponse.status()).toBe(201);
  await expect(page.getByText(
    'Transfer of $5.00 completed.'
  )).toBeVisible();
  const updatedResponse = await request.get(
    'http://127.0.0.1:8000/accounts',
    {
      headers: {
        Authorization: 'Bearer ' + access_token
      }
    }
);
  expect(updatedResponse.status()).toBe(200);
  const { accounts: updatedAccounts } = await updatedResponse.json();

  const updatedSource = updatedAccounts.find(
    account => account.id === source.id
 );

  const updatedDestination = updatedAccounts.find(
    account => account.id === destination.id
  );
  expect(Number(updatedSource.balance)).toBeCloseTo(sourceBefore - 5, 2);
  expect(Number(updatedDestination.balance)).toBeCloseTo(destinationBefore + 5, 2);
});

test('reject invalid recipient account number', async ({ page }) => {
  await loginTestUser(page);
  await page.getByText('Send Money', { exact: true }).click();
  await expect(page.getByText('Payment details')).toBeVisible();
  await page.getByRole('radio').first().click();
  await page.getByLabel('Recipient account number', { exact: true }).fill('12345');
  await page.getByLabel('Amount', { exact: true }).fill('5.00');
  await page.getByRole('button', { name: /Send money/ }).click();

  await expect(page.getByText(
    "Enter the recipient's 12-digit account number.",
    { exact: true }
  )).toBeVisible();
});

test('reject sending money to the source account', async ({ page }) => {
  await loginTestUser(page);
  await page.getByText('Send Money', { exact: true }).click();
  await expect(page.getByText('Payment details')).toBeVisible();
  const source = page.getByRole('radio').first();
  await source.click();
  const accountName = await source.innerText();
  const accountNumber = accountName.match(/\d{12}/)[0];
  await page.getByLabel('Recipient account number', { exact: true }).fill(accountNumber);
  await page.getByLabel('Amount', { exact: true }).fill('5.00');
  await page.getByRole('button', { name: /Send money/ }).click();

  await expect(page.getByText(
    'Choose a different account to send to.',
    { exact: true }
  )).toBeVisible();
});

test('reject nonexistent recipient account', async ({ page, request }) => {
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

  const source = accounts.find(account =>
    account.status === 'activated' &&
    Number(account.balance) >= 5
  );
  expect(source).toBeDefined();
  await page.getByText('Send Money', { exact: true }).click();
  await expect(page.getByText('Payment details')).toBeVisible();
  await page.getByRole('radio', {
    name: new RegExp(source.account_number)
  }).click();
  const missingNumber = process.env.E2E_MISSING_ACCOUNT_NUMBER;
  expect(missingNumber).toMatch(/^\d{12}$/);
  await page.getByLabel('Recipient account number', { exact: true }).fill(missingNumber);
  await page.getByLabel('Amount', { exact: true }).fill('5.00');

  const sendPromise = page.waitForResponse(response =>
    response.url().endsWith('/transfers/send') &&
    response.request().method() === 'POST'
  );
  await page.getByRole('button', { name: /Send money/ }).click();
  const sendResponse = await sendPromise;
  expect(sendResponse.status()).toBe(404);

  await expect(page.getByText(
    'No active account matches that account number.',
    { exact: true }
  )).toBeVisible();
});

test('successfully sends money to another user', async ({ page, request }) => {
  const access_token = await loginTestUser(page);

  const recipientLogin = await request.post(
    'http://127.0.0.1:8000/auth/login',
    {
      data: {
        email: process.env.E2E_RECIPIENT_EMAIL,
        password: process.env.E2E_RECIPIENT_PASSWORD
      }
    }
  );
  expect(recipientLogin.status()).toBe(200);
  const { access_token: recipientToken } = await recipientLogin.json();
  const senderAccountsResponse = await request.get(
    'http://127.0.0.1:8000/accounts',
    {
      headers: {
        Authorization: 'Bearer ' + access_token
      }
    }
  );
  const recipientAccountsResponse = await request.get(
  'http://127.0.0.1:8000/accounts',
  {
    headers: {
      Authorization: 'Bearer ' + recipientToken
    }
  }
);
  expect(senderAccountsResponse.status()).toBe(200);
  expect(recipientAccountsResponse.status()).toBe(200);
  const { accounts: senderAccounts } = await senderAccountsResponse.json();
  const { accounts: recipientAccounts } = await recipientAccountsResponse.json();
  const source = senderAccounts.find(account =>
  account.status === 'activated' &&
  Number(account.balance) >= 5
  );

  const destination = recipientAccounts.find(account =>
    account.status === 'activated'
  );
  expect(source).toBeDefined();
  expect(destination).toBeDefined();
  expect(source.id).not.toBe(destination.id);
  const sourceBefore = Number(source.balance);
  const destinationBefore = Number(destination.balance);
  await page.getByText('Send Money', { exact: true }).click();
  await expect(page.getByText('Payment details')).toBeVisible();
  await page.getByRole('radio', {
    name: new RegExp(source.account_number)
  }).click();

  await page.getByLabel('Recipient account number', {
    exact: true
  }).fill(destination.account_number);
  await page.getByLabel('Amount', { exact: true }).fill('5.00');
  const sendPromise = page.waitForResponse(response =>
    response.url().endsWith('/transfers/send') &&
    response.request().method() === 'POST'
  );
  await page.getByRole('button', { name: /Send money/ }).click();
  const sendResponse = await sendPromise;
  expect(sendResponse.status()).toBe(201);
  const updatedSenderResponse = await request.get(
    'http://127.0.0.1:8000/accounts/' + source.id,
    {
      headers: {
        Authorization: 'Bearer ' + access_token
      }
    }
  );

  const updatedRecipientResponse = await request.get(
    'http://127.0.0.1:8000/accounts/' + destination.id,
    {
      headers: {
        Authorization: 'Bearer ' + recipientToken
      }
    }
  );
  expect(updatedSenderResponse.status()).toBe(200);
  expect(updatedRecipientResponse.status()).toBe(200);
  const { account: updatedSource } = await updatedSenderResponse.json();
  const { account: updatedDestination } = await updatedRecipientResponse.json();
  expect(Number(updatedSource.balance)).toBeCloseTo(sourceBefore - 5, 2);
  expect(Number(updatedDestination.balance)).toBeCloseTo(destinationBefore + 5, 2);  
});