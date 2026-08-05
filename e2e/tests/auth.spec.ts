import { test, expect } from '@playwright/test';

function uniqueEmail() {
  return `e2e+${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
}

const PASSWORD = 'correcthorsebattery';

async function signup(page: import('@playwright/test').Page, email: string) {
  await page.goto('/signup');
  await page.locator('input[type=email]').fill(email);
  await page.locator('input[type=password]').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign up' }).click();
  await page.waitForURL('/');
}

test('unauthenticated visitors are redirected to login', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/login$/);
});

test('signup logs the user in and shows an empty dashboard', async ({ page }) => {
  await signup(page, uniqueEmail());
  await expect(page.getByText('My Forms')).toBeVisible();
  await expect(page.getByText('0 forms created')).toBeVisible();
});

test('creating a form shows it on the dashboard', async ({ page }) => {
  await signup(page, uniqueEmail());
  await page.getByRole('button', { name: 'New Form' }).click();
  await expect(page).toHaveURL(/\/forms\/.+\/edit$/);

  await page.getByText('Back to Dashboard').click();
  await expect(page).toHaveURL('/');
  await expect(page.locator('.form-card')).toHaveCount(1);
  await expect(page.getByText('1 form created')).toBeVisible();
});

test('a second account does not see the first account\'s forms', async ({ page }) => {
  await signup(page, uniqueEmail());
  await page.getByRole('button', { name: 'New Form' }).click();
  await expect(page).toHaveURL(/\/forms\/.+\/edit$/);
  await page.getByText('Back to Dashboard').click();
  await expect(page.locator('.form-card')).toHaveCount(1);

  await page.getByTitle('Log out').click();
  await expect(page).toHaveURL(/\/login$/);

  await signup(page, uniqueEmail());
  await expect(page.getByText('0 forms created')).toBeVisible();
  await expect(page.locator('.form-card')).toHaveCount(0);
});

test('can generate an MCP API token from settings', async ({ page }) => {
  await signup(page, uniqueEmail());
  await page.getByTitle('Settings').click();
  await expect(page).toHaveURL(/\/settings$/);

  await page.getByRole('button', { name: 'Generate Token' }).click();
  await expect(page.getByText("Copy this now")).toBeVisible();
  await expect(page.locator('code', { hasText: 'formly_' })).toBeVisible();
});

test('logout redirects to login and the dashboard becomes inaccessible again', async ({ page }) => {
  await signup(page, uniqueEmail());
  await page.getByTitle('Log out').click();
  await expect(page).toHaveURL(/\/login$/);

  await page.goto('/');
  await expect(page).toHaveURL(/\/login$/);
});

test('an existing user can log back in', async ({ page }) => {
  const email = uniqueEmail();
  await signup(page, email);
  await page.getByTitle('Log out').click();
  await expect(page).toHaveURL(/\/login$/);

  await page.locator('input[type=email]').fill(email);
  await page.locator('input[type=password]').fill(PASSWORD);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL('/');
  await expect(page.getByText('My Forms')).toBeVisible();
});

test('wrong password is rejected', async ({ page }) => {
  const email = uniqueEmail();
  await signup(page, email);
  await page.getByTitle('Log out').click();

  await page.locator('input[type=email]').fill(email);
  await page.locator('input[type=password]').fill('totallywrongpassword');
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.locator('.error-banner')).toContainText('Invalid email or password');
  await expect(page).toHaveURL(/\/login$/);
});
