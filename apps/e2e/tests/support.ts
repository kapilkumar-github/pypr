import { randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { AxeBuilder } from '@axe-core/playwright';
import { expect, test as base, type Page } from '@playwright/test';
import { OUTBOX_DIR } from '../config.js';

let ip = 10;
/** Each test looks like a different client to the API's per-IP rate limits. */
export const test = base.extend({
  context: async ({ context }, use) => {
    ip += 1;
    await context.setExtraHTTPHeaders({ 'X-Forwarded-For': `203.0.113.${String(ip % 250)}` });
    await use(context);
  },
});
export { expect };

export const PASSWORD = 'correct horse battery staple';

export function uniqueEmail(name: string): string {
  return `${name}-${randomUUID().slice(0, 8)}@e2e.pypr.dev`;
}

/** The verification link from the newest email to `to` (outbox email adapter). */
export async function verificationLink(to: string): Promise<string> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const files = (await readdir(OUTBOX_DIR).catch(() => [] as string[])).sort().reverse();
    for (const file of files) {
      const email = JSON.parse(await readFile(join(OUTBOX_DIR, file), 'utf8')) as {
        to: string;
        text: string;
      };
      if (email.to === to) {
        const link = /https?:\/\/\S+\/verify-email\?token=[\w-]+/.exec(email.text)?.[0];
        if (link) return link;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`No verification email for ${to}`);
}

/** Fails on serious or critical WCAG 2 A/AA problems. */
export async function expectAccessible(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    // The resume preview is a script-free sandboxed document (the resume itself, not app UI);
    // axe can't run inside it.
    .exclude('iframe[sandbox]')
    .analyze();
  const serious = results.violations.filter(
    (v) => v.impact === 'serious' || v.impact === 'critical',
  );
  expect(
    serious.map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(' ')).join(', ')})`),
  ).toEqual([]);
}

/** Registers through the UI and opens the emailed link; ends signed in on the dashboard. */
export async function signUp(page: Page, email: string): Promise<void> {
  await page.goto('/register');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();
  // Opening the link verifies and goes to the resumes on its own (no button).
  await page.goto(await verificationLink(email));
  await expect(page.getByRole('heading', { name: 'Your resumes' })).toBeVisible();
}

/** Signs out through the profile menu (top-right avatar). */
export async function signOut(page: Page): Promise<void> {
  await page.getByRole('button', { name: /Account menu for/ }).click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login/);
}
