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

async function createPublishedMultiStepForm(request: APIRequestContext, title: string) {
  const email = `e2e-public-ms+${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  await request.post('/api/auth/signup', { data: { email, password: 'correcthorsebattery' } });

  const formRes = await request.post('/api/forms');
  const { form } = await formRes.json();

  const step1Res = await request.post(`/api/forms/${form.id}/steps`, { data: { title: 'Basics' } });
  const { step: step1 } = await step1Res.json();
  const step2Res = await request.post(`/api/forms/${form.id}/steps`, { data: { title: 'Details' } });
  const { step: step2 } = await step2Res.json();

  await request.post(`/api/forms/${form.id}/questions`, {
    data: { type: 'text', label: 'What is your name?', required: true, step_id: step1.id },
  });
  await request.post(`/api/forms/${form.id}/questions`, {
    data: { type: 'text', label: 'Tell us more', required: true, step_id: step2.id },
  });

  await request.put(`/api/forms/${form.id}`, { data: { title } });
  const publishRes = await request.put(`/api/forms/${form.id}`, { data: { status: 'published' } });
  const { form: published } = await publishRes.json();

  return published.slug as string;
}

test('a multi-step form shows a step progress indicator', async ({ page, request }) => {
  const slug = await createPublishedMultiStepForm(request, 'Multi-Step E2E Test');
  await page.goto(`/f/${slug}`);
  await expect(page.getByText('Step 1 of 2')).toBeVisible();
  await expect(page.getByText('What is your name?')).toBeVisible();
  await expect(page.getByText('Tell us more')).not.toBeVisible();
});

test('multi-step Next is blocked until the current step\'s required question is answered', async ({ page, request }) => {
  const slug = await createPublishedMultiStepForm(request, 'Multi-Step Validation Test');
  await page.goto(`/f/${slug}`);

  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.locator('.error-banner')).toBeVisible();
  await expect(page.getByText('Step 1 of 2')).toBeVisible();
});

test('multi-step Back preserves answers and the full flow submits', async ({ page, request }) => {
  const slug = await createPublishedMultiStepForm(request, 'Multi-Step Full Flow Test');
  await page.goto(`/f/${slug}`);

  await page.locator('input.input').fill('Grace Hopper');
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByText('Step 2 of 2')).toBeVisible();

  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.getByText('Step 1 of 2')).toBeVisible();
  await expect(page.locator('input.input')).toHaveValue('Grace Hopper');

  await page.getByRole('button', { name: 'Next' }).click();
  await page.locator('input.input').fill('Compiler pioneer');
  await page.getByRole('button', { name: 'Submit Response' }).click();
  await expect(page.getByText('Thank you!')).toBeVisible();
});
