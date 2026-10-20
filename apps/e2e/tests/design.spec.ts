import type { Page } from '@playwright/test';
import { expect, expectAccessible, signUp, test, uniqueEmail } from './support.js';

const previewHtml = (page: Page) =>
  page.locator('iframe[title="Resume preview"]').evaluate((el) => (el as HTMLIFrameElement).srcdoc);

test('resume design: accent, custom color, font, density and rich text persist per resume', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ colorScheme: 'dark' });
  await signUp(page, uniqueEmail('design'));
  await page.getByRole('button', { name: 'New resume' }).click();
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page).toHaveURL(/\/resumes\//);
  const resumeUrl = page.url();

  // Defaults: neon lime, Helvetica, Normal.
  await page.getByRole('tab', { name: 'Templates' }).click();
  const panel = page.getByRole('tabpanel', { name: 'Templates' });
  await expect(panel.getByRole('radio', { name: 'Neon lime' })).toBeChecked();
  await expect(panel.getByLabel('Font')).toHaveValue('helvetica');
  await expect(panel.getByRole('radio', { name: 'Normal' })).toBeChecked();
  await expect(panel.getByRole('radio', { name: /Classic/ })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await expect(panel.getByText('Selected')).toBeVisible();
  await expect(panel.locator('iframe[title="Classic template preview"]')).toBeVisible();
  await expectAccessible(page);

  // Preset accent applies to the preview immediately.
  await panel.getByText('Cyan', { exact: true }).click({ force: true });
  await expect(panel.getByRole('radio', { name: 'Cyan' })).toBeChecked();
  await expect.poll(() => previewHtml(page)).toContain('--resume-accent: #22D3EE');

  // Custom: invalid hex is refused, a valid one applies.
  await panel.getByText('Custom', { exact: true }).click({ force: true });
  const hex = panel.getByLabel('Custom accent hex code');
  await hex.fill('#12');
  await expect(panel.getByText('Use a 6-digit hex color')).toBeVisible();
  await expect.poll(() => previewHtml(page)).toContain('--resume-accent: #22D3EE');
  await hex.fill('#ff5500');
  await expect.poll(() => previewHtml(page)).toContain('--resume-accent: #FF5500');

  // Font and density.
  await panel.getByLabel('Font').selectOption('georgia');
  await panel.getByText('Spaced', { exact: true }).click();
  await expect.poll(() => previewHtml(page)).toContain('--resume-font: Georgia');
  await expect.poll(() => previewHtml(page)).toContain('--resume-line-height: 1.65');

  // Rich text: bold through the toolbar shows as bold in the preview.
  await page.getByRole('tab', { name: 'Form' }).click();
  await page.getByLabel('Full name').fill('Ada Lovelace');
  const summary = page.getByRole('textbox', { name: 'Professional summary' });
  await summary.click();
  await page.getByRole('button', { name: 'Bold' }).first().click();
  await page.keyboard.type('Analyst');
  await page.getByRole('button', { name: 'Bold' }).first().click();
  await page.keyboard.type(' of engines.');
  await expect(page.getByRole('button', { name: 'Bold' }).first()).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  await expect.poll(() => previewHtml(page)).toContain('<strong>Analyst</strong> of engines.');
  await expect(page.getByText('All changes saved')).toBeVisible();

  // Everything persists after a reload.
  await page.reload();
  await page.getByRole('tab', { name: 'Templates' }).click();
  await expect(panel.getByLabel('Custom accent hex code')).toHaveValue('#FF5500');
  await expect(panel.getByLabel('Font')).toHaveValue('georgia');
  await expect(panel.getByRole('radio', { name: 'Spaced' })).toBeChecked();
  await page.getByRole('tab', { name: 'Form' }).click();
  await expect(page.getByRole('textbox', { name: 'Professional summary' })).toContainText(
    'Analyst of engines.',
  );

  // Another resume keeps its own defaults.
  await page.getByRole('button', { name: 'Back to resumes' }).click();
  await page.getByRole('button', { name: 'New resume' }).click();
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page).not.toHaveURL(resumeUrl);
  await page.getByRole('tab', { name: 'Templates' }).click();
  await expect(panel.getByRole('radio', { name: 'Neon lime' })).toBeChecked();
});
