/**
 * Guides G1 (2026-10-31), the admin app: a photo is framed before it uploads —
 * the owner's profile photo in a round frame and the gym's logo in a square
 * one; Cancel sends nothing, and the file sent is exactly the framed area at
 * the chosen zoom.
 *
 * Fixture from admin-personal-training-check.js. Admin dev server on :5174.
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
    access_token: `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: 'u2', role: 'authenticated', exp })}.sig`,
    refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: exp,
    user: { id: 'u2', aud: 'authenticated', role: 'authenticated', email: 'gabby@x.test', app_metadata: {}, user_metadata: {} },
  };
  await page.addInitScript(([k, s]) => localStorage.setItem(k, JSON.stringify(s)), [KEY, session]);
  const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  const g = { gym_id: 'gym-a', gym_name: 'gabby pogi 123', slug: 'gabby-pogi-123', short_name: 'gabby', accent: 'violet' };
  const ymd = (d) => new Date(Date.now() + 8 * 3600000 - d * 86400000).toISOString().slice(0, 10);
  const CALLS = [];
  const UPLOADS = [];
  let MODULES = { classes: false };
  const SETTINGS = { modes: ['classes', 'pick_pt', 'desk_assigns', 'coach_invites'], lengths: [1, 3, 6], fee: 'gym_priced' };
  const COACHINGS = [
    { id: 'k1', member_id: 'm1', trainer_id: 't1', kind: 'pt', months: 3, status: 'payment_sent', fee_mode: 'gym_priced', price: 2400,
      pay_reference: 'GC-1234', starts_on: null, ends_on: null, started_by: 'member', created_at: new Date().toISOString() },
    { id: 'k2', member_id: 'm2', trainer_id: 't1', kind: 'pt', months: 1, status: 'active', fee_mode: 'gym_priced', price: 900,
      pay_reference: null, starts_on: ymd(5), ends_on: ymd(-25), started_by: 'desk', created_at: new Date().toISOString() },
    { id: 'k3', member_id: 'm3', trainer_id: 't1', kind: 'pt', months: 1, status: 'requested', fee_mode: 'gym_priced', price: null,
      pay_reference: null, starts_on: null, ends_on: null, started_by: 'member', created_at: new Date().toISOString() },
  ];
  const at = (d, h) => { const x = new Date(); x.setDate(x.getDate() + d); x.setHours(h, 0, 0, 0); return x.toISOString(); };
  const PT = [
    { id: 's1', member_id: 'm1', trainer_id: 't1', starts_at: at(2, 9), duration_minutes: 60, status: 'pending', notes: null,
      created_at: at(-2, 9), requested_at: new Date(Date.now() - 2.2 * 86400000).toISOString(), coach_ok_by: null, decided_by_role: null },
  ];
  const PEOPLE = {
    member_profiles: [{ profile_id: 'm1', profiles: { id: 'm1', first_name: 'Lea', last_name: 'Lorenzana', status: 'active', role: 'member' } },
      { profile_id: 'm2', profiles: { id: 'm2', first_name: 'Ana', last_name: 'Reyes', status: 'active', role: 'member' } },
      { profile_id: 'm3', profiles: { id: 'm3', first_name: 'Joy', last_name: 'Tan', status: 'active', role: 'member' } }],
    trainer_profiles: [{ profile_id: 't1', specialization: 'Strength', profiles: { id: 't1', first_name: 'Rae', last_name: 'Santos', status: 'active', role: 'trainer' } }],
  };
  const CLAIMS = [];

  await page.route(`**://${REF}.supabase.co/**`, async (route) => {
    const req = route.request();
    const after = req.url().replace(/^https?:\/\/[^/]+/, '');
    const path = (after.indexOf('?') === -1 ? after : after.slice(0, after.indexOf('?')));
    const json = (b) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b),
      headers: { 'Content-Range': '0-0/1', 'Access-Control-Allow-Origin': '*', 'Access-Control-Expose-Headers': 'Content-Range' } });
    const one = req.headers()['accept']?.includes('vnd.pgrst.object');
    if (path.startsWith('/auth/v1/')) return json(path.includes('/user') ? session.user : session);
    if (path.startsWith('/rest/v1/rpc/')) {
      const fn = path.split('/rest/v1/rpc/')[1];
      const body = JSON.parse(req.postData() || '{}');
      if (fn === 'my_gym_context') return json([{ gym_id: g.gym_id, gym_name: g.gym_name, slug: g.slug, role: 'admin',
        status: 'active', lock_reason: null, short_name: g.short_name, logo_url: null, accent: g.accent, gym_count: 1,
        onboarded: true, onboarding_step: null, gym_state: 'live' }]);
      if (fn === 'my_gym_app') return json([{ gym_id: g.gym_id, gym_name: g.gym_name, slug: g.slug, short_name: g.short_name,
        logo_url: null, accent: 'emerald', accent_action: 'lime', tagline: null, points_name: 'Points',
        points_name_short: 'points', welcome_message: null, join_policy: 'code',
        vocabulary: { member: 'member', members: 'members', trainer: 'coach', trainers: 'coaches', class: 'class', classes: 'classes' }, join_code: 'PPDSSJ', modules: MODULES }]);
      if (fn === 'my_gym_subscription') return json([{ plan_name: 'Standard', price_monthly: '999', paid_until: ymd(-3), days_left: 3, grace_days: 7,
        read_only_on: ymd(-11), lock_reason: null, max_members: 150, members: 38, max_staff: 3, staff: 2, on_trial: false }]);
      if (fn === 'my_gym_payments') return json([]);
      if (fn === 'platform_payment_options') return json([{ id: 'pm1', kind: 'gcash', label: 'GCash', account_name: 'J. Dela Cruz',
        account_number: '0917 555 0101', qr_image: PNG, instructions: 'Send the exact amount.' }]);
      if (fn === 'my_gym_payment_claims') return json(CLAIMS);
      if (fn === 'coaching_settings') return json([{ modes: SETTINGS.modes, lengths: SETTINGS.lengths, fee_mode: SETTINGS.fee }]);
      if (fn === 'set_coaching_settings') { CALLS.push([fn, body]); SETTINGS.modes = body.p_modes; SETTINGS.lengths = body.p_lengths; SETTINGS.fee = body.p_fee_mode; return json(null); }
      if (fn === 'set_coaching_price') { CALLS.push([fn, body]); return json(null); }
      if (fn === 'confirm_coaching_payment' || fn === 'assign_coaching' || fn === 'end_coaching') { CALLS.push([fn, body]); return json('ok'); }
      if (fn === 'coaching_sweep') return json(0);
      if (fn === 'set_booking_approval') { CALLS.push([fn, body]); return json(null); }
      if (fn === 'set_join_settings') { CALLS.push([fn, body]); return json('PPDSSJ'); }
      if (fn === 'set_join_policy') { CALLS.push([fn, body]); return json('PPDSSJ'); }
      if (fn === 'submit_gym_payment') { CALLS.push(body); CLAIMS.push({ id: 'c1', amount: String(body.p_amount), paid_on: body.p_paid_on,
        method_label: 'GCash', reference: body.p_reference, months: body.p_months, status: 'pending', reason: null, created_at: new Date().toISOString(), decided_at: null }); return json('c1'); }
      if (fn === 'my_gym_modules') return json(Object.entries({ coaching: true, classes: MODULES.classes, push: true, events: !!MODULES.events })
        .map(([k, on], i) => ({ feature_key: k, label: k, description: k, state: 'on', enabled: on, sort_order: i, parent_key: k === 'events' ? 'push' : null })));
      if (fn === 'sweep_stale_requests') return json(0);
      if (fn === 'reserve_gym_photo') return json('gyms/gym-a/content/p1.jpg');
      if (fn === 'my_gym_app_settings' || fn === 'gym_app_look') return json(null);
      return json(['my_support_grant', 'my_support_grant', 'my_gyms', 'my_announcements', 'my_gym_features'].includes(fn) ? [] : null);
    }
    if (path.startsWith('/storage/v1/object/') && req.method() === 'POST') {
      UPLOADS.push({ path, body: req.postDataBuffer() });
      return json({ Key: path });
    }
    if (!path.startsWith('/rest/v1/')) return json([]);
    const t = path.split('/rest/v1/')[1];
    if (t === 'coachings') return json(COACHINGS);
    if (t === 'pt_sessions') {
      if (req.method() === 'PATCH') { CALLS.push(['pt_status', JSON.parse(req.postData() || '{}')]); return json([{ id: 's1' }]); }
      return json(PT);
    }
    if (t === 'notifications') { if (req.method() === 'POST') CALLS.push(['notify', JSON.parse(req.postData() || '{}')]); return json([]); }
    if (t === 'coaching_prices') return json([{ kind: 'pt', months: 3, price: 2400 }]);
    if (t in PEOPLE) return json(PEOPLE[t]);
    if (t === 'gym_settings') {
      const row = { id: true, gym_id: g.gym_id, gym_name: g.gym_name, short_name: g.short_name, logo_url: null, address: 'Mamburao',
        join_approval: 'desk', min_age: 16,
        class_booking_approval: 'coach', pt_booking_approval: 'desk' };
      return json(one ? row : [row]);
    }
    if (t === 'profiles' || t === 'gym_people') {
      const p = { id: 'u2', role: 'admin', status: 'active', first_name: 'Gabby', last_name: 'Owner',
        email: 'gabby@x.test', phone: null, photo_url: null, created_at: new Date().toISOString() };
      return json(one ? p : [p]);
    }
    return json(one ? null : []);
  });

  const out = [];
  const say = (label, ok, extra = '') => out.push(`${label}: ${ok ? 'yes' : 'MISSING ' + extra}`);
  const go = async (p) => { await page.goto(`http://localhost:5174${p}`, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(2500); };
  await page.setViewportSize({ width: 1400, height: 950 });
  // A PNG or JPEG's size, found inside the multipart body storage-js sends.
  const sizeOf = (raw) => {
    if (!raw) return null;
    const p = raw.indexOf(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    if (p >= 0) return { w: raw.readUInt32BE(p + 16), h: raw.readUInt32BE(p + 20), type: 'png' };
    const j = raw.indexOf(Buffer.from([0xff, 0xd8, 0xff]));
    if (j < 0) return { bytes: raw.length };
    const b = raw.subarray(j); let i = 2;
    while (i < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const m = b[i + 1];
      if (m >= 0xc0 && m <= 0xc3) return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7), type: 'jpeg' };
      i += 2 + b.readUInt16BE(i + 2);
    }
    return null;
  };
  const makePng = async (w, h) => Buffer.from(await page.evaluate(([w, h]) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d'); x.fillStyle = '#336'; x.fillRect(0, 0, w, h); x.fillStyle = '#fc0'; x.fillRect(w / 4, h / 4, w / 2, h / 2);
    return c.toDataURL('image/png').split(',')[1];
  }, [w, h]), 'base64');

  // ── My profile photo: a round frame, the file is the framed square at the chosen zoom ──
  await go('/settings?tab=profile');
  await page.getByRole('button', { name: /^My profile$/ }).first().click().catch(() => {});
  await page.waitForTimeout(600);
  const wide = await makePng(400, 200);
  await page.locator('input[type="file"]').first().setInputFiles({ name: 'me.png', mimeType: 'image/png', buffer: wide });
  await page.waitForTimeout(700);
  say('choosing a profile photo opens the frame, round', (await page.locator('[data-photo-cropper]').count()) === 1
    && (await page.locator('[data-crop-frame]').evaluate((el) => getComputedStyle(el).borderRadius)) === '50%');
  await page.screenshot({ path: 'shots/admin-photo-crop.png' });
  await page.locator('[data-photo-cropper]').getByLabel('Zoom').fill('2');
  await page.locator('[data-crop-use]').click();
  await page.waitForTimeout(2000);
  let up = UPLOADS.find((u) => u.path.includes('/avatars/'));
  let size = sizeOf(up?.body);
  say('the profile photo uploaded is the framed square at zoom 2 (100 × 100)', !!size && size.w === 100 && size.h === 100, JSON.stringify(size));

  // ── Your app logo: a square frame; Cancel sends nothing ──
  await go('/gym-app?tab=look');
  const tall = await makePng(300, 600);
  const logoInput = page.locator('label', { hasText: /Choose a logo|Change logo/ }).locator('input[type="file"]');
  say('Your app offers a logo upload', (await logoInput.count()) === 1);
  const before = UPLOADS.length;
  await logoInput.setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: tall });
  await page.waitForTimeout(700);
  say('…framed square', (await page.locator('[data-photo-cropper]').count()) === 1
    && (await page.locator('[data-crop-frame]').evaluate((el) => el.clientWidth === el.clientHeight)));
  await page.locator('[data-photo-cropper]').getByRole('button', { name: 'Cancel' }).click();
  await page.waitForTimeout(800);
  say('Cancel uploads nothing', UPLOADS.length === before);
  await logoInput.setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: tall });
  await page.waitForTimeout(700);
  await page.locator('[data-crop-use]').click();
  await page.waitForTimeout(2000);
  up = UPLOADS[UPLOADS.length - 1];
  size = up && UPLOADS.length > before ? sizeOf(up.body) : null;
  say('the logo uploaded is square (the middle of a tall picture)', !!size && size.w === size.h && size.w > 0, JSON.stringify(size));
  return out.join('\n');
}
