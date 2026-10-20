import { expect, expectAccessible, signUp, test, uniqueEmail } from './support.js';

test('first visit follows the OS theme; the page is accessible', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.getByRole('heading', { name: /Your career/ })).toBeVisible();
  await expectAccessible(page);

  // No saved choice: OS changes keep applying, live.
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  // Reload before checking contrast: right after a switch, colors are mid-transition.
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expectAccessible(page);
});

test('signed-out navbar has no Settings link, and a light/dark toggle', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'Settings' })).toHaveCount(0);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

  // One click switches to the other theme and saves it.
  await page.getByRole('button', { name: 'Switch to dark theme' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

  // The explicit choice wins over the OS and survives a reload.
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

  // And it toggles back.
  await page.getByRole('button', { name: 'Switch to light theme' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});

test('auth screens share the landing backdrop and the theme toggle', async ({ page }) => {
  for (const path of ['/login', '/register', '/verify-email?token=x']) {
    await page.goto(path);
    // The dot grid is part of LandingBackdrop.
    await expect(page.locator('div[aria-hidden="true"].fixed.inset-0')).toHaveCount(1);
    await expect(page.getByRole('button', { name: /Switch to (light|dark) theme/ })).toBeVisible();
  }
});

test('theme choice in Settings applies at once and survives a reload', async ({ page }) => {
  await signUp(page, uniqueEmail('settings'));
  await page.goto('/settings');
  await page.getByText('Light', { exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expectAccessible(page);

  await page.emulateMedia({ colorScheme: 'light' });
  await page.getByText('System', { exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('security headers are sent', async ({ request }) => {
  const res = await request.get('/');
  expect(res.headers()['content-security-policy']).toContain("frame-ancestors 'none'");
  expect(res.headers()['x-content-type-options']).toBe('nosniff');
});
