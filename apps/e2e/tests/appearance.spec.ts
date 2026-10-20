import type { Page } from '@playwright/test';
import { PASSWORD, expect, expectAccessible, signUp, test, uniqueEmail } from './support.js';

const appAccent = (page: Page) =>
  page.evaluate(() => document.documentElement.style.getPropertyValue('--app-accent'));
const previewHtml = (page: Page) =>
  page.locator('iframe[title="Resume preview"]').evaluate((el) => (el as HTMLIFrameElement).srcdoc);

test('app appearance is per account and independent of every resume', async ({ page, browser }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ colorScheme: 'dark' });
  const email = uniqueEmail('appearance');
  await signUp(page, email);

  // A resume with its own accent (Cyan).
  await page.getByRole('button', { name: 'New resume' }).click();
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page).toHaveURL(/\/resumes\//);
  const resumeUrl = page.url();
  await page.getByRole('tab', { name: 'Templates' }).click();
  const panel = page.getByRole('tabpanel', { name: 'Templates' });
  await panel.getByText('Cyan', { exact: true }).click({ force: true });
  await expect.poll(() => previewHtml(page)).toContain('--resume-accent: #22D3EE');
  // The resume's accent doesn't recolor the app around it.
  expect(await appAccent(page)).toBe('');
  await expect(page.getByText('All changes saved')).toBeVisible();

  // Settings: two panels, Appearance selected.
  await page.goto('/settings');
  await expect(page).toHaveURL(/\/settings\/appearance$/);
  const nav = page.getByRole('navigation', { name: 'Settings' });
  await expect(nav.getByRole('link', { name: 'Appearance' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await expect(page.getByRole('heading', { name: 'Appearance' })).toBeVisible();
  await expectAccessible(page);

  // App accent: violet applies at once and is saved to the account.
  await page.getByText('Electric violet', { exact: true }).click({ force: true });
  await expect.poll(() => appAccent(page)).toBe('#A78BFA');
  await expect(page.getByText('Saved to your account')).toBeVisible();
  // Invalid custom colors are refused.
  await page.getByText('Custom', { exact: true }).click({ force: true });
  await page.getByLabel('Custom accent hex code').fill('#12');
  await expect(page.getByText('Use a 6-digit hex color')).toBeVisible();
  expect(await appAccent(page)).toBe('#A78BFA');
  // Theme: light, saved too; the accent stays.
  await page.getByText('Light', { exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.getByText('Saved to your account')).toBeVisible();
  expect(await appAccent(page)).toBe('#A78BFA');

  // The resume kept Cyan, and the editor uses the app's violet for its own buttons.
  await page.goto(resumeUrl);
  await page.getByRole('tab', { name: 'Templates' }).click();
  await expect(panel.getByRole('radio', { name: 'Cyan' })).toBeChecked();
  await expect.poll(() => previewHtml(page)).toContain('--resume-accent: #22D3EE');
  const downloadBg = await page
    .getByRole('button', { name: 'Download PDF' })
    .evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(downloadBg).toBe('rgb(167, 139, 250)');

  // Changing the resume's accent leaves the app accent alone.
  await panel.getByText('Pink', { exact: true }).click({ force: true });
  await expect.poll(() => previewHtml(page)).toContain('--resume-accent: #F472B6');
  await expect(page.getByText('All changes saved')).toBeVisible();
  expect(await appAccent(page)).toBe('#A78BFA');

  // Painted before the app loads after a reload (no flash of lime).
  await page.reload({ waitUntil: 'commit' });
  await page.waitForSelector('html[data-theme="light"]', { state: 'attached' });
  expect(await appAccent(page)).toBe('#A78BFA');

  // Another device: signing in brings the account's theme and accent.
  const other = await browser.newContext();
  const second = await other.newPage();
  await second.emulateMedia({ colorScheme: 'dark' });
  await second.goto('/login');
  await second.getByLabel('Email').fill(email);
  await second.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await second.getByRole('button', { name: 'Sign in' }).click();
  await expect(second.getByRole('heading', { name: 'Your resumes' })).toBeVisible();
  await expect(second.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect.poll(() => appAccent(second)).toBe('#A78BFA');
  await other.close();
});
