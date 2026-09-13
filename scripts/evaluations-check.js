/**
 * The admin Evaluations tab, driven for real: ratings, month-by-month, and the
 * notes a coach wrote back to members (0072, surfaced 2026-09-13).
 *
 * Why a script and not a reading of the JSX: the tab has two render paths and
 * the interesting one is the branch nobody looks at — a coach with notes and no
 * ratings, where "No evaluations yet" used to return early and swallow them.
 * A build proves neither branch.
 *
 * Feed it to the Playwright runner's `filename` argument, admin dev server on
 * :5174. Reads only; it plants a session and answers every Supabase call from
 * fixtures, so it never touches the live project.
 */
async (page) => {
  await page.unrouteAll({ behavior: 'ignoreErrors' });

  const REF = 'ifwxtekyjgeljerslnzr';
  const KEY = `sb-${REF}-auth-token`;

  // A JWT the client will accept. Base64url by hand: the runner has no Buffer
  // and no URL global.
  const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  const b64 = (o) => {
    const str = JSON.stringify(o);
    let bits = '', out = '';
    for (let i = 0; i < str.length; i++) bits += str.charCodeAt(i).toString(2).padStart(8, '0');
    while (bits.length % 6) bits += '0';
    for (let i = 0; i < bits.length; i += 6) out += CHARS[parseInt(bits.slice(i, i + 6), 2)];
    return out;
  };
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const token = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: 'u1', role: 'authenticated', exp })}.sig`;
  const session = {
    access_token: token, refresh_token: 'r', token_type: 'bearer', expires_at: exp,
    user: { id: 'u1', aud: 'authenticated', role: 'authenticated', email: 'admin@corefitness.test',
            app_metadata: {}, user_metadata: {} },
  };
  await page.addInitScript(([k, s]) => localStorage.setItem(k, JSON.stringify(s)), [KEY, session]);

  const now = new Date();
  const iso = (d) => { const x = new Date(now); x.setDate(now.getDate() + d); return x.toISOString(); };

  const admin = { id: 'u1', role: 'admin', status: 'active', first_name: 'Gabrielle',
    last_name: 'Facalarin', email: 'admin@corefitness.test', phone: null, photo_url: null,
    created_at: iso(-400) };
  // RATED has both; QUIET has notes and no ratings — the branch under test.
  const RATED = { id: 't1', role: 'trainer', status: 'active', first_name: 'Kenji',
    last_name: 'Ramos', email: 'kenji@corefitness-test.com', phone: null, photo_url: null,
    created_at: iso(-300) };
  const QUIET = { id: 't2', role: 'trainer', status: 'active', first_name: 'Nora',
    last_name: 'Villanueva', email: 'nora@corefitness-test.com', phone: null, photo_url: null,
    created_at: iso(-40) };
  const MEMBER = { id: 'm1', role: 'member', status: 'active', first_name: 'Lea',
    last_name: 'Lorenzana', email: 'lea@corefitness-test.com', phone: null, photo_url: null,
    created_at: iso(-120) };

  const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

  const TABLES = {
    profiles: [admin, RATED, QUIET, MEMBER],
    trainer_profiles: [RATED, QUIET].map((t) => ({
      profile_id: t.id, specialization: 'Strength & conditioning', bio: 'Ten years coaching.',
      availability: null, certifications: ['NASM-CPT'], profiles: t,
    })),
    member_profiles: [{ profile_id: MEMBER.id, gym_id: null, qr_code: 'QR-m1',
      experience_level: 'beginner', created_at: iso(-120), profiles: MEMBER }],
    trainer_ratings: [{ trainer_id: 't1', member_id: 'm1', stars: 4, period,
      comment: 'Pushed me harder than I would have pushed myself.', updated_at: iso(-3) }],
    trainer_evaluation_months: [{ trainer_id: 't1', period, average_stars: 4, evaluations: 1,
      with_comment: 1, rating_count: 1 }],
    trainer_feedback: [
      { id: 'f1', trainer_id: 't1', member_id: 'm1', created_at: iso(-2),
        note: 'Form on the deadlift is close. Keep the bar against the shins.',
        recommendation: 'Two sessions a week for a month.' },
      { id: 'f2', trainer_id: 't2', member_id: 'm1', created_at: iso(-1),
        note: 'Good first week. Sleep is the thing to fix before we add volume.',
        recommendation: null },
    ],
  };

  await page.route(`**://${REF}.supabase.co/**`, async (route) => {
    const req = route.request();
    const after = req.url().replace(/^https?:\/\/[^/]+/, '');
    const qi = after.indexOf('?');
    const pathname = qi === -1 ? after : after.slice(0, qi);
    const query = qi === -1 ? '' : after.slice(qi + 1);
    const params = query.split('&').filter(Boolean).map((kv) => {
      const eq = kv.indexOf('=');
      return eq === -1 ? [decodeURIComponent(kv), ''] : [decodeURIComponent(kv.slice(0, eq)), decodeURIComponent(kv.slice(eq + 1))];
    });
    const wantsObject = (req.headers()['accept'] || '').includes('vnd.pgrst.object');
    // Content-Range must be exposed or a counted query reads as zero rows.
    const json = (b, s = 200) => route.fulfill({ status: s, contentType: 'application/json',
      body: JSON.stringify(b), headers: { 'Content-Range': '0-0/1',
        'Access-Control-Allow-Origin': '*', 'Access-Control-Expose-Headers': 'Content-Range' } });

    if (pathname.startsWith('/auth/v1/')) {
      return json(pathname.includes('/user') ? session.user : { ...session });
    }
    if (pathname.startsWith('/rest/v1/rpc/')) return json([]);
    if (pathname.startsWith('/rest/v1/')) {
      const table = pathname.split('/rest/v1/')[1];
      let rows = TABLES[table] ?? [];
      for (const [k, v] of params) {
        if (['select', 'order', 'limit', 'offset'].includes(k)) continue;
        const m = /^eq\.(.*)$/.exec(v);
        if (m && rows.length && k in rows[0]) rows = rows.filter((r) => String(r[k]) === m[1]);
      }
      return json(wantsObject ? (rows[0] ?? null) : rows);
    }
    return json([]);
  });

  const results = [];
  const rec = (id, name, pass, detail) => results.push({ id, name, pass, detail });
  // Section titles are `uppercase` in CSS and innerText honours that, so every
  // heading assertion compares case-insensitively. The first run failed on
  // exactly this and the screen was right all along.
  const has = (body, text) => body.toLowerCase().includes(text.toLowerCase());

  await page.goto('http://localhost:5174/trainers', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);

  async function openEvaluations(lastName) {
    await page.goto('http://localhost:5174/trainers', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(900);
    const card = page.getByText(lastName, { exact: false }).first();
    await card.click();
    await page.waitForTimeout(700);
    // Exact, so "Evaluations" does not also match a heading that contains it.
    await page.getByRole('button', { name: 'Evaluations', exact: true }).first().click();
    await page.waitForTimeout(900);
  }

  // ── A coach with both: ratings and notes ──────────────────────────────────
  await openEvaluations('Ramos');
  let body = await page.locator('body').innerText();

  rec('E1', 'The rating and its author are shown to the admin',
    body.includes('Pushed me harder') && body.includes('Lea Lorenzana'),
    body.includes('Lea Lorenzana') ? '' : 'no member name rendered');
  rec('E2', 'The month-by-month strip is there',
    /4\.0/.test(body) && body.includes('wrote a reason'));
  rec('E3', 'The notes the coach wrote to members are shown',
    has(body, 'Notes this coach wrote to members')
    && has(body, 'Keep the bar against the shins'));
  rec('E4', 'A recommendation is labelled as one',
    body.includes('Recommended: Two sessions a week'));
  rec('E5', 'The admin-only warning is still above all of it',
    body.includes('Admin only'));

  // ── The branch that used to swallow the notes ─────────────────────────────
  await openEvaluations('Villanueva');
  body = await page.locator('body').innerText();

  rec('E6', 'A coach with no ratings still says so',
    body.includes('No evaluations yet'));
  rec('E7', 'and their notes appear anyway, below it',
    has(body, 'Notes this coach wrote to members')
    && has(body, 'Sleep is the thing to fix'));
  rec('E8', "and a note with no recommendation does not invent one",
    !body.includes('Recommended:'));

  const failed = results.filter((r) => !r.pass);
  const lines = results.map((r) => `${r.pass ? 'PASS' : 'FAIL'}  ${r.id}  ${r.name}${r.detail ? ' — ' + r.detail : ''}`);
  return `${lines.join('\n')}\n\n${results.length - failed.length}/${results.length} passed`;
}
