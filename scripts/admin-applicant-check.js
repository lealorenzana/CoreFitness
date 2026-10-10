/**
 * 0187 in the admin app: someone who applied on the website and signs in here
 * before their gym exists sees their application (not "no admin access") —
 * documents, messages; and an owner whose gym came from an application renews
 * its documents on Your plan, while the dashboard runs the renewal reminder.
 *
 * Fixture from admin-walk-ins-check.js.
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
  /** Switched on for the second half: the signed-in person runs no gym. */
  let NOROLE = false;
  const APP = 'a1870000-0000-4000-8000-0000000000bb';
  const KINDS = [
    { kind: 'permit', label: "Mayor's / business permit (this year)", needs_expiry: true, sort_order: 1 },
    { kind: 'dti_sec', label: 'DTI or SEC registration', needs_expiry: false, sort_order: 2 },
    { kind: 'bir_2303', label: 'BIR Certificate of Registration (2303)', needs_expiry: false, sort_order: 3 },
    { kind: 'barangay', label: 'Barangay business clearance', needs_expiry: true, sort_order: 4 },
    { kind: 'owner_id', label: "Owner's valid government ID", needs_expiry: true, sort_order: 5 },
    { kind: 'front_photo', label: "Photo of the gym's front and signage", needs_expiry: false, sort_order: 6 },
  ];
  const APPLICATION = {
    id: APP, gym_name: 'Iron Den', owner_name: 'Ana Cruz', email: 'gabby@x.test', status: 'pending', reason: null,
    created_at: new Date(Date.now() - 2 * 86400000).toISOString(), decided_at: null, plan: null,
    messages: [{ from_platform: true, body: 'Please send your documents.', created_at: new Date().toISOString() }],
    documents: [{ id: 'd1', kind: 'permit', label: KINDS[0].label, path: `${APP}/permit-1.jpg`, file_name: 'permit.jpg', expires_on: '2026-12-31',
      status: 'verified', reason: null, uploaded_at: new Date().toISOString() }],
    missing: KINDS.slice(1).map((k) => k.label),
  };
  const VISITS = [];
  const SETTINGS = { modes: ['classes', 'pick_pt', 'desk_assigns', 'coach_invites'], lengths: [1, 3, 6], fee: 'gym_priced' };
  const COACHINGS = [
    { id: 'k1', member_id: 'm1', trainer_id: 't1', kind: 'pt', months: 3, status: 'payment_sent', fee_mode: 'gym_priced', price: 2400,
      pay_reference: 'GC-1234', starts_on: null, ends_on: null, started_by: 'member', created_at: new Date().toISOString() },
    { id: 'k2', member_id: 'm2', trainer_id: 't1', kind: 'pt', months: 1, status: 'active', fee_mode: 'gym_priced', price: 900,
      pay_reference: null, starts_on: ymd(5), ends_on: ymd(-25), started_by: 'desk', created_at: new Date().toISOString() },
  ];
  const PEOPLE = {
    member_profiles: [{ profile_id: 'm1', profiles: { id: 'm1', first_name: 'Lea', last_name: 'Lorenzana', status: 'active', role: 'member' } },
      { profile_id: 'm2', profiles: { id: 'm2', first_name: 'Ana', last_name: 'Reyes', status: 'active', role: 'member' } }],
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
    if (path.startsWith('/storage/v1/object/applications/')) { CALLS.push(['upload', path]); return json({ Key: 'x', Id: 'o1' }); }
    if (path.startsWith('/storage/v1/object/sign/applications/')) return json({ signedURL: '/storage/v1/object/sign/applications/x?token=t' });
    if (path.startsWith('/auth/v1/')) return json(path.includes('/user') ? session.user : session);
    if (path.startsWith('/rest/v1/rpc/')) {
      const fn = path.split('/rest/v1/rpc/')[1];
      const body = JSON.parse(req.postData() || '{}');
      if (fn === 'my_gym_context' && NOROLE) return json([]);
      if (fn === 'my_gyms' && NOROLE) return json([]);
      if (fn === 'my_applications') return json([APPLICATION]);
      if (fn === 'application_document_kinds') return json(KINDS);
      if (fn === 'my_gym_application') return json(NOROLE ? null : { id: APP, gym_name: 'gabby pogi 123', owner_name: 'Gabby P', email: 'gabby@x.test',
        phone: '09171234567', address: 'Mamburao', documents: KINDS.map((k, i) => ({ id: 'v' + i, kind: k.kind, label: k.label, path: `${APP}/${k.kind}.jpg`, file_name: k.kind + '.jpg', expires_on: k.needs_expiry ? '2026-12-31' : null, status: 'verified', reason: null, uploaded_at: new Date().toISOString() })) });
      if (fn === 'add_application_document') { CALLS.push([fn, body]); return json('d9'); }
      if (fn === 'my_application_reply') { CALLS.push([fn, body]); APPLICATION.messages.push({ from_platform: false, body: body.p_body, created_at: new Date().toISOString() }); return json(null); }
      if (fn === 'permit_renewal_sweep') { CALLS.push([fn, body]); return json(0); }
      if (fn === 'my_gym_context') return json([{ gym_id: g.gym_id, gym_name: g.gym_name, slug: g.slug, role: 'admin',
        status: 'active', lock_reason: null, short_name: g.short_name, logo_url: null, accent: g.accent, gym_count: 1,
        onboarded: true, onboarding_step: null, gym_state: 'live' }]);
      if (fn === 'my_gym_app') return json([{ gym_id: g.gym_id, gym_name: g.gym_name, slug: g.slug, short_name: g.short_name,
        logo_url: null, accent: 'emerald', accent_action: 'lime', tagline: null, points_name: 'Points',
        points_name_short: 'points', welcome_message: null, join_policy: 'code',
        vocabulary: { member: 'member', members: 'members', trainer: 'coach', trainers: 'coaches', class: 'class', classes: 'classes' }, join_code: 'PPDSSJ', modules: {} }]);
      if (fn === 'my_gym_subscription') return json([{ plan_name: 'Standard', price_monthly: '999', paid_until: ymd(-3), days_left: 3, grace_days: 7,
        read_only_on: ymd(-11), lock_reason: null, max_members: 150, members: 38, max_staff: 3, staff: 2, on_trial: false }]);
      if (fn === 'my_gym_payments') return json([]);
      if (fn === 'platform_payment_options') return json([{ id: 'pm1', kind: 'gcash', label: 'GCash', account_name: 'J. Dela Cruz',
        account_number: '0917 555 0101', qr_image: PNG, instructions: 'Send the exact amount.' }]);
      if (fn === 'my_gym_payment_claims') return json(CLAIMS);
      if (fn === 'guest_visits_on') return json(VISITS);
      if (fn === 'find_guest') return json(String(body.p_phone).replace(/\D/g, '').endsWith('9175550101')
        ? [{ id: 'g1', name: 'Ana Cruz', phone: '0917 555 0101', visits_left: 3, visits_this_month: 2, last_visit: null }] : []);
      if (fn === 'record_guest_visit') {
        CALLS.push([fn, body]);
        VISITS.unshift({ id: 'v' + VISITS.length, guest_id: 'g1', name: body.p_name ?? 'Ana Cruz', phone: null, kind: body.p_kind,
          amount: body.p_kind === 'day' ? 150 : 0, method: 'cash', visited_at: new Date().toISOString(), voided: false, visits_left: 2 });
        return json([{ guest_id: 'g1', visits_left: 2, amount: body.p_kind === 'day' ? 150 : 0, visits_this_month: 3, suggest_membership: body.p_kind === 'pack_visit' }]);
      }
      if (fn === 'void_guest_visit') { CALLS.push([fn, body]); VISITS.forEach((v) => { if (v.id === body.p_visit) v.voided = true; }); return json(null); }
      if (fn === 'set_day_pass_settings') { CALLS.push([fn, body]); return json(null); }
      if (fn === 'open_equipment_reports') return json([{ id: 'r1', equipment_id: 'q1', equipment_name: 'Leg press', location_note: '2nd floor',
        status: 'available', note: 'The seat pin is stuck', member_name: 'Lea Lorenzana', created_at: new Date().toISOString() }]);
      if (fn === 'set_equipment_status') { CALLS.push([fn, body]); return json(null); }
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
      return json(['my_gym_modules', 'my_support_grant', 'my_gyms', 'my_announcements', 'my_gym_features'].includes(fn) ? [] : null);
    }
    if (!path.startsWith('/rest/v1/')) return json([]);
    const t = path.split('/rest/v1/')[1];
    if (t === 'gym_equipment' && req.method() === 'POST') { CALLS.push(['insert:gym_equipment', JSON.parse(req.postData() || '{}')]); return json({ id: 'new1' }); }
    if (t === 'equipment_exercises' && req.method() === 'POST') { CALLS.push(['insert:equipment_exercises', JSON.parse(req.postData() || '[]')]); return json([]); }
    if (t === 'gym_equipment') return json([{ id: 'q1', name: 'Leg press', category: 'machines', photo_url: null, quantity: 2, location_note: '2nd floor',
      status: 'available', notes: null, sort_order: 0, equipment_exercises: [] }]);
    if (t === 'exercises') return json([{ id: 'e1', name: 'Back Squat' }, { id: 'e2', name: 'Leg Press' }]);
    if (t === 'coachings') return json(COACHINGS);
    if (t === 'coaching_prices') return json([{ kind: 'pt', months: 3, price: 2400 }]);
    if (t in PEOPLE) return json(PEOPLE[t]);
    if (t === 'gym_settings') {
      const row = { id: true, gym_id: g.gym_id, gym_name: g.gym_name, short_name: g.short_name, logo_url: null, address: 'Mamburao',
        join_approval: 'desk', min_age: 16, day_pass_on: true, day_pass_price: 150, pack5_price: 650, pack10_price: null, guest_nudge_visits: 3,
        class_booking_approval: 'coach', pt_booking_approval: 'coach' };
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
  const text = () => page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));
  await page.setViewportSize({ width: 1400, height: 1000 });

  // ---- an owner: Your plan -> Business documents, and the dashboard's reminder ----
  await page.goto('http://localhost:5174/subscription', { waitUntil: 'domcontentloaded' });
  await page.getByText('Business documents').first().waitFor({ timeout: 15000 });
  await page.locator('[data-doc]').first().waitFor({ timeout: 8000 });
  out.push('Your plan lists the gym\'s six documents: ' + ((await page.locator('[data-doc]').count()) === 6 ? 'yes' : 'MISSING ' + (await page.locator('[data-doc]').count())));
  out.push('a verified one can be renewed: ' + ((await page.getByRole('button', { name: 'Send the renewed one' }).count()) === 6 ? 'yes' : 'MISSING'));
  await page.goto('http://localhost:5174/dashboard', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  out.push('the dashboard runs the renewal reminder: ' + (CALLS.some(([f]) => f === 'permit_renewal_sweep') ? 'yes' : 'MISSING'));

  // ---- an applicant with no gym signs in ----
  await page.evaluate(() => localStorage.clear());
  NOROLE = true;
  await page.goto('http://localhost:5174/admin/login', { waitUntil: 'domcontentloaded' });
  await page.locator('input[type=email]').first().waitFor({ timeout: 10000 });
  await page.locator('input[type=email]').first().fill('gabby@x.test');
  await page.locator('input[type=password]').first().fill('test-only-pass');
  await page.locator('form button[type=submit]').first().click();
  await page.waitForURL('**/admin/application', { timeout: 10000 }).catch(() => {});
  out.push('an applicant lands on their application, not a refusal: ' + (page.url().endsWith('/admin/application') ? 'yes' : 'NO ' + page.url()));
  await page.locator('[data-documents]').waitFor({ timeout: 8000 }).catch(async () => { throw new Error('no documents at ' + page.url() + ' :: ' + (await text()).slice(0, 400)); });
  let t = await text();
  out.push('it says what is still needed: ' + (/Still needed: DTI or SEC registration/.test(t) && /Being read/.test(t) ? 'yes' : 'MISSING'));
  out.push('the six documents: ' + ((await page.locator('[data-doc]').count()) === 6 ? 'yes' : 'MISSING'));
  const row = page.locator('[data-doc="dti_sec"]');
  await row.locator('input[type=file]').setInputFiles({ name: 'dti.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4') });
  await row.getByRole('button', { name: 'Send' }).click();
  await page.waitForTimeout(800);
  const add = CALLS.find(([f]) => f === 'add_application_document');
  out.push('a document is uploaded and filed: ' + (add && add[1].p_application === APP && add[1].p_kind === 'dti_sec' && CALLS.some(([f, p]) => f === 'upload' && p.includes(`/applications/${APP}/dti_sec-`)) ? 'yes' : 'MISSING ' + JSON.stringify(add)));
  await page.getByLabel('Message to Core Fitness').fill('Sent the DTI.');
  await page.locator('section').filter({ hasText: 'Messages with Core Fitness' }).getByRole('button', { name: 'Send' }).click();
  await page.waitForTimeout(600);
  out.push('they write to Core Fitness: ' + (CALLS.some(([f, b]) => f === 'my_application_reply' && b.p_body === 'Sent the DTI.') ? 'yes' : 'MISSING'));
  await page.screenshot({ path: 'shots/admin-my-application.png', fullPage: true });
  return out.join('\n');
}
