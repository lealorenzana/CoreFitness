/**
 * 0147 on Your app: the AI coach card — the two limits (owner edits, desk
 * reads), this Manila month's totals with an estimated cost, a bar per day,
 * "This needs migration 0147." when the function is missing, and never a
 * member's name or id.
 *
 * Your app is owner-only (ProtectedRoute adminOnly), so the desk cannot reach
 * the page; the desk's read-only card is proven by mounting the same component
 * through the dev server with the desk's context, which is what the card reads.
 *
 * Setup copied from admin-switches-check.js. Admin dev server on :5174.
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
    user: { id: 'u1', aud: 'authenticated', role: 'authenticated', email: 'owner@harbour.test', app_metadata: {}, user_metadata: {} },
  };
  await page.addInitScript(([k, s]) => localStorage.setItem(k, JSON.stringify(s)), [KEY, session]);

  const STATE = { role: 'admin', missing: false, assistant: 'on', cost: 0.4218 };
  const owner = { id: 'u1', role: 'admin', status: 'active', first_name: 'Ana', last_name: 'Ferrer',
    email: 'owner@harbour.test', phone: null, photo_url: null, created_at: new Date().toISOString() };
  // Members who used the coach. Nothing about them may reach the card.
  const MEMBERS = [
    { id: '7c1e2b9a-5d4f-4a11-9e0b-aaaa00000001', first_name: 'Maricel', last_name: 'Dimaculangan' },
    { id: '7c1e2b9a-5d4f-4a11-9e0b-aaaa00000002', first_name: 'Rodolfo', last_name: 'Bagasbas' },
  ];

  const manilaToday = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
  const monthStart = manilaToday.slice(0, 8) + '01';
  const DAYS = [];
  for (let d = 1; d <= Number(manilaToday.slice(8, 10)); d++) {
    DAYS.push({ day: manilaToday.slice(0, 8) + String(d).padStart(2, '0'), messages: d === 1 ? 0 : (d * 7) % 23 });
  }
  const LIMITS = { daily: 30, monthly: 1500 };
  const usage = () => ({
    daily_limit: LIMITS.daily, monthly_limit: LIMITS.monthly, month_start: monthStart,
    messages_month: 312, tokens_in_month: 160900, tokens_out_month: 9998, messages_today: 14,
    members_using_month: 7, est_cost_usd_month: STATE.cost, days: DAYS,
    // Never sent by 0147. Here so a card that rendered whatever it was given would show it.
    members: MEMBERS.map((m) => ({ member_id: m.id, name: m.first_name + ' ' + m.last_name, messages: 40 })),
  });

  const FEATURES = [['front_desk', null, 'The front desk', 1], ['assistant', null, 'The in-app assistant', 7], ['analytics', null, 'Analytics and retention', 9]];
  const modulesList = () => FEATURES.map(([key, parent, label, sort]) => ({
    feature_key: key, label, description: label + ' — what it is.', sort_order: sort, parent_key: parent,
    state: key === 'assistant' ? STATE.assistant : 'on', enabled: key === 'assistant' ? STATE.assistant === 'on' : true,
  }));
  const gym = {
    gym_id: 'gym-b', gym_name: 'Harbour Strength', slug: 'harbour-strength',
    short_name: null, logo_url: null, accent: 'violet', accent_action: null,
    points_name: 'Points', points_name_short: 'points', welcome_message: null, tagline: null,
    vocabulary: { member: 'member', members: 'members', trainer: 'coach', trainers: 'coaches', class: 'class', classes: 'classes' },
    join_policy: 'code', join_code: 'HARB42',
  };

  const CALLS = {};
  await page.route(`**://${REF}.supabase.co/**`, async (route) => {
    const req = route.request();
    const after = req.url().replace(/^https?:\/\/[^/]+/, '');
    const path = (after.indexOf('?') === -1 ? after : after.slice(0, after.indexOf('?')));
    const json = (b, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(b),
      headers: { 'Content-Range': '0-9/10', 'Access-Control-Allow-Origin': '*', 'Access-Control-Expose-Headers': 'Content-Range' } });
    if (path.startsWith('/auth/v1/')) return json(path.includes('/user') ? session.user : { ...session });
    if (path.startsWith('/rest/v1/rpc/')) {
      const fn = path.split('/rest/v1/rpc/')[1];
      const body = JSON.parse(req.postData() || '{}');
      CALLS[fn] = body;
      if (fn === 'my_gym_app') return json([{ ...gym, modules: { assistant: STATE.assistant === 'on' } }]);
      if (fn === 'my_gym_context') return json([{
        gym_id: gym.gym_id, gym_name: gym.gym_name, slug: gym.slug, role: STATE.role, status: 'active',
        lock_reason: null, short_name: null, logo_url: null, accent: gym.accent, gym_count: 1,
        onboarded: true, onboarding_step: null, gym_state: 'open', accent_action: null,
      }]);
      if (fn === 'my_gym_modules') return json(modulesList());
      if (fn === 'gym_ai_usage') {
        // What PostgREST answers for a function that is not in the schema cache.
        if (STATE.missing) return json({ code: 'PGRST202', message: 'Could not find the function public.gym_ai_usage without parameters in the schema cache', details: null, hint: null }, 404);
        return json(usage());
      }
      if (fn === 'set_ai_coach_limits') {
        if (STATE.role !== 'admin') return json({ code: '42501', message: "Only the gym's owner can change the coach's limits." }, 403);
        LIMITS.daily = body.p_daily; LIMITS.monthly = body.p_monthly;
        return json(null);
      }
      if (fn === 'my_support_grant') return json([]);
      return json(null);
    }
    if (!path.startsWith('/rest/v1/')) return json([]);
    const t = path.split('/rest/v1/')[1];
    if (t === 'profiles' || t === 'gym_people') {
      return json(req.headers()['accept']?.includes('vnd.pgrst.object') ? owner : [owner, ...MEMBERS.map((m) => ({ ...m, role: 'member', status: 'active' }))]);
    }
    return json(req.headers()['accept']?.includes('vnd.pgrst.object') ? null : []);
  });

  const out = [];
  const CARD = '[data-card="ai-coach"]';
  const cardText = async () => (await page.locator(CARD).count())
    ? (await page.locator(CARD).first().innerText()).replace(/\s+/g, ' ') : '';
  const noMembers = async () => {
    const html = (await page.locator(CARD).count()) ? await page.locator(CARD).first().innerHTML() : '';
    const leaked = MEMBERS.flatMap((m) => [m.id, m.first_name, m.last_name]).filter((s) => html.includes(s));
    return leaked.length ? 'STILL SHOWN ' + leaked.join(', ') : 'none';
  };
  const open = async (path = '/gym-app') => {
    await page.goto('http://localhost:5174' + path, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2200);
  };

  await page.setViewportSize({ width: 1700, height: 1000 });

  // ---- the owner -----------------------------------------------------------------------------
  await open();
  let c = await cardText();
  out.push('owner sees the AI coach card: ' + (c.includes('AI coach') && /How much your members can talk to the coach/.test(c) ? 'yes' : 'MISSING'));
  out.push('both limits, editable: ' + ((await page.locator(`${CARD} #ai-daily`).inputValue().catch(() => '')) === '30'
    && (await page.locator(`${CARD} #ai-monthly`).inputValue().catch(() => '')) === '1500' ? '30 / 1500' : 'MISSING'));
  out.push('the two labels: ' + (/Messages per member per day/i.test(c) && /Messages for the whole gym per month/i.test(c) ? 'yes' : 'MISSING'));
  const tiles = await page.evaluate((sel) => [...document.querySelectorAll(sel + ' [data-tip]')].map((e) => e.innerText.replace(/\s+/g, ' ').trim()), CARD);
  const tile = (label, value) => tiles.some((t) => t.toLowerCase().includes(label.toLowerCase()) && t.includes(value));
  out.push('tiles show the month: ' + (tile('Messages this month', '312') && tile('Members using it', '7') && tile('Today', '14') && tile('Estimated cost', '$0.42')
    ? '312 · 7 people · 14 today · $0.42' : 'MISSING ' + JSON.stringify(tiles.slice(0, 5))));
  out.push('the estimate says it is one: ' + (c.includes("Estimated at Claude Sonnet 5.5's list price. Your real bill is on console.anthropic.com.") ? 'yes' : 'MISSING'));
  const bars = await page.locator(`${CARD} [data-days] > div`).count();
  out.push('a bar per day this month: ' + (bars === DAYS.length ? `${bars} bars` : `MISSING ${bars} of ${DAYS.length}`));
  out.push('no member name or id in the card: ' + await noMembers());
  await page.locator(CARD).first().scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'shots/admin-coach-usage.png', fullPage: true });

  await page.locator(`${CARD} #ai-daily`).fill('20');
  await page.locator(`${CARD} #ai-monthly`).fill('900');
  await page.locator(CARD).getByRole('button', { name: 'Save' }).click();
  await page.waitForTimeout(1200);
  out.push('Save sends both numbers: ' + (CALLS.set_ai_coach_limits?.p_daily === 20 && CALLS.set_ai_coach_limits?.p_monthly === 900 ? '20 / 900' : 'MISSING ' + JSON.stringify(CALLS.set_ai_coach_limits)));
  out.push('the saved limits come back: ' + ((await page.locator(`${CARD} #ai-daily`).inputValue()) === '20' ? 'yes' : 'MISSING'));

  // ---- a sub-cent month -----------------------------------------------------------------------
  STATE.cost = 0.0042;
  await open();
  out.push('under a cent reads <$0.01: ' + (/<\$0\.01/.test(await cardText()) ? 'yes' : 'MISSING'));

  // ---- 0147 not pasted ------------------------------------------------------------------------
  STATE.missing = true;
  await open();
  c = await cardText();
  out.push('missing migration says so: ' + (c.includes('This needs migration 0147.') ? 'yes' : 'MISSING'));
  out.push('and shows nothing else: ' + (!/Messages this month|Estimated cost|Save/.test(c) && (await page.locator(`${CARD} input`).count()) === 0 ? 'yes' : 'STILL SHOWN ' + c.slice(0, 120)));
  STATE.missing = false;

  // ---- a gym whose plan does not sell the assistant -------------------------------------------
  STATE.assistant = 'not_sold';
  await open();
  out.push('no card where the coach is not sold: ' + ((await page.locator(CARD).count()) === 0 ? 'yes' : 'STILL SHOWN'));
  STATE.assistant = 'on';

  // ---- the desk -------------------------------------------------------------------------------
  STATE.role = 'staff';
  STATE.cost = 0.4218; LIMITS.daily = 30; LIMITS.monthly = 1500;
  await open();
  out.push('the desk cannot open Your app: ' + (!page.url().includes('/gym-app') ? 'sent to ' + new URL(page.url()).pathname : 'STILL SHOWN'));
  // The same card, mounted with the desk's context (what the card reads to decide).
  const mounted = await page.evaluate(async () => {
    const main = await (await fetch('/src/main.tsx')).text();
    const react = main.match(/from "(\/node_modules\/\.vite\/deps\/react\.js[^"]*)"/)?.[1];
    const dom = main.match(/from "(\/node_modules\/\.vite\/deps\/react-dom_client\.js[^"]*)"/)?.[1];
    if (!react || !dom) return 'no react url';
    const R = (await import(react)).default; const D = (await import(dom)).default;
    const Card = (await import('/src/components/AiCoachCard.tsx')).default;
    const host = document.createElement('div');
    host.id = 'desk-host';
    host.style.cssText = 'position:fixed;inset:40px auto auto 40px;width:760px;z-index:9999;background:var(--color-bg)';
    document.body.appendChild(host);
    D.createRoot(host).render(R.createElement(Card));
    return 'ok';
  });
  await page.waitForTimeout(1500);
  c = await cardText();
  out.push('desk card mounted: ' + (mounted === 'ok' && c.includes('AI coach') ? 'yes' : 'MISSING ' + mounted));
  out.push('desk sees the limits, read-only: ' + ((await page.locator(`${CARD} input`).count()) === 0 && /Messages per member per day\s*30/i.test(c) && /1,500/.test(c) ? 'yes' : 'MISSING'));
  out.push('desk has no Save: ' + ((await page.locator(CARD).getByRole('button', { name: 'Save' }).count()) === 0 && /Only the gym's owner can change these/.test(c) ? 'yes' : 'STILL SHOWN'));
  out.push('desk still sees the totals: ' + (/312/.test(c) && /\$0\.42/.test(c) ? 'yes' : 'MISSING'));
  out.push('no member name or id for the desk either: ' + await noMembers());
  await page.screenshot({ path: 'shots/admin-coach-usage-desk.png' });
  return out.join('\n');
}
