import { test, expect, type APIRequestContext } from '@playwright/test';

// These forms are created and published via the REST API (not the UI) purely as test
// fixtures — the point of this suite is the public /f/:slug page, which must work with
// zero authentication for respondents.
async function createPublishedForm(request: APIRequestContext, title: string) {
  const email = `e2e-public+${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;

  // The `request` fixture is already scoped to this test and baseURL'd to the frontend
  // dev server (whose Vite proxy forwards /api to the backend), so a plain signup here
  // gives us one throwaway session cookie jar per test — no need for a separate context.
  await request.post('/api/auth/signup', {
    data: { email, password: 'correcthorsebattery' },
  });

  const formRes = await request.post('/api/forms');
  const { form } = await formRes.json();

  await request.put(`/api/forms/${form.id}`, { data: { title } });
  await request.post(`/api/forms/${form.id}/questions`, {
    data: { type: 'text', label: 'What is your name?', required: true },
  });

  const publishRes = await request.put(`/api/forms/${form.id}`, { data: { status: 'published' } });
  const { form: published } = await publishRes.json();

  return published.slug as string;
}

test('a published form can be viewed with no authentication', async ({ page, request }) => {
  const slug = await createPublishedForm(request, 'Public E2E Test Form');

  // Fresh page has no session cookie at all — this must not redirect to /login.
  await page.goto(`/f/${slug}`);
  await expect(page.getByRole('heading', { name: 'Public E2E Test Form' })).toBeVisible();
  await expect(page.getByText('What is your name?')).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/f/${slug}$`));
});

test('a published form can be submitted with no authentication', async ({ page, request }) => {
  const slug = await createPublishedForm(request, 'Public E2E Submit Test');

  await page.goto(`/f/${slug}`);
  await page.locator('input.input').first().fill('Ada Lovelace');
  await page.getByRole('button', { name: 'Submit Response' }).click();
  await expect(page.getByText('Thank you!')).toBeVisible();
});

test('an unknown slug shows a not-found message instead of erroring', async ({ page }) => {
  await page.goto('/f/this-slug-does-not-exist');
  await expect(page.getByText('Form not found')).toBeVisible();
});
