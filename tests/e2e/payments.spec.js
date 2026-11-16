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

test('reject payment without a payee', async ({ page }) => {
  await loginTestUser(page);
  await page.getByText('Bill payments', { exact: true }).click();
  await expect(page.getByText('Schedule a payment', { exact: true })).toBeVisible();
  await page.getByLabel('Payee', { exact: true }).fill('');
  await page.getByLabel('Amount', { exact: true }).fill('5.00');
  await page.getByRole('radio', { name: 'Once', exact: true }).click();
  await page.getByRole('button', { name: /Pay now/ }).click();

  await expect(page.getByText(
    'Enter a payee name.',
    { exact: true }
  )).toBeVisible();
});

test('reject bill payment with invalid amount', async ({ page }) => {
  await loginTestUser(page);
  await page.getByText('Bill payments', { exact: true }).click();
  await expect(page.getByText('Schedule a payment', { exact: true })).toBeVisible();
  await page.getByLabel('Payee', { exact: true }).fill('E2E Test Payee');
  await page.getByLabel('Amount', { exact: true }).fill('0.00');
  await page.getByRole('radio', { name: 'Once', exact: true }).click();
  await page.getByRole('button', { name: /Pay now/ }).click();

  await expect(page.getByText(
    'Enter an amount greater than $0 with up to two decimal places.',
    { exact: true }
  )).toBeVisible();
});

test('reject bill payment with past date', async ({ page }) => {
  await loginTestUser(page);
  await page.getByText('Bill payments', { exact: true }).click();
  await expect(page.getByText('Schedule a payment', { exact: true })).toBeVisible();
  await page.getByLabel('Payee', { exact: true }).fill('E2E Test Payee');
  await page.getByLabel('Amount', { exact: true }).fill('5.00');
  await page.getByRole('radio', { name: 'Monthly', exact: true }).click();
  await page.getByLabel('Date of first payment', { exact: true }).fill('2020-01-01');
  await page.getByRole('button', { name: /Schedule payment/ }).click();

  await expect(page.getByText(
    'Enter a valid date today or later as YYYY-MM-DD.',
    { exact: true }
  )).toBeVisible();
});

test('successfully schedules a bill payment', async ({ page, request }) => {
  const access_token = await loginTestUser(page);
  await page.getByText('Bill payments', { exact: true }).click();
  await expect(page.getByText('Schedule a payment', { exact: true })).toBeVisible();
  const payee = 'E2E Test Payee ' + Date.now();
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + 7);
  const paymentDate = futureDate.toISOString().slice(0, 10);
  await page.getByLabel('Payee', { exact: true }).fill(payee);
  await page.getByLabel('Amount', { exact: true }).fill('5.00');
  await page.getByRole('radio', { name: 'Monthly', exact: true }).click();
  await page.getByLabel('Date of first payment', { exact: true }).fill(paymentDate);
  const paymentPromise = page.waitForResponse(response =>
    response.url().endsWith('/bill-payments') &&
    response.request().method() === 'POST'
  );
  await page.getByRole('button', { name: /Schedule payment/ }).click();

  const paymentResponse = await paymentPromise;
  expect(paymentResponse.status()).toBe(201);
  const { payment } = await paymentResponse.json();

  try {
    expect(payment.recipient).toBe(payee);
    expect(Number(payment.amount)).toBe(5);
    expect(payment.status).toBe('Scheduled');
    await expect(page.getByText('Your payment was scheduled.')).toBeVisible();
    await expect(page.getByText(payee, { exact: true })).toBeVisible();
  } finally {
    const cleanupResponse = await request.delete(
      'http://127.0.0.1:8000/bill-payments/' + payment.id,
      {
        headers: {
          Authorization: 'Bearer ' + access_token
        }
      }
    );
    expect(cleanupResponse.status()).toBe(200);
  }
});

test('successfully cancels a scheduled payment', async ({ page, request }) => {
  const access_token = await loginTestUser(page);
  await page.getByText('Bill payments', { exact: true }).click();
  const payee = 'E2E Cancel Test ' + Date.now();
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + 7);
  const paymentDate = futureDate.toISOString().slice(0, 10);
  await page.getByLabel('Payee', { exact: true }).fill(payee);
  await page.getByLabel('Amount', { exact: true }).fill('5.00');
  await page.getByRole('radio', { name: 'Monthly', exact: true }).click();
  await page.getByLabel('Date of first payment', { exact: true }).fill(paymentDate);

  const paymentPromise = page.waitForResponse(response =>
    response.url().endsWith('/bill-payments') &&
    response.request().method() === 'POST'
  );
  await page.getByRole('button', { name: /Schedule payment/ }).click();
  const paymentResponse = await paymentPromise;
  expect(paymentResponse.status()).toBe(201);
  const { payment } = await paymentResponse.json();

  try {
    await expect(page.getByText(payee, { exact: true })).toBeVisible();
    const paymentRow = page.getByText(payee, {
      exact: true
    }).locator('xpath=../..');

    const cancelPromise = page.waitForResponse(response =>
      response.url().endsWith('/bill-payments/' + payment.id) &&
      response.request().method() === 'DELETE'
    );

    await paymentRow.getByRole('button', {
      name: 'Cancel',
      exact: true
    }).click();
    const cancelResponse = await cancelPromise;
    expect(cancelResponse.status()).toBe(200);
    const { payment: canceledPayment } = await cancelResponse.json();
    expect(canceledPayment.status).toBe('Canceled');

    await expect(page.getByText(
      'The scheduled payment was canceled.'
    )).toBeVisible();
    await expect(page.getByText(payee, {
      exact: true
    })).toHaveCount(0);
  } finally {
    const cleanupResponse = await request.delete(
      'http://127.0.0.1:8000/bill-payments/' + payment.id,
      {
        headers: {
          Authorization: 'Bearer ' + access_token
        }
      }
    );
    expect([200, 404]).toContain(cleanupResponse.status());
  }
});