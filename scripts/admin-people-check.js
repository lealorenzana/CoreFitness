/**
 * People, in steps (2026-10-04):
 *   - Add member: four steps, the address from the Philippine place list, a
 *     readable password made for you, chips for known answers, a plan card,
 *     and a done screen with the login to hand over and "Record their first payment";
 *   - Add trainer: "Trains for" chips that say where members will find the coach;
 *     years and certifications saved onto the profile;
 *   - Credentials: issuer and expiry on a card, an Expiring filter;
 *   - Staff accounts: clear sign-in status, a narrowed account's areas, and
 *     changing them goes to set_staff_permissions().
 *
 * Playwright runner's `filename` argument, admin dev server on :5174.
 */
async (page) => {
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  const REF = 'ifwxtekyjgeljerslnzr';
  const KEY = `sb-${REF}-auth-token`;
  const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  const b64 = (o) => {
    const str = JSON.stringify(o); let bits = '', out = '';
    for (let i = 0; i < str.length; i++) bits += str.charCodeAt(i).toString(2).padStart(8, '0');
    while (bits.length % 6) bits += '0';
    for (let i = 0; i < bits.length; i += 6) out += CHARS[parseInt(bits.slice(i, i + 6), 2)];
    return out;
  };
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const session = {
    access_token: `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: 'u1', role: 'authenticated', exp })}.sig`,
    refresh_token: 'r', token_type: 'bearer', expires_at: exp,
    user: { id: 'u1', aud: 'authenticated', role: 'authenticated', email: 'owner@gym.test', app_metadata: {}, user_metadata: {} },
  };
  await page.addInitScript(([k, s]) => localStorage.setItem(k, JSON.stringify(s)), [KEY, session]);
  const iso = (d) => new Date(Date.now() + d * 86400000).toISOString();
  const day = (d) => new Date(Date.now() + 8 * 3600000 + d * 86400000).toISOString().slice(0, 10);
  const person = (id, role, first, status = 'active') => ({ id, role, status, first_name: first, last_name: 'Test', email: `${first.toLowerCase()}@gym.test`, phone: null, photo_url: null, created_at: iso(-100) });
  const TABLES = {
    profiles: [person('u1', 'admin', 'Olga'), person('s1', 'staff', 'Dina'), person('s2', 'staff', 'Cora', 'suspended'), person('t1', 'trainer', 'Tess')],
    membership_plans: [{ id: 'p1', name: 'Monthly', tier: 'premium', price: 1500, duration_days: 30, is_active: true }, { id: 'p2', name: 'Free Plan', tier: 'free', price: 0, duration_days: null, is_active: true }],
    member_profiles: [], memberships: [], payments: [], trainer_profiles: [{ profile_id: 't1', specialization: 'Strength', bio: null, availability: null, years_experience: 5, certifications: [], focus_areas: ['Strength'], achievements: null, profiles: person('t1', 'trainer', 'Tess') }],
    trainer_credentials: [
      { id: 'c1', trainer_id: 't1', title: 'First Aid / CPR', file_path: 't1/a.pdf', mime_type: 'application/pdf', size_bytes: 1000, status: 'verified', uploaded_at: iso(-300), reviewed_at: iso(-290), review_note: null,
        issuer: 'Philippine Red Cross', credential_number: 'PRC-1', issued_on: day(-300), expires_on: day(10), trainer_profiles: { profiles: { first_name: 'Tess', last_name: 'Test', photo_url: null } } }],
    staff_permissions: [{ user_id: 's1', areas: ['checkins', 'shop'] }],
  };
  const CALLS = [];
  await page.route(`**://${REF}.supabase.co/**`, async (route) => {
    const req = route.request();
    const after = req.url().replace(/^https?:\/\/[^/]+/, '');
    const qi = after.indexOf('?');
    const path = qi === -1 ? after : after.slice(0, qi);
    const query = qi === -1 ? '' : decodeURIComponent(after.slice(qi + 1));
    const one = (req.headers()['accept'] || '').includes('vnd.pgrst.object');
    const json = (b, s = 200) => route.fulfill({ status: s, contentType: 'application/json', body: JSON.stringify(b),
      headers: { 'Content-Range': '0-0/1', 'Access-Control-Allow-Origin': '*', 'Access-Control-Expose-Headers': 'Content-Range' } });
    if (path.startsWith('/auth/v1/')) return json(path.includes('/user') ? session.user : session);
    if (path.startsWith('/functions/v1/')) {
      const fn = path.split('/functions/v1/')[1];
      CALLS.push(['fn', fn, JSON.parse(req.postData() || '{}')]);
      return json({ id: fn === 'create-trainer' ? 't9' : fn === 'create-staff' ? 's9' : 'm9', email: 'x@gym.test' });
    }
    if (path.startsWith('/rest/v1/rpc/')) {
      const fn = path.split('/rest/v1/rpc/')[1];
      CALLS.push(['rpc', fn, JSON.parse(req.postData() || '{}')]);
      if (fn === 'my_gym_context') return json([{ gym_id: 'gym-1', gym_name: 'Harbour Strength', slug: 'harbour', role: 'admin', status: 'active',
        lock_reason: null, short_name: null, logo_url: null, accent: 'violet', gym_count: 1, onboarded: true, onboarding_step: null, gym_state: 'open' }]);
      if (fn === 'is_email_taken' || fn === 'is_phone_taken') return json(false);
      return json(fn === 'my_gym_modules' || fn === 'my_support_grant' ? [] : null);
    }
    if (path.startsWith('/rest/v1/')) {
      const t = path.split('/rest/v1/')[1].replace('gym_people', 'profiles');
      if (req.method() !== 'GET') { CALLS.push([req.method(), t, req.postData() ? JSON.parse(req.postData()) : null, query]); return json([{ id: 'x', profile_id: 'x' }]); }
      let rows = TABLES[t] ?? [];
      if (t === 'profiles' && /role=in\.\(admin,staff\)/.test(query)) rows = rows.filter((r) => r.role === 'admin' || r.role === 'staff');
      if (t === 'profiles' && /role=eq\.trainer/.test(query)) rows = rows.filter((r) => r.role === 'trainer');
      return json(one ? (rows[0] ?? null) : rows);
    }
    return json([]);
  });

  const out = [];
  await page.setViewportSize({ width: 1400, height: 900 });
  const text = () => page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));
  const next = () => page.getByRole('button', { name: 'Next', exact: true }).click();

  // ---- Add member ---------------------------------------------------------------------------------
  await page.goto('http://localhost:5174/members', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /Add Member/ }).first().click();
  await page.getByText('1. Who they are').waitFor({ timeout: 15000 });
  await page.getByLabel('First name').fill('Ana');
  await page.getByLabel('Last name').fill('Reyes');
  await page.getByRole('radio', { name: 'Female' }).click();
  await page.waitForFunction(() => document.querySelectorAll('select[aria-label="Province"] option').length > 50, null, { timeout: 10000 });
  await page.getByLabel('Province').selectOption('Occidental Mindoro');
  await page.getByLabel('City or municipality').selectOption('Mamburao');
  await page.getByLabel('Street or barangay').fill('Brgy. Payompon');
  await next();
  await page.getByLabel('Email').fill('ana@x.ph');
  const pw = await page.getByRole('textbox', { name: 'Password' }).inputValue();
  out.push('a readable password is made for them: ' + (/^[A-Z][a-z]+-\d{4}-[a-z]+$/.test(pw) ? 'yes' : 'NO ' + pw));
  await next();
  await page.getByRole('radio', { name: 'Beginner' }).click();
  await page.getByLabel('Emergency contact name').fill('Rosa Reyes');
  await page.getByRole('radio', { name: 'Parent' }).click();
  await next();
  out.push('plans as cards with price: ' + (/Monthly 30 days ₱1,500/.test(await text()) ? 'yes' : 'MISSING'));
  await page.screenshot({ path: 'shots/admin-add-member-plan.png' });
  await page.getByRole('button', { name: 'Add member', exact: true }).last().click();
  await page.getByText('Hand them their login').waitFor({ timeout: 8000 });
  const cm = CALLS.find((c) => c[1] === 'create-member');
  out.push('created with every answer: ' + (cm && cm[2].address === 'Brgy. Payompon, Mamburao, Occidental Mindoro' && cm[2].gender === 'female' && cm[2].experienceLevel === 'beginner'
    && cm[2].emergencyContactRelationship === 'Parent' && cm[2].planId === 'p1' ? 'yes' : 'MISSING ' + JSON.stringify(cm?.[2])));
  out.push('done screen: login to copy and the first payment next: ' + (new RegExp(pw).test(await text()) && (await page.getByRole('button', { name: 'Record their first payment' }).count()) === 1 ? 'yes' : 'MISSING'));
  await page.screenshot({ path: 'shots/admin-add-member-done.png' });

  // ---- Add trainer -----------------------------------------------------------------------------------
  await page.goto('http://localhost:5174/trainers', { waitUntil: 'domcontentloaded' });
  await page.getByText('Tess Test').first().waitFor({ timeout: 15000 });
  out.push('a verified, expiring credential shows on the card: ' + (/1 verified · 1 expiring/.test(await text()) ? 'yes' : 'MISSING'));
  await page.getByRole('button', { name: /Add trainer/ }).first().click();
  await page.getByLabel('First name').fill('Ben');
  await page.getByLabel('Last name').fill('Cruz');
  await page.getByRole('radio', { name: '5–9 years' }).click();
  await next();
  await page.getByRole('button', { name: 'Boxing Coach' }).click();
  await page.getByRole('button', { name: 'Boxing', exact: true }).click();
  await page.getByRole('button', { name: 'Weight loss' }).click();
  out.push('says where members will find them: ' + (/Members will find them under: .*Sport & fight/.test(await text()) && /Lose fat/.test(await text()) ? 'yes' : 'MISSING'));
  await page.getByRole('button', { name: 'First Aid / CPR' }).click();
  await next();
  await page.getByRole('button', { name: 'Mon–Sat' }).click();
  await next();
  await page.getByLabel('Email').fill('ben@x.ph');
  await page.getByRole('button', { name: 'Add trainer' }).last().click();
  await page.getByText('is on the team').waitFor({ timeout: 8000 });
  const up = CALLS.find((c) => c[0] === 'PATCH' && c[1] === 'trainer_profiles');
  out.push('coaching details saved onto the profile: ' + (up && up[2].years_experience === 6 && up[2].focus_areas.includes('Boxing') && up[2].certifications.includes('First Aid / CPR') ? 'yes' : 'MISSING ' + JSON.stringify(up?.[2])));

  // ---- Credentials ------------------------------------------------------------------------------------
  await page.goto('http://localhost:5174/credentials', { waitUntil: 'domcontentloaded' });
  await page.getByText('First Aid / CPR').first().waitFor({ timeout: 15000 });
  const t = await text();
  out.push('issuer and expiry on the card: ' + (/Philippine Red Cross · expires in 10 days/.test(t) ? 'yes' : 'MISSING'));
  out.push('an expiring count: ' + (/Expiring\s*1\b/i.test(t) && /Expiring or lapsed\s*1\b/i.test(t) ? 'yes' : 'MISSING ' + (t.match(/Expiring[^A-Z]{0,30}/i) || [''])[0]));
  out.push('the expiry sweep runs on open: ' + (CALLS.some((c) => c[1] === 'credential_expiry_sweep') ? 'yes' : 'MISSING'));

  // ---- Staff accounts -----------------------------------------------------------------------------------
  await page.goto('http://localhost:5174/settings', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /Staff Accounts/ }).first().click();
  await page.getByText('Front-desk staff').waitFor({ timeout: 10000 });
  const st = await text();
  out.push('status said plainly: ' + (/Can sign in/.test(st) && /Suspended — cannot sign in/.test(st) && (await page.getByRole('button', { name: /Let them sign in again/ }).count()) === 1 ? 'yes' : 'MISSING'));
  out.push('a narrowed account shows its areas: ' + (/Check-ins Shop/.test(st) && /The whole front desk/.test(st) ? 'yes' : 'MISSING'));
  await page.getByRole('button', { name: 'Change' }).first().click();
  await page.getByLabel('Payments').check();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.waitForTimeout(600);
  const sp = CALLS.find((c) => c[1] === 'set_staff_permissions');
  out.push('changing it goes to the database: ' + (sp && sp[2].p_user === 's1' && sp[2].p_areas.includes('payments') && sp[2].p_areas.includes('shop') ? 'yes' : 'MISSING ' + JSON.stringify(sp?.[2])));
  await page.screenshot({ path: 'shots/admin-staff.png', fullPage: true });
  return out.join('\n');
}
