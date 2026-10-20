import { readFile } from 'node:fs/promises';
import { expect, expectAccessible, signUp, test, uniqueEmail } from './support.js';

test('create, edit with autosave, preview, download and delete a resume', async ({ page }) => {
  await signUp(page, uniqueEmail('journey'));
  await expect(page.getByText('No resumes yet')).toBeVisible();
  await expectAccessible(page);

  // Create
  await page.getByRole('button', { name: 'New resume' }).click();
  await page.getByLabel('Name').fill('Engineering CV');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page).toHaveURL(/\/resumes\/[0-9a-f-]{36}$/);
  await expect(page.getByLabel('Resume name')).toHaveValue('Engineering CV');

  // Edit
  await page.getByLabel('Full name').fill('Ada Lovelace');
  await page.getByLabel('Headline').fill('Analyst');
  const experience = page.getByRole('region', { name: 'Experience' });
  await experience.getByRole('button', { name: 'Add an entry' }).click();
  await experience.getByLabel('Job title').fill('Staff Engineer');
  await experience.getByLabel('Company').fill('Analytical Engines');
  await experience.getByLabel('Highlights').fill('Wrote the first program\nShipped the engine');
  await expect(page.getByText('All changes saved')).toBeVisible();

  // Live preview renders the same template
  const preview = page.frameLocator('iframe[title="Resume preview"]');
  await expect(preview.getByRole('heading', { name: 'Ada Lovelace' })).toBeVisible();
  await expect(preview.getByText('Wrote the first program')).toBeVisible();

  // Dates use the month picker (YYYY-MM)
  await experience.getByLabel('Start').fill('2021-04');
  await expect(page.getByText('All changes saved')).toBeVisible();

  await expectAccessible(page);

  // Persisted
  await page.reload();
  await expect(page.getByLabel('Full name')).toHaveValue('Ada Lovelace');
  await expect(
    page
      .getByRole('region', { name: 'Experience' })
      .getByText('Staff Engineer at Analytical Engines'),
  ).toBeVisible();

  // PDF from the server
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download PDF' }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toBe('Ada Lovelace - Resume.pdf');
  const pdf = await readFile(await download.path());
  expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');

  // Back to the dashboard, then delete
  await page.getByRole('button', { name: 'Back to resumes' }).click();
  await expect(page.getByRole('link', { name: 'Engineering CV', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Delete Engineering CV' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.getByText('No resumes yet')).toBeVisible();
});

test('a stale tab gets a conflict instead of overwriting newer edits', async ({
  page,
  context,
}) => {
  await signUp(page, uniqueEmail('conflict'));
  await page.getByRole('button', { name: 'New resume' }).click();
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page).toHaveURL(/\/resumes\//);
  const url = page.url();

  const other = await context.newPage();
  await other.goto(url);
  await expect(other.getByLabel('Full name')).toBeVisible();

  await page.getByLabel('Full name').fill('From tab one');
  await expect(page.getByText('All changes saved')).toBeVisible();

  await other.getByLabel('Full name').fill('From tab two');
  await expect(other.getByText('changed in another tab or device')).toBeVisible();

  await page.reload();
  await expect(page.getByLabel('Full name')).toHaveValue('From tab one');
});
