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

test('adds, keeps, rejects and removes a profile photo', async ({ page }) => {
  await signUp(page, uniqueEmail('photo'));
  await page.getByRole('button', { name: 'New resume' }).click();
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page).toHaveURL(/\/resumes\//);
  await page.getByLabel('Full name').fill('Grace Hopper');

  // No photo yet: initials as the placeholder, nothing in the preview.
  const preview = page.frameLocator('iframe[title="Resume preview"]');
  await expect(page.getByRole('button', { name: 'Upload photo' })).toBeVisible();
  await expect(preview.locator('img.photo')).toHaveCount(0);

  // A real PNG drawn by the browser.
  const png = Buffer.from(
    await page.evaluate(async () => {
      const canvas = new OffscreenCanvas(300, 240);
      const context = canvas.getContext('2d');
      if (!context) throw new Error('no 2d context');
      context.fillStyle = '#3366ff';
      context.fillRect(0, 0, 300, 240);
      const blob = await canvas.convertToBlob({ type: 'image/png' });
      return Array.from(new Uint8Array(await blob.arrayBuffer()));
    }),
  );
  const input = page.locator('input[type="file"]');
  await input.setInputFiles({ name: 'me.png', mimeType: 'image/png', buffer: png });
  await expect(page.getByRole('img', { name: 'Your resume photo' })).toBeVisible();
  await expect(preview.locator('img.photo')).toHaveAttribute('src', /^data:image\/jpeg;base64,/);
  await expect(page.getByText('All changes saved')).toBeVisible();
  await expectAccessible(page);

  // A file that only pretends to be an image is refused; the photo and edits stay.
  await input.setInputFiles({
    name: 'fake.jpg',
    mimeType: 'image/jpeg',
    buffer: Buffer.from('not really an image'),
  });
  await expect(page.getByRole('alert').getByText(/JPEG, PNG or WebP/)).toBeVisible();
  await expect(page.getByRole('img', { name: 'Your resume photo' })).toBeVisible();
  await expect(page.getByLabel('Full name')).toHaveValue('Grace Hopper');

  // Kept after a reload, then removed.
  await page.reload();
  await expect(page.getByRole('img', { name: 'Your resume photo' })).toBeVisible();
  await expect(preview.locator('img.photo')).toHaveCount(1);
  await page.getByRole('button', { name: 'Remove', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Upload photo' })).toBeVisible();
  await expect(preview.locator('img.photo')).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Upload photo' })).toBeVisible();
});

test('websites and profiles: any link, validated, shown and linked in the preview', async ({
  page,
}) => {
  await signUp(page, uniqueEmail('links'));
  await page.getByRole('button', { name: 'New resume' }).click();
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page).toHaveURL(/\/resumes\//);

  // The fixed Website / LinkedIn / GitHub fields are gone from Personal details.
  await expect(page.getByLabel('LinkedIn', { exact: true })).toHaveCount(0);

  await page.getByRole('button', { name: 'Add Websites & Profiles' }).click();
  const links = page.getByRole('region', { name: 'Websites & Profiles' });
  await links.getByRole('button', { name: 'Add an entry' }).click();
  await links.getByLabel('Label').fill('Portfolio');
  await links.getByLabel('URL').fill('javascript:alert(1)');
  await expect(links.getByText('Enter a web address like example.com')).toBeVisible();
  await links.getByLabel('URL').fill('dribbble.com/grace');
  await expect(page.getByText('All changes saved')).toBeVisible();
  await expectAccessible(page);

  const preview = page.frameLocator('iframe[title="Resume preview"]');
  const link = preview.getByRole('link', { name: 'Portfolio dribbble.com/grace' });
  await expect(link).toHaveAttribute('href', 'https://dribbble.com/grace');

  await page.reload();
  await expect(
    page.getByRole('region', { name: 'Websites & Profiles' }).getByText('Portfolio'),
  ).toBeVisible();
});
