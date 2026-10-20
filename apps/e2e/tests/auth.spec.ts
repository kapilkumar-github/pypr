import {
  PASSWORD,
  expect,
  expectAccessible,
  signOut,
  signUp,
  test,
  uniqueEmail,
} from './support.js';

test('register and login pages are accessible', async ({ page }) => {
  await page.goto('/register');
  await expectAccessible(page);
  await page.goto('/login');
  await expectAccessible(page);
});

test('registering an email that exists sends you to sign in', async ({ page }) => {
  const email = uniqueEmail('taken');
  await signUp(page, email);
  await signOut(page);

  await page.goto('/register');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('another long password');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/login\?email=.*notice=exists/);
  await expect(page.getByText('You already have an account with this email')).toBeVisible();
  await expect(page.getByLabel('Email')).toHaveValue(email);
});

test('an unverified account is asked to verify, and can get a new link', async ({ page }) => {
  const email = uniqueEmail('unverified');
  await page.goto('/register');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();

  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText('Verify your email before signing in.')).toBeVisible();
  await page.getByRole('button', { name: 'Send a new link' }).click();
  await expect(page.getByText('A new link is on its way.')).toBeVisible();
});

test('signed-out visitors are sent to sign in, then back', async ({ page }) => {
  const email = uniqueEmail('return');
  await signUp(page, email);
  await signOut(page);

  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/login\?next=%2Fdashboard/);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
});
