/**
 * The gym owner's "Your app" page (0110–0114).
 *
 * The failure this exists to catch already happened once. 0112 added a second
 * colour role, `save_gym_look()` wrote it, and the only screen that ever passed
 * it was the setup wizard — which an owner sees once. The column, the function
 * and the migration's verify report were all green while the setting was
 * unreachable, so nothing in the repository could tell the difference between
 * "the gym chose amber" and "the gym could not choose anything".
 *
 * So this asserts the *route to the setting*, not the setting: both colour rows
 * are on screen, editing the second one sends `p_accent_action`, the six nouns
 * are editable and sent, and the link can be moved. Writes shots/admin-gym-app*.png.
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
    user: { id: 'u1', aud: 'authenticated', role: 'authenticated', email: 'owner@harbour.test', app_metadata: {}, user_metadata: {} },
  };
  await page.addInitScript(([k, s]) => localStorage.setItem(k, JSON.stringify(s)), [KEY, session]);

  const owner = { id: 'u1', role: 'admin', status: 'active', first_name: 'Ana', last_name: 'Ferrer',
    email: 'owner@harbour.test', phone: null, photo_url: null, created_at: new Date().toISOString() };

  // A gym that renamed nothing and set no action colour — the state every gym
  // is in the day after onboarding, and the one the old screen could not leave.
  const gym = {
    gym_id: 'gym-b', gym_name: 'Harbour Strength', slug: 'harbour-strength',
    short_name: null, logo_url: null, accent: 'rose', accent_action: null,
    points_name: 'Points', points_name_short: 'points', welcome_message: null,
    tagline: null,
    vocabulary: { member: 'member', members: 'members', trainer: 'coach', trainers: 'coaches', class: 'class', classes: 'classes' },
    join_policy: 'code', join_code: 'HARB42',
    modules: { classes: true, coaching: true, engagement: true, progress: true, push: true, assistant: false },
  };

  const CALLS = {};
  // 0119. Starts with nothing published, which is every gym on the day it pastes 0119.
  const WAIVERS = [];
  let waiverRequired = false;
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
      if (fn === 'my_gym_app') return json([gym]);
      if (fn === 'my_gym_context') return json([{
        gym_id: gym.gym_id, gym_name: gym.gym_name, slug: gym.slug, role: 'admin', status: 'active',
        lock_reason: null, short_name: null, logo_url: null, accent: gym.accent, gym_count: 1,
        onboarded: true, onboarding_step: null, gym_state: 'open', accent_action: gym.accent_action,
      }]);
      if (fn === 'my_gym_modules') return json([
        { feature_key: 'classes', label: 'Classes and bookings', description: 'A timetable members book into.', state: 'on', enabled: true, sort_order: 10 },
        { feature_key: 'assistant', label: 'The assistant', description: 'Answers members’ questions.', state: 'not_sold', enabled: false, sort_order: 90 },
      ]);
      if (fn === 'my_support_grant') return json([]);
      // The writes this check exists for. Echoed back into `gym` so the page
      // reloads into what it just saved, as it would against a real database.
      if (fn === 'save_gym_look') {
        gym.accent = body.p_accent;
        gym.accent_action = body.p_accent_action;
        return json(null);
      }
      if (fn === 'save_gym_vocabulary') {
        gym.vocabulary = { ...gym.vocabulary, ...body.p_words };
        return json(gym.vocabulary);
      }
      if (fn === 'set_gym_slug') { gym.slug = body.p_slug; return json(body.p_slug); }
      if (fn === 'save_gym_words') return json(null);
      if (fn === 'parq_questions') return json(['heart_condition', 'chest_pain_active', 'chest_pain_rest',
        'balance', 'bone_joint', 'medication', 'other_reason']
        .map((key, i) => ({ key, question: 'Question ' + (i + 1) + ' (' + key + ')', sort_order: i + 1 })));
      if (fn === 'gym_waiver_signatures') return json([{ member_id: 'm9', member_name: 'Lea Lorenzana',
        accepted_at: new Date().toISOString(), version: 1, flagged: true,
        par_q: { bone_joint: true, heart_condition: false } }]);
      if (fn === 'save_gym_waiver') {
        const draft = WAIVERS.find((w) => !w.published_at);
        if (draft) { draft.title = body.p_title; draft.body = body.p_body; return json(draft.id); }
        const v = { id: 'w' + (WAIVERS.length + 1), version: WAIVERS.length + 1,
          title: body.p_title, body: body.p_body, published_at: null };
        WAIVERS.push(v);
        return json(v.id);
      }
      if (fn === 'publish_gym_waiver') {
        const draft = WAIVERS.find((w) => !w.published_at);
        draft.published_at = new Date().toISOString();
        return json(draft.version);
      }
      return json(null);
    }
    if (!path.startsWith('/rest/v1/')) return json([]);
    const t = path.split('/rest/v1/')[1];
    if (t === 'gym_waivers') return json([...WAIVERS].sort((a, b) => b.version - a.version));
    if (t === 'gym_settings') {
      if (req.method() === 'PATCH') {
        waiverRequired = JSON.parse(req.postData() || '{}').waiver_required ?? waiverRequired;
        CALLS.waiver_required = waiverRequired;
        return json([{ id: true }]);
      }
      const row = { id: true, waiver_required: waiverRequired };
      return json(req.headers()['accept']?.includes('vnd.pgrst.object') ? row : [row]);
    }
    if (t === 'profiles' || t === 'gym_people') {
      return json(req.headers()['accept']?.includes('vnd.pgrst.object') ? owner : [owner]);
    }
    return json(req.headers()['accept']?.includes('vnd.pgrst.object') ? null : []);
  });

  const out = [];
  const text = () => page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));
  const has = (t, phrase) => (t.includes(phrase) ? 'shown' : 'MISSING');

  await page.goto('http://localhost:5174/gym-app', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  let t = await text();

  out.push('look card: ' + has(t, 'What it looks like'));
  // Two rows, named for what they mean rather than "colour 1" and "colour 2" —
  // the roles are what keep the screen readable, and an owner picking blind is
  // how the first one ended up rose with amber buttons.
  out.push('role 1: ' + has(t, 'Where you are, and what you have'));
  out.push('role 2: ' + has(t, 'What you can do next'));
  // A gym that never set the second one is told what it currently is, rather
  // than shown fourteen unselected swatches and left to guess.
  out.push('unset says amber: ' + (/Not set, so your buttons are amber/.test(t) ? 'shown' : 'MISSING'));
  out.push('nouns: ' + has(t, 'What you call your people'));
  await page.screenshot({ path: 'shots/admin-gym-app.png', fullPage: true });

  // Pick an action colour and a noun, then save. The assertion is on what was
  // sent: a swatch that highlights and sends nothing is the exact failure.
  await page.getByRole('button', { name: 'Red' }).nth(1).click();
  await page.getByRole('button', { name: 'Save' }).first().click();
  await page.waitForTimeout(1200);
  out.push('action colour sent: ' + (CALLS.save_gym_look?.p_accent_action ?? 'MISSING')
    + ' (kept accent ' + (CALLS.save_gym_look?.p_accent ?? 'MISSING') + ')');

  // "Members" and "Trainers" are children of the People group, and a group is
  // a closed drawer until it is opened — so the rename is invisible until then.
  // Opened here rather than asserted around, because a test that reads a closed
  // drawer proves nothing either way.
  const aside = () => page.evaluate(() => document.querySelector('aside')?.innerText ?? '');
  await page.getByRole('button', { name: /^People/ }).click();
  await page.waitForTimeout(500);
  const navBefore = await aside();
  out.push('sidebar before: ' + (/Trainers/.test(navBefore) ? 'Trainers' : 'MISSING')
    + ' / ' + (/Members/.test(navBefore) ? 'Members' : 'MISSING'));

  await page.getByLabel('All of them', { exact: true }).first().fill('PTs');
  await page.getByLabel('All of your people', { exact: true }).fill('Athletes');
  await page.getByRole('button', { name: 'Save' }).nth(1).click();
  await page.waitForTimeout(1500);
  out.push('noun sent: ' + (CALLS.save_gym_vocabulary?.p_words?.trainers ?? 'MISSING'));

  // CLAUDE.md's standing rule, asserted rather than asserted-to: the gym owner
  // renamed what their *members* read, and the gym's own dashboard follows. A
  // gym that renamed members to "Athletes" and still finds "Members" in its own
  // sidebar reads that as the setting half-working.
  const navAfter = await aside();
  out.push('sidebar renamed without a reload: '
    + (/PTs/.test(navAfter) ? 'PTs' : 'MISSING')
    + ' / ' + (/Athletes/.test(navAfter) ? 'Athletes' : 'MISSING'));

  // Moving the front door. The warning has to be on screen *before* the button,
  // because "every printed link stops working" is not a thing to learn after.
  await page.getByRole('button', { name: 'Change' }).click();
  await page.waitForTimeout(400);
  t = await text();
  out.push('link warning: ' + (/stops working the moment you save/.test(t) ? 'shown' : 'MISSING'));
  await page.getByLabel(/join\/$/).fill('harbour-strength-mamburao');
  await page.getByRole('button', { name: 'Move my link' }).click();
  await page.waitForTimeout(1200);
  out.push('slug sent: ' + (CALLS.set_gym_slug?.p_slug ?? 'MISSING'));
  await page.screenshot({ path: 'shots/admin-gym-app-link.png', fullPage: true });

  // The poster. Asserted on the QR's own <svg> rather than on the screenshot,
  // because a QR that renders as an empty box is exactly the failure a
  // picture-only check sails past.
  await page.getByRole('button', { name: 'Poster' }).click();
  await page.waitForTimeout(700);
  const poster = await page.evaluate(() => {
    const svg = document.querySelector('body > div svg');
    const body = document.body.innerText;
    return {
      qr: svg ? svg.querySelectorAll('path, rect').length : 0,
      name: /Harbour Strength/.test(body),
      // The moved link, not the one the page loaded with.
      link: /harbour-strength-mamburao/.test(body),
      code: /HARB42/.test(body),
      // Approval is not optional (0078); a poster implying instant access
      // starts an argument at the counter on day one.
      honest: /we approve every new member/.test(body),
      // Portalled out of #root, which is what lets one print rule hide the
      // dashboard instead of three `print:hidden` someone will forget.
      portalled: !!svg && document.body.classList.contains('poster-open'),
    };
  });
  out.push('poster: name ' + (poster.name ? 'shown' : 'MISSING')
    + ' / link ' + (poster.link ? 'the moved one' : 'MISSING')
    + ' / code ' + (poster.code ? 'shown' : 'MISSING')
    + ' / approval line ' + (poster.honest ? 'shown' : 'MISSING'));
  out.push('poster QR drew: ' + (poster.qr > 0 ? poster.qr + ' shapes' : 'MISSING'));
  out.push('poster portalled for printing: ' + (poster.portalled ? 'yes' : 'MISSING'));
  await page.screenshot({ path: 'shots/admin-join-poster.png', fullPage: true });

  // ---- Settings -> Waiver (0119) ----------------------------------------
  // The rule under test is that published words cannot be edited: the screen
  // must say so before anyone types, and saving after publishing has to make
  // the NEXT version rather than rewrite the one people signed.
  await page.keyboard.press('Escape').catch(() => {});
  await page.goto('http://localhost:5174/settings', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  await page.getByRole('button', { name: /^Waiver$/ }).click();
  await page.waitForTimeout(900);
  let w = await text();
  out.push('waiver tab: ' + (/Nothing published yet/.test(w) ? 'nothing published, says so' : 'MISSING'));
  // Distinct: the follow-up list repeats the question somebody said yes to.
  out.push('PAR-Q shown read-only: ' + (new Set(w.match(/Question \d/g) || []).size === 7 ? '7 questions' : 'MISSING'));
  await page.getByLabel('Waiver text').fill('I train at my own risk.');
  await page.getByRole('button', { name: 'Save draft' }).click();
  await page.waitForTimeout(900);
  await page.getByRole('button', { name: /^Publish version 1$/ }).click();
  await page.waitForTimeout(900);
  out.push('published: ' + (WAIVERS[0]?.published_at ? 'version 1' : 'MISSING'));
  w = await text();
  out.push('warns before editing a published one: '
    + (/Published words cannot be changed/.test(w) ? 'yes' : 'MISSING'));
  await page.getByLabel('Waiver text').fill('I train at my own risk. Revised.');
  await page.getByRole('button', { name: 'Save draft' }).click();
  await page.waitForTimeout(900);
  out.push('saving after publishing makes version 2, and v1 is untouched: '
    + (WAIVERS.length === 2 && WAIVERS[0].body === 'I train at my own risk.' ? 'yes' : 'MISSING'));
  // Clicked, not check(): the box is controlled and only flips once the save
  // has round-tripped, and check() asserts the new state immediately.
  await page.getByRole('checkbox').first().click();
  await page.waitForTimeout(1200);
  const boxOn = await page.getByRole('checkbox').first().isChecked();
  // The toast has to agree with the box. It once said 'no longer waits' while
  // the box was ticked, because it read the event after an await.
  const toastSays = await page.evaluate(() => document.body.innerText);
  out.push('booking gate sent: ' + (CALLS.waiver_required === true ? 'on' : 'MISSING')
    + ' / box reflects it: ' + (boxOn ? 'yes' : 'MISSING')
    + ' / toast agrees: ' + (/now waits for a signature/.test(toastSays) && !/no longer waits/.test(toastSays) ? 'yes' : 'MISSING'));
  w = await text();
  out.push('a yes on the PAR-Q is listed for follow-up: '
    + (/Lea Lorenzana/.test(w) && /bone_joint/.test(w) ? 'yes' : 'MISSING'));
  await page.screenshot({ path: 'shots/admin-waiver.png', fullPage: true });

  return out.join('\n');
}
