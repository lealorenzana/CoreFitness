/**
 * Rating a coach, in both directions.
 *
 * "Users cannot rate a coach" turned out not to be a broken form: the machinery
 * works, and the *gate* hid itself. `may_rate_trainer()` requires a finished
 * session, and when it said no the screen rendered no stars, no form and no
 * sentence — indistinguishable from a feature that does not work.
 *
 * So the useful assertion is not "can an eligible member submit" alone. It is
 * that an INELIGIBLE member is told why, which is the half that was missing.
 *
 * Playwright runner's `filename`, member dev server on :5173.
 */
async (page) => {
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  const REF = 'ifwxtekyjgeljerslnzr';
  const KEY = `sb-${REF}-auth-token`;
  const C = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  const b64 = (o) => {
    const s = JSON.stringify(o); let bits = '', out = '';
    for (let i = 0; i < s.length; i++) bits += s.charCodeAt(i).toString(2).padStart(8, '0');
    while (bits.length % 6) bits += '0';
    for (let i = 0; i < bits.length; i += 6) out += C[parseInt(bits.slice(i, i + 6), 2)];
    return out;
  };
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const now = new Date();
  const iso = (d, h, m) => { const x = new Date(now); x.setDate(now.getDate() + d); x.setHours(h, m, 0, 0); return x.toISOString(); };

  const ME = { id: 'm1', first_name: 'Lea', last_name: 'Lorenzana', email: 'lea@corefitness-test.com',
    role: 'member', status: 'active', phone: null, photo_url: null, created_at: iso(-120, 9, 0) };
  const session = {
    access_token: `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: 'm1', role: 'authenticated', exp })}.sig`,
    refresh_token: 'r', token_type: 'bearer', expires_at: exp,
    user: { id: 'm1', aud: 'authenticated', role: 'authenticated', email: ME.email, app_metadata: {}, user_metadata: {} },
  };
  await page.addInitScript(([k, s]) => {
    localStorage.setItem(k, JSON.stringify(s));
    localStorage.setItem('user', JSON.stringify({ id: 'm1', name: 'Lea Lorenzana', email: 'lea@corefitness-test.com', role: 'member' }));
  }, [KEY, session]);

  const TRAINER = { id: 't1', first_name: 'Kenji', last_name: 'Ramos', photo_url: null,
    specialization: 'Strength and conditioning', bio: 'Ten years coaching.', availability: null,
    years_experience: 10, certifications: ['NASM-CPT'], focus_areas: ['Strength'], achievements: null };

  let mayRate = false;
  const TABLES = {
    profiles: [ME], public_trainers: [TRAINER],
    member_profiles: [{ profile_id: 'm1', qr_code: 'm1', created_at: iso(-120, 9, 0), profiles: ME }],
    trainer_rating_summary: [{ trainer_id: 't1', average_stars: null, rating_count: 1 }],
    trainer_ratings: [], classes: [], class_availability: [], public_trainer_credentials: [],
    memberships: [], membership_plans: [], bookings: [], pt_sessions: [],
    gym_settings: [{ id: true, gym_name: 'Core Fitness', address: 'Mamburao', phone: '+63 917 555 0101',
      email: 'hello@corefitness.ph', opening_time: '06:00', closing_time: '21:00', logo_url: null,
      short_name: 'CF', tagline: null, activity_options: [], updated_at: iso(0, 9, 0), updated_by: null }],
  };

  await page.route(`**://${REF}.supabase.co/**`, async (route) => {
    const req = route.request();
    const after = req.url().replace(/^https?:\/\/[^/]+/, '');
    const qi = after.indexOf('?');
    const path = qi === -1 ? after : after.slice(0, qi);
    const params = (qi === -1 ? '' : after.slice(qi + 1)).split('&').filter(Boolean).map((kv) => {
      const eq = kv.indexOf('=');
      return eq === -1 ? [decodeURIComponent(kv), ''] : [decodeURIComponent(kv.slice(0, eq)), decodeURIComponent(kv.slice(eq + 1))];
    });
    const one = (req.headers()['accept'] || '').includes('vnd.pgrst.object');
    const json = (b) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b),
      headers: { 'Content-Range': '0-0/1', 'Access-Control-Allow-Origin': '*', 'Access-Control-Expose-Headers': 'Content-Range' } });
    if (path.startsWith('/auth/v1/')) return json(path.includes('/user') ? session.user : { ...session });
    if (path.startsWith('/rest/v1/rpc/')) {
      const fn = path.split('/rest/v1/rpc/')[1];
      if (fn === 'may_rate_trainer') return json(mayRate);
      return json(null);
    }
    if (path.startsWith('/rest/v1/')) {
      const t = path.split('/rest/v1/')[1];
      let rows = TABLES[t] ?? [];
      for (const [k, v] of params) {
        if (['select', 'order', 'limit', 'offset'].includes(k)) continue;
        const m = /^eq\.(.*)$/.exec(v);
        if (m && rows.length && k in rows[0]) rows = rows.filter((r) => String(r[k]) === m[1]);
      }
      if (req.method() !== 'GET') return json(one ? (rows[0] ?? {}) : rows.slice(0, 1));
      return json(one ? (rows[0] ?? null) : rows);
    }
    return json([]);
  });

  await page.setViewportSize({ width: 393, height: 852 });
  const results = [];
  const check = (n, ok, d) => results.push(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? ` — ${d}` : ''}`);

  const open = async () => {
    await page.goto('http://localhost:5173/member/trainer/t1', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#boot', { state: 'detached', timeout: 9000 }).catch(() => {});
    await page.waitForTimeout(1600);
    return (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  };

  // ── Not eligible: the case that read as "rating is broken" ────────────────
  mayRate = false;
  let body = await open();
  await page.screenshot({ path: 'shots/rating-locked.png' });
  check('R1 no star input when the database says no',
    (await page.locator('[role="radio"]').count()) === 0);
  check('R2 the screen SAYS why, rather than rendering nothing',
    /Evaluations open after your first session/i.test(body), body.slice(0, 120));
  check('R3 it offers the thing that would make them eligible',
    // Nocturne: the one booking button sits above the lock and names the coach.
    (await page.getByRole('button', { name: /^Book (a session|with )/ }).count()) === 1);

  // ── Eligible: stars, and a submit that actually posts ─────────────────────
  mayRate = true;
  body = await open();
  await page.screenshot({ path: 'shots/rating-open.png' });
  check('R4 five stars, each its own control',
    (await page.locator('[role="radio"]').count()) === 5);
  check('R5 the lock is gone once eligible', !/Evaluations open after/i.test(body));

  let posted = null;
  page.on('request', (r) => {
    if (r.url().includes('/rest/v1/trainer_ratings') && r.method() !== 'GET') {
      posted = r.postData() ?? '';
    }
  });
  await page.locator('[role="radio"]').nth(3).click();
  await page.waitForTimeout(250);
  const picked = await page.locator('[role="radio"][aria-checked="true"]').count();
  check('R6 the chosen star is marked selected', picked === 1, `${picked} checked`);

  await page.getByRole('button', { name: /(Submit|Send) evaluation|Save changes/i }).first().click().catch(() => {});
  await page.waitForTimeout(1200);
  check('R7 submitting posts the rating', posted != null && /"stars":4/.test(posted), posted ?? 'NOTHING SENT');
  check('R8 the month is sent, so it lands in the right period',
    posted != null && /"period":"\d{4}-\d{2}-01"/.test(posted), posted ?? '');

  const failed = results.filter((r) => r.startsWith('FAIL')).length;
  return `${results.join('\n')}\n\n${results.length - failed}/${results.length} passed`;
}
