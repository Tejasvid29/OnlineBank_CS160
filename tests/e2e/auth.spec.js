const { test, expect } = require('@playwright/test');

test('opens registration form', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', {
    name: 'New here? Create an account'
  }).click();

  await expect(page.getByText('Create your account')).toBeVisible();
});

test('registers a new user', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('button', {
    name: 'New here? Create an account'
  }).click();

  const email = `test-${Date.now()}@example.com`;
  await page.getByLabel('First name').fill('Test');
  await page.getByLabel('Last name').fill('User');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('@JayYang1234');
  await page.getByLabel('Confirm password', { exact: true }).fill('@JayYang1234');

  await page.getByRole('button', {
  name: 'Create account',
  exact: true
  }).click();

  await expect(
  page.getByText('Welcome back, Test.')
  ).toBeVisible();
  await page.getByRole('button', {
  name: 'Sign out'
  }).click();
  await expect(
  page.getByText('Sign in to your account')
  ).toBeVisible(); 
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password').fill('@JayYang1234');

  await page.getByRole('button', {
  name: 'Sign in'
  }).click();
  await expect(
  page.getByText('Welcome back, Test.')
  ).toBeVisible();

  //tests incorrect password part
  await page.getByRole('button', {
  name: 'Sign out'
  }).click();
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password').fill('SamStoleMyJob');

  await page.getByRole('button', {
  name: 'Sign in'
  }).click();
  await expect(
  page.getByText('Invalid email or password.')
  ).toBeVisible();  

  //duplicate email registration 
  await page.getByRole('button', {
  name: 'New here? Create an account'
  }).click();

  await page.getByLabel('First name').fill('Test');
  await page.getByLabel('Last name').fill('User');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('@SamStoleMyJob2');
  await page.getByLabel('Confirm password').fill('@SamStoleMyJob2');
  
  await page.getByRole('button', {
  name: 'Create account',
  exact: true
  }).click();
  await expect(
  page.getByText('An account with this email already exists.')
  ).toBeVisible();
});

  //test incorrect email
test('rejects unregistered email', async ({ page }) => {
  await page.goto('/');

  await page.getByLabel('Email address').fill(
  `unknown-${Date.now()}@example.com`
  );

  await page.getByLabel('Password').fill('KenStoleChrisHouse');
  await page.getByRole('button', {
  name: 'Sign in'
  }).click();
  await expect(
  page.getByText('Invalid email or password.')
  ).toBeVisible();
  
  });