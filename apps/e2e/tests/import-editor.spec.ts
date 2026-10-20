import { join } from 'node:path';
import { API_FIXTURES } from '../config.js';
import { expect, expectAccessible, signUp, test, uniqueEmail } from './support.js';

test('import a PDF, review it, create the resume and edit it', async ({ page }) => {
  await signUp(page, uniqueEmail('import'));
  await page.getByRole('button', { name: 'Import resume' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Import a resume' });
  await expectAccessible(page);

  // A scan has no text: clear error, nothing created.
  await dialog.locator('input[type="file"]').setInputFiles(join(API_FIXTURES, 'scanned.pdf'));
  await expect(dialog.getByText(/probably a scan or an image/)).toBeVisible();

  // A real resume: review step.
  await dialog.locator('input[type="file"]').setInputFiles(join(API_FIXTURES, 'resume.pdf'));
  await expect(dialog.getByText('What we found')).toBeVisible();
  await expect(dialog.getByText('Jordan Example', { exact: true })).toBeVisible();
  await expect(dialog.getByText('Experience')).toBeVisible();
  await expect(dialog.getByLabel('Resume name')).toHaveValue('Jordan Example resume');
  await dialog.getByLabel('Resume name').fill('Jordan (imported)');
  await dialog.getByRole('button', { name: 'Create resume' }).click();

  // Opens in the editor with the imported content.
  await expect(page).toHaveURL(/\/resumes\/[0-9a-f-]{36}$/);
  await expect(page.getByLabel('Full name')).toHaveValue('Jordan Example');
  const experience = page.getByRole('region', { name: 'Experience' });
  await expect(experience.getByText('Senior Engineer at Example GmbH')).toBeVisible();
  const education = page.getByRole('region', { name: 'Education' });
  await education.getByRole('button', { name: 'BSc, Example University' }).click();
  await expect(education.getByLabel('Start')).toHaveValue('2014');
  // Any website or profile the parser found, as a link.
  await expect(
    page.getByRole('region', { name: 'Websites & Profiles' }).getByText('Portfolio'),
  ).toBeVisible();
  await expect(
    page.frameLocator('iframe[title="Resume preview"]').getByRole('link', { name: /Portfolio/ }),
  ).toHaveAttribute('href', 'https://jordan.design/');

  await page.getByRole('button', { name: 'Back to resumes' }).click();
  await expect(page.getByRole('link', { name: 'Jordan (imported)', exact: true })).toBeVisible();
  await expect(page.getByText('Product Engineer')).toBeVisible();
});

test('cancelling an import creates nothing', async ({ page }) => {
  await signUp(page, uniqueEmail('cancel'));
  await page.getByRole('button', { name: 'Import resume' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Import a resume' });
  await dialog.locator('input[type="file"]').setInputFiles(join(API_FIXTURES, 'resume.docx'));
  await expect(dialog.getByText('What we found')).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await page.reload();
  await expect(page.getByText('No resumes yet')).toBeVisible();
});

test('editor: full height, tabs, accordions, unique sections, drag-and-drop order', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signUp(page, uniqueEmail('editor'));
  await page.getByRole('button', { name: 'New resume' }).click();
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page).toHaveURL(/\/resumes\//);

  // One header row: the editor's controls sit next to the account menu; no page scrolling.
  const header = page.locator('header').first();
  await expect(header.getByRole('button', { name: 'Back to resumes' })).toBeVisible();
  await expect(header.getByRole('button', { name: /Account menu for/ })).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight),
  ).toBe(true);
  await expectAccessible(page);

  // Tabs: Templates holds the template choice; Form is the editor.
  await page.getByRole('tab', { name: 'Templates' }).click();
  await expect(
    page.getByRole('tabpanel', { name: 'Templates' }).getByRole('radio', { name: /Classic/ }),
  ).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('tab', { name: 'Templates' }).press('ArrowLeft');
  await expect(page.getByRole('tab', { name: 'Form' })).toHaveAttribute('aria-selected', 'true');

  // Accordion: collapsing keeps the values.
  await page.getByLabel('Full name').fill('Ada Lovelace');
  const basicsToggle = page.getByRole('button', { name: /^Personal details/ });
  await basicsToggle.click();
  await expect(basicsToggle).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByLabel('Full name')).toBeHidden();
  await basicsToggle.click();
  await expect(page.getByLabel('Full name')).toHaveValue('Ada Lovelace');

  // Add section: a two-column grid of buttons. Standard sections only once; custom sections as
  // many as wanted, each focused as it's added.
  const addGrid = page.getByRole('region', { name: 'Add a section' });
  const addedExperience = addGrid.getByRole('button', { name: 'Experience (already added)' });
  await expect(addedExperience).toBeDisabled();
  const first = await addedExperience.boundingBox();
  const second = await addGrid
    .getByRole('button', { name: 'Education (already added)' })
    .boundingBox();
  expect(first && second && second.y === first.y && second.x > first.x).toBe(true);
  const addCustom = addGrid.getByRole('button', { name: 'Add Custom section' });
  await addCustom.click();
  const customs = page.getByRole('region', { name: 'Additional' });
  await expect(customs.getByRole('button', { name: /^Additional 0 entries/ })).toBeFocused();
  await addCustom.click();
  await expect(customs).toHaveCount(2);
  await customs.first().getByLabel('Section title').fill('Volunteering');
  await page.getByRole('region', { name: 'Additional' }).getByLabel('Section title').fill('Talks');
  await expect(page.getByText('All changes saved')).toBeVisible();

  // Keyboard reordering: Skills moves above Education.
  const order = () =>
    page
      .locator('section[aria-label]')
      .evaluateAll((els) =>
        els.map((el) => el.getAttribute('aria-label')).filter((l) => l !== 'Personal details'),
      );
  expect(await order()).toEqual(['Experience', 'Education', 'Skills', 'Volunteering', 'Talks']);
  const skillsHandle = page.getByRole('button', { name: 'Reorder Skills' });
  const live = page.locator('[id^="DndLiveRegion"]');
  await skillsHandle.focus();
  await page.keyboard.press('Space');
  await expect(live).toContainText('Skills is over position 3 of 5');
  // dnd-kit starts listening for arrow keys a moment after the pick-up (on a timer); a person
  // never presses that fast, a test can.
  await page.waitForTimeout(200);
  await page.keyboard.press('ArrowUp');
  await expect(live).toContainText('Skills is over position 2 of 5');
  await page.keyboard.press('Space');
  await expect(live).toContainText('Skills dropped at position 2 of 5');
  await expect.poll(order).toEqual(['Experience', 'Skills', 'Education', 'Volunteering', 'Talks']);

  // Pointer drag: Talks moves to the top.
  for (const name of ['Experience', 'Skills', 'Education', 'Volunteering', 'Talks']) {
    await page.getByRole('button', { name: new RegExp(`^${name} \\d+ (entry|entries)`) }).click();
  }
  const talks = page.getByRole('button', { name: 'Reorder Talks' });
  const target = page.getByRole('button', { name: 'Reorder Experience' });
  const from = await talks.boundingBox();
  const to = await target.boundingBox();
  if (!from || !to) throw new Error('missing handles');
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2, from.y - 20, { steps: 5 });
  await page.mouse.move(to.x + to.width / 2, to.y + 2, { steps: 15 });
  await page.mouse.up();
  await expect.poll(order).toEqual(['Talks', 'Experience', 'Skills', 'Education', 'Volunteering']);
  await expect(page.getByText('All changes saved')).toBeVisible();

  // Everything persisted.
  await page.reload();
  await expect.poll(order).toEqual(['Talks', 'Experience', 'Skills', 'Education', 'Volunteering']);
  await expect(page.getByLabel('Full name')).toHaveValue('Ada Lovelace');

  // A removed standard section can be added again, and goes to the end.
  await page.getByRole('button', { name: 'Delete Education' }).click();
  await page
    .getByRole('region', { name: 'Education' })
    .getByRole('button', { name: 'Delete', exact: true })
    .click();
  await addGrid.getByRole('button', { name: 'Add Education' }).click();
  await expect.poll(order).toEqual(['Talks', 'Experience', 'Skills', 'Volunteering', 'Education']);
  await expect(addGrid.getByRole('button', { name: 'Education (already added)' })).toBeDisabled();
  await expect(page.getByText('All changes saved')).toBeVisible();

  // Still two columns on a phone, without sideways scrolling.
  await page.setViewportSize({ width: 360, height: 780 });
  await addGrid.scrollIntoViewIfNeeded();
  const narrow = await addGrid.getByRole('button', { name: 'Add Projects' }).boundingBox();
  const narrowSkills = await addGrid
    .getByRole('button', { name: 'Skills (already added)' })
    .boundingBox();
  expect(narrow && narrowSkills && narrow.y === narrowSkills.y).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= 360)).toBe(true);
  await page.setViewportSize({ width: 1440, height: 900 });

  // Back to resumes.
  await page.getByRole('button', { name: 'Back to resumes' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
});
