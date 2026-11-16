const { test, expect } = require('@playwright/test');
const email = 'deposit-test-2@example.com';
const password = 'DepositTest2026';
/*account 2 for account to aacount
first/last name: test 2
email: deposit-test-3@example.com
password: DepositTest2026
*/
async function getTestAccount(page, request, loginEmail = email, loginPassword = password) {
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

  await expect(
    page.getByText(/Welcome back,/)
  ).toBeVisible();

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
  console.log('Bank accounts found:', accounts.length);
  expect(accounts.length).toBeGreaterThan(0);
  const account = accounts[0];
  const accountId = account.id;
  const originalBalance = Number(account.balance);
  console.log('Account ID:', accountId);
  console.log('Original balance:', originalBalance);
  return {
  access_token, accountId, originalBalance
  };
}

test('successful cash deposit', async ({ page, request }) => {
  const { access_token, accountId, originalBalance } =
  await getTestAccount(page, request);
  const depositResponse = await request.post(
  `http://127.0.0.1:8000/accounts/${accountId}/deposits`,
  {
    headers: {
      Authorization: `Bearer ${access_token}`
    },
    data: {
      amount: 10,
      description: 'E2E deposit test'
     }
   }
 );

expect(depositResponse.status()).toBe(201);
  const updatedResponse = await request.get(
  `http://127.0.0.1:8000/accounts/${accountId}`,
  {
    headers: {
      Authorization: `Bearer ${access_token}`
    }
  }
);
expect(updatedResponse.status()).toBe(200);
const { account: updatedAccount } = await updatedResponse.json();
expect(Number(updatedAccount.balance)).toBeCloseTo(
  originalBalance + 10,
  2
);
console.log('Updated balance:', updatedAccount.balance);
});
 //addimg $0 test
test('reject zero deposit', async ({ page, request }) => {
 const { access_token, accountId, originalBalance } =
 await getTestAccount(page, request);
 const zeroDepositResponse = await request.post(
   `http://127.0.0.1:8000/accounts/${accountId}/deposits`,
   {
     headers: {
       Authorization: `Bearer ${access_token}`
     },
     data: {
       amount: 0,
       description: 'Invalid deposit test'
     }
   }
 );
 expect(zeroDepositResponse.status()).toBe(422);
 console.log('Zero deposit status:', zeroDepositResponse.status());
 const balanceResponse = await request.get(
    `http://127.0.0.1:8000/accounts/${accountId}`,
    {
      headers: {
        Authorization: `Bearer ${access_token}`
      }
    }
 );

 expect(balanceResponse.status()).toBe(200);
 const { account: afterZeroAccount } = await balanceResponse.json();
 expect(Number(afterZeroAccount.balance)).toBeCloseTo(
   originalBalance,
    2
  ); 
});
 //negative balance deposit
test('reject negative deposit', async ({ page, request }) => {
  const { access_token, accountId, originalBalance } =
  await getTestAccount(page, request);
  const negativeDepositResponse = await request.post(
  `http://127.0.0.1:8000/accounts/${accountId}/deposits`,
  {
      headers: {
        Authorization: `Bearer ${access_token}`
      },
      data: {
        amount: -10,
        description: 'Negative deposit test'
      }
    }
  );
expect(negativeDepositResponse.status()).toBe(422);
console.log('Negative deposit status:', negativeDepositResponse.status());
//double checking balance did not change
const finalResponse = await request.get(
  `http://127.0.0.1:8000/accounts/${accountId}`,
  {
    headers: {
      Authorization: `Bearer ${access_token}`
    }
  }
);

expect(finalResponse.status()).toBe(200);

const { account: finalAccount } = await finalResponse.json();

expect(Number(finalAccount.balance)).toBeCloseTo(
  originalBalance,
   2
);

console.log('Final balance:', finalAccount.balance);
});

//unauthorized deposit (no access token)
test('reject deposit without authentication', async ({ page, request }) => {
  const { access_token, accountId, originalBalance } = await getTestAccount(page, request);
const unauthorizedResponse = await request.post(
  `http://127.0.0.1:8000/accounts/${accountId}/deposits`,
  {
    data: {
      amount: 10,
      description: 'Unauthorized deposit test'
    }
  }
);
 expect(unauthorizedResponse.status()).toBe(401);
 console.log('Unauthorized deposit status:', unauthorizedResponse.status());
 const balanceResponse = await request.get(
  `http://127.0.0.1:8000/accounts/${accountId}`,
  {
    headers: {
      Authorization: `Bearer ${access_token}`
    }
  }
);

expect(balanceResponse.status()).toBe(200);
const { account: finalAccount } = await balanceResponse.json();
expect(Number(finalAccount.balance)).toBeCloseTo(
  originalBalance,
  2
);
console.log('Final balance:', finalAccount.balance);
});

//account to account test 
test('reject deposit into another users account', async ({ page, request, browser }) => {
    const pageB = await browser.newPage();
    const {
     access_token: tokenB,
     accountId: accountBId,
     originalBalance: balanceB
    } = await getTestAccount(
      pageB,
      request,
      'deposit-test-3@example.com',
      password
    );
    await pageB.close();
    const { access_token: tokenA } =
    await getTestAccount(page, request);
    console.log('User B account found:', Boolean(accountBId));
    console.log('User B original balance:', balanceB);
    const crossAccountResponse = await request.post(
  `http://127.0.0.1:8000/accounts/${accountBId}/deposits`,
   {
     headers: {
       Authorization: `Bearer ${tokenA}`
     },
     data: {
       amount: 10,
       description: 'Cross-account deposit test'
     }
   }
 );
// check if the deposit is rejected
  expect(crossAccountResponse.status()).toBe(404);
  console.log('Cross-account deposit status:', crossAccountResponse.status());
  const balanceResponse = await request.get(
  `http://127.0.0.1:8000/accounts/${accountBId}`,
   {
     headers: {
       Authorization: `Bearer ${tokenB}`
     }
   }
 );
expect(balanceResponse.status()).toBe(200);
//checking if balance did not change
const { account: finalAccountB } = await balanceResponse.json();
expect(Number(finalAccountB.balance)).toBeCloseTo(
  balanceB,
  2
);

console.log('User B final balance:', finalAccountB.balance);
  });