import { expect, expectAccessible, signOut, signUp, test, uniqueEmail } from './support.js';

test('signed-in shell: sidebar navigation, collapse, Settings and profile menu', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await signUp(page, uniqueEmail('shell'));

  const sidebar = page.getByRole('complementary', { name: 'Sidebar' });
  const resumes = sidebar.getByRole('link', { name: 'Resumes' });
  await expect(resumes).toHaveAttribute('aria-current', 'page');
  await expectAccessible(page);

  // Settings is anchored at the bottom of the sidebar.
  const settings = sidebar.getByRole('link', { name: 'Settings' });
  const sidebarBox = await sidebar.boundingBox();
  const settingsBox = await settings.boundingBox();
  expect(
    (sidebarBox?.y ?? 0) +
      (sidebarBox?.height ?? 0) -
      ((settingsBox?.y ?? 0) + (settingsBox?.height ?? 0)),
  ).toBeLessThan(20);

  // Collapse: icons stay, labels go, the content gets wider; the choice persists.
  const main = page.locator('main#main');
  const wide = (await main.boundingBox())?.width ?? 0;
  await sidebar.getByRole('button', { name: 'Collapse sidebar' }).click();
  await expect(sidebar.getByRole('link', { name: 'Resumes' })).toHaveAttribute('title', 'Resumes');
  await expect(sidebar.getByText('Resumes', { exact: true })).toHaveCount(0);
  await expect.poll(async () => (await main.boundingBox())?.width ?? 0).toBeGreaterThan(wide);
  await page.reload();
  await expect(sidebar.getByRole('button', { name: 'Expand sidebar' })).toBeVisible();
  await sidebar.getByRole('button', { name: 'Expand sidebar' }).click();
  await expect(sidebar.getByText('Resumes', { exact: true })).toBeVisible();

  // The resume editor is a focused workspace without the sidebar; the account menu stays.
  await page.getByRole('button', { name: 'New resume' }).click();
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page).toHaveURL(/\/resumes\//);
  await expect(sidebar).toBeHidden();
  await expect(page.getByRole('button', { name: /Account menu for/ })).toBeVisible();
  await page.getByRole('button', { name: 'Back to resumes' }).click();
  await expect(sidebar).toBeVisible();

  // No horizontal overflow.
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );

  // Settings route
  await settings.click();
  await expect(page).toHaveURL(/\/settings\/appearance$/);
  await expect(settings).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();

  // Profile menu: keyboard, identity, Escape, then sign out.
  const avatar = page.getByRole('button', { name: /Account menu for shell-/ });
  await avatar.focus();
  await page.keyboard.press('Enter');
  const menu = page.getByRole('menu', { name: 'Account' });
  await expect(menu.getByText(/^shell-.*@e2e\.pypr\.dev$/)).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: 'Settings' })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(menu.getByRole('menuitem', { name: 'Sign out' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await expect(avatar).toBeFocused();
  await signOut(page);

  // Protected: Settings now needs sign-in again.
  await page.goto('/settings');
  await expect(page).toHaveURL(/\/login\?next=%2Fsettings/);
});

test('public pages have no sidebar', async ({ page }) => {
  for (const path of ['/', '/login', '/register']) {
    await page.goto(path);
    await expect(page.getByRole('complementary', { name: 'Sidebar' })).toHaveCount(0);
  }
});

test('on small screens the sidebar is a drawer', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await signUp(page, uniqueEmail('mobile'));

  await expect(page.getByRole('complementary', { name: 'Sidebar' })).toBeHidden();
  await page.getByRole('button', { name: 'Open menu' }).click();
  const drawer = page.getByRole('dialog', { name: 'Menu' });
  await expect(drawer).toBeVisible();
  await expectAccessible(page);

  await drawer.getByRole('link', { name: 'Settings' }).click();
  await expect(page).toHaveURL(/\/settings\/appearance$/);
  await expect(drawer).toBeHidden();

  await page.getByRole('button', { name: 'Open menu' }).click();
  await page.keyboard.press('Escape');
  await expect(drawer).toBeHidden();
  await expect(page.getByRole('button', { name: 'Open menu' })).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});
