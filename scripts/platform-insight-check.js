/**
 * The platform app's 0140 screens: Capacity with its history and projection,
 * the searchable Activity log, Usage (every gym × every feature), Settings,
 * a gym's fenced export, the grouped sidebar, and tooltips that actually show.
 *
 * Playwright runner's `filename` argument, platform dev server on :5175.
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
    access_token: `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: 'pa', role: 'authenticated', exp })}.sig`,
    refresh_token: 'r', token_type: 'bearer', expires_at: exp,
    user: { id: 'pa', aud: 'authenticated', role: 'authenticated', email: 'owner@corefitness.test', app_metadata: {}, user_metadata: {} },
  };
  await page.addInitScript(([k, s]) => localStorage.setItem(k, JSON.stringify(s)), [KEY, session]);
  const iso = (d) => new Date(Date.now() - d * 86400000).toISOString();
  const day = (d) => new Date(Date.now() + 8 * 3600000 - d * 86400000).toISOString().slice(0, 10);
  const MB = 1048576;

  const gym = (id, name, over = {}) => ({ id, name, slug: id, status: 'active', plan: 'starter', paid_until: day(-40), lock_reason: null, members: 40,
    staff: 1, created_at: iso(100), last_activity: iso(1), owners: 1, onboarded: true, plan_name: 'Starter', price_monthly: '999', days_left: 40,
    max_members: 100, paid_total: '999', logo_url: null, accent: 'violet', ...over });
  const GYMS = [gym('g1', 'G Fitness', { members: 142 }), gym('g2', 'Ana gymanigga', { members: 12 }), gym('g3', 'Harbour Strength', { members: 38 })];
  const EVENTS = Array.from({ length: 60 }, (_, i) => {
    const g = GYMS[i % 3];
    const action = ['gym.paid', 'gym.plan', 'billing.settings', 'gym.suspended'][i % 4];
    return { id: 1000 - i, gym_id: action === 'billing.settings' ? null : g.id, gym_name: action === 'billing.settings' ? null : g.name, action,
      summary: action === 'gym.paid' ? `${g.name} paid ₱999` : action === 'gym.plan' ? `${g.name} moved to Starter` : action === 'billing.settings' ? 'Billing settings changed' : `${g.name} was suspended`,
      detail: action === 'gym.suspended' ? { reason: 'unpaid' } : null, actor_name: 'Lea Lorenzana', created_at: iso(i * 0.5) };
  });
  const CALLS = [];
  const BILLING = { grace_days: 7, reminder_days: [7, 3, 1], business_name: 'Core Fitness', business_address: 'San Jose, Occidental Mindoro',
    business_email: 'billing@corefitness.test', business_phone: null, receipt_note: 'Thank you.' };

  const RPC = {
    is_platform_admin: () => true,
    platform_gyms: () => GYMS,
    platform_capacity: () => [
      { kind: 'database', key: 'postgres', label: 'Database', used: 26.9 * MB, cap: 500 * MB },
      { kind: 'storage', key: 'all', label: 'Storage, every bucket', used: 299 * 1024, cap: 1024 * MB },
      { kind: 'users', key: 'mau', label: 'People signed in, last 30 days', used: 7, cap: 50000 }],
    snapshot_capacity: () => { CALLS.push(['snapshot']); return null; },
    platform_capacity_history: () => Array.from({ length: 31 }, (_, i) => ({ day: day(30 - i), db_bytes: Math.round((20 + i * 0.23) * MB),
      storage_bytes: 200 * 1024 + i * 3300, storage_objects: 40 + i, mau: 5 + (i % 3) })),
    platform_capacity_details: () => [
      ...['attendance', 'notifications', 'point_ledger'].map((t, i) => ({ kind: 'table', key: t, label: t, used: (848 - i * 200) * 1024, n: 5000 - i * 1200 })),
      { kind: 'bucket', key: 'avatars', label: 'avatars', used: 186 * 1024, n: 31 }, { kind: 'bucket', key: 'media', label: 'media', used: 113 * 1024, n: 12 },
      { kind: 'file', key: 'o1', label: 'media · G Fitness', used: 60 * 1024, n: null }, { kind: 'file', key: 'o2', label: 'avatars · not a gym\'s file', used: 40 * 1024, n: null }],
    platform_gym_footprint: () => [{ gym_id: 'g1', name: 'G Fitness', rows: 9120, files: 14, file_bytes: 90 * 1024 },
      { gym_id: 'g2', name: 'Ana gymanigga', rows: 310, files: 2, file_bytes: 28 * 1024 }],
    platform_events_search: (b) => {
      let r = EVENTS.filter((e) => (!b.p_q || (e.summary + e.action).toLowerCase().includes(b.p_q.toLowerCase()))
        && (!b.p_gym || e.gym_id === b.p_gym) && (!b.p_action || e.action === b.p_action || e.action.startsWith(b.p_action + '.')));
      const total = r.length;
      r = r.slice(b.p_offset || 0, (b.p_offset || 0) + (b.p_limit || 50));
      return r.map((e) => ({ ...e, total }));
    },
    platform_event_actions: () => ['gym.paid', 'gym.plan', 'billing.settings', 'gym.suspended'].map((a) => ({ action: a, n: 15 })),
    platform_gym_usage: () => [
      { gym_id: 'g1', feature: 'checkins', n: 1420 }, { gym_id: 'g1', feature: 'classes', n: 210 }, { gym_id: 'g1', feature: 'shop', n: 44 },
      { gym_id: 'g1', feature: 'rooms', n: 18 }, { gym_id: 'g3', feature: 'checkins', n: 362 }, { gym_id: 'g3', feature: 'payments', n: 20 }],
    billing_settings: () => [BILLING],
    set_billing_settings: (b) => { CALLS.push(['billing', b]); Object.assign(BILLING, { grace_days: b.p_grace_days, business_name: b.p_business_name }); return null; },
    list_platform_admins: () => [{ user_id: 'pa', email: 'owner@corefitness.test', first_name: 'Lea', last_name: 'Lorenzana', is_me: true }],
    add_platform_admin: (b) => { CALLS.push(['admin', b]); return 'x'; },
    gym_export_allowed: (b) => (b.p_gym === 'g1' ? null : 'A gym\'s data is its own. Export is open only when the gym has left Core Fitness, or while it has granted you support access.'),
    platform_export_gym: (b) => { CALLS.push(['export', b]); return { gym: 'G Fitness', gym_id: 'g1', exported_at: iso(0),
      tables: { people: [{ user_id: 'u1', first_name: 'Maria', email: 'm@x.test', role: 'member' }], payments: [{ id: 'p1', amount: 999 }], attendance: [] } }; },
  };

  await page.route(`**://${REF}.supabase.co/**`, async (route) => {
    const req = route.request();
    const after = req.url().replace(/^https?:\/\/[^/]+/, '');
    const path = (after.indexOf('?') === -1 ? after : after.slice(0, after.indexOf('?')));
    const json = (b) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b),
      headers: { 'Content-Range': '0-9/10', 'Access-Control-Allow-Origin': '*', 'Access-Control-Expose-Headers': 'Content-Range' } });
    if (path.startsWith('/auth/v1/')) return json(path.includes('/user') ? session.user : session);
    if (path.startsWith('/rest/v1/rpc/')) {
      const fn = path.split('/rest/v1/rpc/')[1];
      return json(fn in RPC ? RPC[fn](JSON.parse(req.postData() || '{}')) : []);
    }
    return json([]);
  });

  const out = [];
  const text = () => page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));
  const tipAfterHover = async (loc) => { await loc.hover(); await page.waitForTimeout(450); return page.locator('[role="tooltip"]').innerText().catch(() => ''); };
  await page.setViewportSize({ width: 1600, height: 1000 });

  // ---- the sidebar and tooltips -------------------------------------------------------------
  await page.goto('http://localhost:5175/capacity', { waitUntil: 'domcontentloaded' });
  await page.locator('.cap-meter').first().waitFor({ timeout: 15000 });
  await page.waitForTimeout(700);
  let t = await text();
  out.push('sidebar in three groups: ' + (/The service/i.test(t) && /Talk to gyms/i.test(t) && /Run it/i.test(t) && ['Usage', 'Activity', 'Settings'].every((x) => t.includes(x)) ? 'yes, with the new pages' : 'MISSING'));
  const navTip = await tipAfterHover(page.getByRole('link', { name: 'Usage' }));
  out.push('a nav item explains itself: ' + (/Every gym against every feature/.test(navTip) ? 'yes' : 'MISSING ' + navTip));
  const dotTip = await tipAfterHover(page.locator('.info-dot').first());
  out.push('a "?" explains its section: ' + (/500 MB/.test(dotTip) ? 'yes' : 'MISSING ' + dotTip));
  await page.mouse.move(5, 5); await page.waitForTimeout(200);
  out.push('the tooltip goes away: ' + ((await page.locator('[role="tooltip"]').count()) === 0 ? 'yes' : 'MISSING'));

  // ---- Capacity ------------------------------------------------------------------------------
  out.push('today\'s reading taken on opening: ' + (CALLS.some((c) => c[0] === 'snapshot') ? 'yes' : 'MISSING'));
  out.push('growth pace and projection: ' + (/\+6\.9 MB a month/.test(t) && /full in ~\d+ months/.test(t) ? 'shown' : 'MISSING'));
  out.push('the trend chart: ' + ((await page.locator('.cap .ov-chart path').count()) >= 2 && /database now/i.test(t) ? 'drawn' : 'MISSING'));
  const dayTip = await tipAfterHover(page.locator('.cap-hit span').nth(15));
  out.push('a day on the chart, on hover: ' + (/database .*MB, storage/.test(dayTip) ? 'yes' : 'MISSING ' + dayTip));
  out.push('rows per table, files per bucket: ' + (/5,000 rows/.test(t) && /31 files/.test(t) ? 'yes' : 'MISSING'));
  out.push('each gym\'s footprint: ' + (/9,120 rows · 14 files/.test(t) ? 'yes' : 'MISSING'));
  out.push('largest files by gym, never by name: ' + (/media · G Fitness/.test(t) && !/\.png|\.jpg/.test(t) ? 'yes' : 'MISSING'));
  // The rows once collapsed into one line of text over fat bars (their CSS was lost): a bar sits under its text, rows stay rows.
  const rowsLaid = await page.evaluate(() => [...document.querySelectorAll('.cap-row')].map((r) => {
    const name = r.querySelector('.cap-name').getBoundingClientRect(), bar = r.querySelector('.cap-bar').getBoundingClientRect();
    return { under: bar.top >= name.bottom - 1, h: r.getBoundingClientRect().height, barH: bar.height };
  }));
  out.push('capacity rows laid out: ' + (rowsLaid.length === 9 && rowsLaid.every((c) => c.under && c.h < 70 && c.barH <= 8) ? '9 rows, bars under their names' : 'MISSING ' + JSON.stringify(rowsLaid.slice(0, 3))));
  out.push('limits it cannot see, said so: ' + (/Egress/.test(t) && /Inactivity pause/.test(t) ? 'yes' : 'MISSING'));
  await page.screenshot({ path: 'shots/platform-capacity-140.png' });
  // At the owner's 1700×900 window "Near a limit" once ran over "Largest files": no card overlaps another, none overflows.
  await page.setViewportSize({ width: 1700, height: 900 });
  await page.waitForTimeout(400);
  const clash = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('.cap .card')];
    const r = cards.map((c) => c.getBoundingClientRect());
    const name = (i) => (cards[i].querySelector('.section-title')?.textContent ?? '?').trim();
    const bad = [];
    for (let i = 0; i < r.length; i++) {
      if (cards[i].scrollHeight > cards[i].clientHeight + 2 && getComputedStyle(cards[i]).overflowY === 'visible') bad.push(name(i) + ' overflows');
      for (let j = i + 1; j < r.length; j++) {
        const o = Math.min(r[i].right, r[j].right) - Math.max(r[i].left, r[j].left) > 1 && Math.min(r[i].bottom, r[j].bottom) - Math.max(r[i].top, r[j].top) > 1;
        if (o) bad.push(name(i) + ' overlaps ' + name(j));
      }
    }
    return bad;
  });
  out.push('Capacity at 1700×900, nothing overlaps: ' + (clash.length === 0 ? 'yes' : 'MISSING ' + clash.join('; ')));
  await page.screenshot({ path: 'shots/platform-capacity-1700.png' });
  await page.setViewportSize({ width: 1600, height: 1000 });

  // ---- Activity -----------------------------------------------------------------------------
  await page.getByRole('link', { name: 'Activity' }).click();
  await page.locator('.act-row').first().waitFor({ timeout: 10000 });
  await page.waitForTimeout(400);
  t = await text();
  out.push('the log, paged: ' + ((await page.locator('.act-row').count()) === 25 && /1–25 of 60 events/.test(t) ? '25 of 60' : 'MISSING ' + (await page.locator('.act-row').count())));
  await page.getByLabel('Gym').selectOption('g3');
  await page.waitForTimeout(500);
  t = await text();
  out.push('filter by gym: ' + (/of 15 events|15 events/.test(t) && !/Ana gymanigga paid/.test(t) ? '15' : 'MISSING'));
  await page.getByPlaceholder('Words in what happened').fill('suspended');
  await page.waitForTimeout(700);
  t = await text();
  out.push('search the words, with the reason shown: ' + (/Harbour Strength was suspended/.test(t) && /“unpaid”/.test(t) && (await page.locator('.act-row').count()) >= 1 ? 'yes' : 'MISSING'));
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export CSV' }).click()]);
  out.push('export what is filtered: ' + (/^core-fitness-activity-\d{4}-\d{2}-\d{2}\.csv$/.test(dl.suggestedFilename()) ? 'CSV' : 'MISSING'));
  await page.getByRole('button', { name: 'Clear' }).click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'shots/platform-activity.png' });

  // ---- Usage -------------------------------------------------------------------------------
  await page.getByRole('link', { name: 'Usage' }).click();
  await page.locator('.use-table tbody tr').first().waitFor({ timeout: 10000 });
  await page.waitForTimeout(400);
  t = await text();
  const first = await page.locator('.use-table tbody tr').first().innerText();
  out.push('every gym × every feature, busiest first: ' + ((await page.locator('.use-table tbody tr').count()) === 3 && /G Fitness/.test(first) && /1,420/.test(t) ? 'yes' : 'MISSING'));
  out.push('a gym doing nothing, flagged: ' + (/1 Open gyms doing nothing/.test(t) ? 'Ana gymanigga' : 'MISSING'));
  out.push('features nobody used, said: ' + (/Nobody used/.test(t) && /squads/.test(t) ? 'yes' : 'MISSING'));
  const cellTip = await tipAfterHover(page.locator('.use-table tbody tr').first().locator('td').nth(1));
  out.push('a cell in words, on hover: ' + (/G Fitness: 1,420 check-ins in 30 days/.test(cellTip) ? 'yes' : 'MISSING ' + cellTip));
  await page.screenshot({ path: 'shots/platform-usage.png' });

  // ---- Settings ------------------------------------------------------------------------------
  await page.getByRole('link', { name: 'Settings' }).click();
  await page.getByLabel('Days before read-only').waitFor({ timeout: 10000 });
  await page.getByLabel('Days before read-only').fill('10');
  await page.waitForTimeout(200);
  t = await text();
  out.push('the rules as a worked example: ' + (/reminder — 7 days before/.test(t) && /read-only if still unpaid/.test(t) ? 'yes' : 'MISSING'));
  await page.getByRole('button', { name: 'Save billing rules' }).click();
  await page.waitForTimeout(500);
  out.push('billing rules save from Settings: ' + (CALLS.some((c) => c[0] === 'billing' && c[1].p_grace_days === 10) ? 'grace 10' : 'MISSING'));
  out.push('receipt header previewed: ' + (/San Jose, Occidental Mindoro · billing@corefitness.test/.test(await text()) ? 'yes' : 'MISSING'));
  await page.screenshot({ path: 'shots/platform-settings.png' });

  // ---- a gym's export ----------------------------------------------------------------------
  await page.goto('http://localhost:5175/gyms/g2', { waitUntil: 'domcontentloaded' });
  try { await page.getByRole('button', { name: /Export data/ }).waitFor({ timeout: 10000 }); } catch { return out.join('\n') + '\nMISSING: gym page shows ' + (await text()).slice(0, 600); }
  await page.waitForTimeout(500);
  const no = page.getByRole('button', { name: /Export data/ });
  out.push('an active gym that has not asked: export disabled, with why: ' + ((await no.isDisabled()) && /data is its own/.test(await no.getAttribute('data-tip') ?? '') ? 'yes' : 'MISSING'));
  await page.goto('http://localhost:5175/gyms/g1', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /Export data/ }).waitFor({ timeout: 10000 });
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: /Export data/ }).click();
  t = await text();
  out.push('what goes and what never goes, before anything goes: ' + (/What never goes/.test(t) && /Chat, progress photos, health answers/.test(t) && /owner gets a notification/.test(t) ? 'yes' : 'MISSING'));
  const [json] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export and download' }).click()]);
  await page.waitForTimeout(300);
  out.push('exported as one file, then any table: ' + (/^g-fitness-export-\d{4}-\d{2}-\d{2}\.json$/.test(json.suggestedFilename()) && CALLS.some((c) => c[0] === 'export')
    && (await page.locator('.exp-table').count()) === 3 && (await page.locator('.exp-table').nth(2).isDisabled()) ? 'JSON + 3 tables, empty one disabled' : 'MISSING'));
  await page.screenshot({ path: 'shots/platform-export.png' });
  return out.join('\n');
}
