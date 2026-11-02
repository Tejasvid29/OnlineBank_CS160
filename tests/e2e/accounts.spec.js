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

test('successfully opens a checking account', async ({ page, request }) => {
const access_token = await loginTestUser(page);
const accountResponse = await request.post(
  'http://127.0.0.1:8000/accounts',
  {
    headers: {
      Authorization: `Bearer ${access_token}`
    },
    data: {
      account_type: 'checking'
    }
  }
);
expect(accountResponse.status()).toBe(201);    
});

test('successfully opens a savings account', async ({ page, request }) => {
  const access_token = await loginTestUser(page);
  const accountResponse = await request.post(
  'http://127.0.0.1:8000/accounts',
  {
    headers: {
      Authorization: `Bearer ${access_token}`
    },
    data: {
      account_type: 'savings'
    }
  }
);
expect(accountResponse.status()).toBe(201);  

const { account } = await accountResponse.json();
expect(account.account_type).toBe('savings');
expect(Number(account.balance)).toBe(0);
expect(account.status).toBe('activated');
expect(account.account_number).toMatch(/^\d{12}$/);  
});

test('retrieves account details', async ({ page, request }) => {
  const access_token = await loginTestUser(page);

  // Get the user's bank accounts
  const accountsResponse = await request.get(
    'http://127.0.0.1:8000/accounts',
    {
      headers: {
        Authorization: `Bearer ${access_token}`
      }
    }
  );

  expect(accountsResponse.status()).toBe(200);
  const { accounts } = await accountsResponse.json();
  expect(accounts.length).toBeGreaterThan(0);
  const accountId = accounts[0].id;

  const accountResponse = await request.get(
  'http://127.0.0.1:8000/accounts/' + accountId,
  {
    headers: {
      Authorization: 'Bearer ' + access_token
    }
  }
);
expect(accountResponse.status()).toBe(200);
const { account } = await accountResponse.json();
expect(account.id).toBe(accountId); 
});

test('successfully closes an empty account', async ({ page, request }) => {
const access_token = await loginTestUser(page);

const accountResponse = await request.post(
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
expect(accountResponse.status()).toBe(201);
const { account } = await accountResponse.json();
const accountId = account.id;

expect(Number(account.balance)).toBe(0);

const closeResponse = await request.post(
  'http://127.0.0.1:8000/accounts/' + accountId + '/close',
  {
    headers: {
      Authorization: 'Bearer ' + access_token
    }
  }
);
expect(closeResponse.status()).toBe(200);
const { account: closedAccount } = await closeResponse.json();
expect(closedAccount.status).toBe('deactivated');
});


test('reject closing an account with money', async ({ page, request }) => {
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

const fundedAccount = accounts.find(
  account => account.status === 'activated' &&
             Number(account.balance) > 0
);
test.skip(!fundedAccount, 'No funded test account available');
const accountId = fundedAccount.id;

const closeResponse = await request.post(
  'http://127.0.0.1:8000/accounts/' + accountId + '/close',
  {
    headers: {
      Authorization: 'Bearer ' + access_token
    }
  }
);
expect(closeResponse.status()).toBe(409);

const verifyResponse = await request.get(
  'http://127.0.0.1:8000/accounts/' + accountId,
  {
    headers: {
      Authorization: 'Bearer ' + access_token
    }
  }
);

expect(verifyResponse.status()).toBe(200);

const { account: verifiedAccount } = await verifyResponse.json();

expect(verifiedAccount.status).toBe('activated');
expect(Number(verifiedAccount.balance)).toBeCloseTo(
  Number(fundedAccount.balance),
  2
);  
});


test('reject account access without authentication', async ({ page, request }) => {
const access_token = await loginTestUser(page);

// Get the user's accounts WITH authentication
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
expect(accounts.length).toBeGreaterThan(0);
const accountId = accounts[0].id;

const unauthorizedResponse = await request.get(
  'http://127.0.0.1:8000/accounts/' + accountId,
  {
    //no authentication 
  }
);
expect(unauthorizedResponse.status()).toBe(401);
});