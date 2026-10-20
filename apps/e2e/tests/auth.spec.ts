import {
  PASSWORD,
  expect,
  expectAccessible,
  signOut,
  signUp,
  test,
  uniqueEmail,
  verificationLink,
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

test('the emailed link verifies on its own, once, and goes to the resumes', async ({
  page,
  browser,
}) => {
  const email = uniqueEmail('autoverify');
  await page.goto('/register');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();
  const link = await verificationLink(email);

  // The first attempt fails (offline): a retry is offered, and works.
  let verifyCalls = 0;
  await page.route('**/api/auth/verify-email', (route) => route.abort('internetdisconnected'));
  page.on('request', (request) => {
    if (request.url().endsWith('/api/auth/verify-email')) verifyCalls += 1;
  });
  await page.goto(link);
  await expect(page.getByRole('heading', { name: "We couldn't reach Pypr" })).toBeVisible();
  // The token is gone from the address bar.
  expect(page.url()).not.toContain('token=');
  await page.unroute('**/api/auth/verify-email');
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByRole('heading', { name: 'Email verified' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Your resumes' })).toBeVisible();
  // One request per attempt, even with React's double effects in development.
  expect(verifyCalls).toBe(2);

  // The same link again in this browser: already signed in, straight to the resumes.
  await page.goto(link);
  await expect(page.getByRole('heading', { name: 'Your resumes' })).toBeVisible();

  // Elsewhere (signed out): it says the email is verified and offers sign-in, no session.
  const other = await browser.newContext();
  const second = await other.newPage();
  await second.goto(link);
  await expect(
    second.getByRole('heading', { name: 'Your email is already verified' }),
  ).toBeVisible();
  await expectAccessible(second);
  await second.getByRole('link', { name: 'Sign in' }).click();
  await expect(second).toHaveURL(/\/login/);
  await other.close();
});

test('broken and incomplete links explain what happened and offer a new link', async ({ page }) => {
  await page.goto(`/verify-email?token=${'x'.repeat(43)}`);
  await expect(page.getByRole('heading', { name: "We couldn't verify your email" })).toBeVisible();
  await expect(page.getByText('invalid or has already been used')).toBeVisible();
  await expect(page.getByLabel('Send a new link')).toBeVisible();
  await expectAccessible(page);

  await page.goto('/verify-email');
  await expect(page.getByText('This link is incomplete.')).toBeVisible();
  await page.getByLabel('Send a new link').fill('nobody@example.com');
  await page.getByRole('button', { name: 'Send link' }).click();
  await expect(page.getByText('a new link is on its way')).toBeVisible();
});
