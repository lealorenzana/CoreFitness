/**
 * Member sign-up, direction B (2026-11-02): the member card fills in as they
 * answer, in the gym's own colours, and flips when they are done.
 *   - the count is "of 4" over four steps (it said "of 3");
 *   - the gym's colour is on the screen, and Core Fitness's comes back on leaving;
 *   - the name, experience and goal appear on the card as they are chosen;
 *   - a typed friend's code, the experience and the goal reach the sign-up;
 *   - the plan step says they start free, and one tap marks interest;
 *   - an email that already has an account is told to sign in and switch gyms;
 *   - the card flips to the check-in code at the end.
 *
 * Playwright runner's `filename` argument, member dev server on :5173.
 */
async (page) => {
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  const REF = 'ifwxtekyjgeljerslnzr';
  const GYM = { id: 'gym-o', slug: 'harbour', name: 'Harbour Strength', short_name: null, logo_url: null, accent: 'teal', accent_action: null, tagline: null };
  const PLANS = [
    { id: 'mp-free', name: 'Free Plan', price: 0, duration_days: null, is_active: true, tier: 'free', description: null },
    { id: 'mp-prem', name: 'Premium', price: 999, duration_days: 30, is_active: true, tier: 'premium', description: 'Coaching\nThe assistant' }];
  let emailTaken = true;
  let signup = null;
  await page.route(`**://${REF}.supabase.co/**`, async (route) => {
    const req = route.request();
    const path = req.url().replace(/^https?:\/\/[^/]+/, '').split('?')[0];
    const json = (b, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(b),
      headers: { 'Access-Control-Allow-Origin': '*', 'Content-Range': '0-0/1', 'Access-Control-Expose-Headers': 'Content-Range' } });
    if (path === '/auth/v1/signup') {
      signup = JSON.parse(req.postData() || '{}');
      return json({ id: 'u-new', aud: 'authenticated', email: signup.email, identities: [{ id: 'i1' }], user_metadata: signup.data });
    }
    if (path.startsWith('/auth/v1/')) return json({ error: 'no session' }, 401);
    if (path.startsWith('/rest/v1/rpc/')) {
      const fn = path.split('/rest/v1/rpc/')[1];
      const b = JSON.parse(req.postData() || '{}');
      if (fn === 'list_gyms') return json([GYM, { ...GYM, id: 'gym-x', slug: 'x', name: 'Another Gym' }]);
      if (fn === 'gym_by_slug') return json([GYM].filter((g) => g.slug === b.p_slug));
      if (fn === 'gym_join_rules') return json([{ policy: 'open', approval: 'desk', min_age: 16 }]);
      if (fn === 'is_email_taken') return json(emailTaken);
      if (fn === 'is_phone_taken') return json(false);
      if (fn === 'public_plans') return json(PLANS);
      return json([]);
    }
    if (path.startsWith('/rest/v1/membership_plans')) return json(PLANS);
    return json([]);
  });

  const out = [];
  const say = (label, ok, detail = '') => out.push(`${label}: ${ok ? 'yes' : 'MISSING ' + detail}`);
  const text = () => page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));
  const cont = () => page.getByRole('button', { name: /^(Continue|Create my account)/ }).click();
  await page.setViewportSize({ width: 412, height: 900 });

  await page.goto('http://localhost:5173/register?gym=gym-o&join=harbour', { waitUntil: 'domcontentloaded' });
  await page.getByText('Start with you').waitFor({ timeout: 15000 });
  await page.waitForTimeout(1200);
  say('the count is of 4', /Step 1 of 4/.test(await page.locator('[data-step-label]').innerText()));
  say("the card wears the gym's name", /Harbour Strength/.test(await page.locator('[data-member-card]').innerText()));
  const accent = await page.evaluate(() => document.documentElement.dataset.accent);
  say("the gym's colour is on the screen", accent === 'teal', accent);

  await page.locator('#rg-first').fill('Juan');
  await page.locator('#rg-last').fill('Dela Cruz');
  say('the name appears on the card as it is typed', (await page.locator('[data-card-name]').innerText()) === 'Juan Dela Cruz');
  await page.getByLabel('Month').selectOption('3');
  await page.getByLabel('Day').selectOption('14');
  await page.getByLabel('Year').selectOption('1998');
  await page.getByRole('button', { name: 'Male', exact: true }).click();
  await page.screenshot({ path: 'shots/member-signup-1.png' });
  await cont();
  await page.getByText('Safety and sign-in').first().waitFor({ timeout: 8000 });
  say('step 2 says of 4', /Step 2 of 4/.test(await page.locator('[data-step-label]').innerText()));

  await page.locator('#rg-ec').fill('Maria Dela Cruz');
  await page.locator('#rg-ecp').fill('+63 912 345 6789');
  await page.locator('#rg-email').fill('juan@example.com');
  await page.locator('#rg-pw').fill('longenough1');
  await page.locator('#rg-pw2').fill('longenough1');
  await cont();
  await page.waitForTimeout(900);
  say('an email with an account is told to sign in and switch gyms', /switch gyms in More → Gyms/.test(await text()));
  emailTaken = false;
  await cont();
  await page.getByText('Your training').first().waitFor({ timeout: 8000 });

  await page.locator('[data-experience]').getByRole('button', { name: /Intermediate/ }).click();
  await page.locator('[data-goal]').getByRole('button', { name: 'Build muscle' }).click();
  await page.waitForTimeout(500);
  const card = await page.locator('[data-member-card]').innerText();
  say('experience and goal pop onto the card', /Experience: Intermediate/.test(card) && /Build muscle/.test(card), card);
  await page.locator('#rg-ref').fill('ab1c-def');
  say("a friend's code keeps to six letters", (await page.locator('#rg-ref').inputValue()) === 'ABCDEF');
  await page.screenshot({ path: 'shots/member-signup-3.png' });
  await cont();
  await page.getByText('You start on the free plan').waitFor({ timeout: 8000 });
  say('the plan step says they start free', /Nothing is charged here/.test(await text()));
  await page.locator('[data-plans]').getByRole('button', { name: /Premium/ }).click();
  say('one tap marks interest in a plan', /The desk will tell you about this one/.test(await text()));
  await page.getByRole('checkbox', { name: /I agree/ }).click();
  await page.screenshot({ path: 'shots/member-signup-4.png' });
  await cont();
  await page.locator('[data-register-done]').waitFor({ timeout: 10000 });
  await page.waitForTimeout(1200);
  const d = signup?.data ?? {};
  say('the sign-up carries experience, goal, code and plan', d.signup_experience === 'intermediate' && d.signup_goal === 'build-muscle'
    && d.referral_code === 'ABCDEF' && d.requested_plan_id === 'mp-prem' && d.terms_accepted === 'true', JSON.stringify(d));
  say('the card flips to the check-in code', (await page.locator('.rg-card.rg-flip').count()) === 1 && /Ready once the desk approves you/.test(await text()));
  await page.screenshot({ path: 'shots/member-signup-done.png' });
  await page.getByRole('button', { name: /Go to sign in/ }).click();
  await page.waitForTimeout(800);
  const back = await page.evaluate(() => document.documentElement.dataset.accent);
  say("Core Fitness's colour comes back on leaving", back === 'violet', back);
  return out.join('\n');
}
