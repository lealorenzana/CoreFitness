/**
 * Get the app (/get-app), signed in: the page stays on /get-app (it does not
 * bounce a signed-in member to Today), offers the Android download because the
 * package is really there, and the button delivers core-fitness.apk as a file
 * without navigating away. Navigating to the package is what the service worker
 * used to answer with the app shell, sending the member to Today instead.
 *
 * Member dev server on :5173 (public/core-fitness.apk is served as a file).
 */
async (page) => {
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  const REF = 'ifwxtekyjgeljerslnzr';
  const KEY = `sb-${REF}-auth-token`;
  const C = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  const b64 = (o) => {
    const str = JSON.stringify(o); let bits = '', out = '';
    for (let i = 0; i < str.length; i++) bits += str.charCodeAt(i).toString(2).padStart(8, '0');
    while (bits.length % 6) bits += '0';
    for (let i = 0; i < bits.length; i += 6) out += C[parseInt(bits.slice(i, i + 6), 2)];
    return out;
  };
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const session = {
    access_token: `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: 'm1', role: 'authenticated', exp })}.sig`,
    refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: exp,
    user: { id: 'm1', aud: 'authenticated', role: 'authenticated', email: 'lea@example.test', app_metadata: {}, user_metadata: {} },
  };
  await page.addInitScript(([k, s]) => localStorage.setItem(k, JSON.stringify(s)), [KEY, session]);

  await page.route(`**://${REF}.supabase.co/**`, async (route) => {
    const req = route.request();
    const after = req.url().replace(/^https?:\/\/[^/]+/, '');
    const path = after.indexOf('?') === -1 ? after : after.slice(0, after.indexOf('?'));
    const json = (b) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b),
      headers: { 'Content-Range': '0-0/1', 'Access-Control-Allow-Origin': '*', 'Access-Control-Expose-Headers': 'Content-Range' } });
    if (path.startsWith('/auth/v1/')) return json(path.includes('/user') ? session.user : session);
    if (path === '/rest/v1/rpc/my_gym_context') return json([{ gym_id: 'gym-1', gym_name: 'G Fitness', slug: 'g-fitness',
      role: 'member', status: 'active', lock_reason: null, short_name: null, logo_url: null, accent: 'violet', gym_count: 1 }]);
    return json([]);
  });

  const out = [];
  await page.setViewportSize({ width: 393, height: 852 });
  await page.goto('http://localhost:5173/get-app', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#boot', { state: 'detached', timeout: 9000 }).catch(() => {});
  const btn = page.getByRole('button', { name: 'Download for Android' });
  await btn.waitFor({ timeout: 10000 }).catch(() => {});
  out.push('signed in, /get-app stays /get-app: ' + (/\/get-app$/.test(page.url()) ? 'yes' : 'BOUNCED to ' + page.url()));
  out.push('the Android download is offered: ' + ((await btn.count()) === 1 ? 'yes' : 'MISSING'));

  const [dl] = await Promise.all([
    page.waitForEvent('download', { timeout: 15000 }).catch(() => null),
    btn.click(),
  ]);
  out.push('the button delivers the package as a file: ' + (dl && dl.suggestedFilename() === 'core-fitness.apk' ? 'core-fitness.apk' : 'MISSING'));
  if (dl) {
    const p = await dl.path().catch(() => null);
    const size = p ? (await import('node:fs')).statSync(p).size : 0;
    out.push('…the real package, not a web page: ' + (size > 1_000_000 ? `${(size / 1e6).toFixed(1)} MB` : 'NO, ' + size + ' bytes'));
  }
  await page.waitForTimeout(500);
  out.push('…and the member is still on /get-app: ' + (/\/get-app$/.test(page.url()) ? 'yes' : 'NAVIGATED to ' + page.url()));
  const text = async () => (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ');
  let t = await text();
  out.push('Android: the three steps: ' + (/Download the app/.test(t) && /Allow the install/.test(t) && /Open Core Fitness/.test(t) ? 'yes' : 'MISSING'));

  // The iPhone tab: Safari's Share → Add to Home Screen, and never an install button.
  await page.getByRole('tab', { name: /iPhone/ }).click();
  t = await text();
  out.push('iPhone: Share, then Add to Home Screen: ' + (/Open this page in Safari/.test(t) && /Tap Share/.test(t) && /Tap "Add to Home Screen"/.test(t) ? 'yes' : 'MISSING'));
  out.push('iPhone: no download and no install button: ' + ((await page.getByRole('button', { name: /Download for Android|Install from this browser/ }).count()) === 0 ? 'yes' : 'STILL SHOWN'));
  await page.screenshot({ path: 'shots/member-get-app-iphone.png' });

  // An iPhone opens on its own tab; Chrome on an iPhone is told to use Safari.
  for (const [name, agent, safariNote] of [
    ['Safari on iPhone', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1', false],
    ['Chrome on iPhone', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/124.0 Mobile/15E148 Safari/604.1', true],
  ]) {
    const p2 = await page.context().newPage();
    await p2.addInitScript((ua) => Object.defineProperty(navigator, 'userAgent', { get: () => ua }), agent);
    await p2.goto('http://localhost:5173/get-app', { waitUntil: 'domcontentloaded' });
    await p2.getByText('Get the app').first().waitFor({ timeout: 15000 });
    await p2.waitForTimeout(800);
    const t2 = (await p2.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ');
    const onIphone = (await p2.getByRole('tab', { name: /iPhone/ }).getAttribute('aria-selected')) === 'true';
    const note = /only Safari can add an app to the Home Screen/.test(t2);
    out.push(`${name}: opens on the iPhone tab${safariNote ? ', told to use Safari' : ''}: ` + (onIphone && note === safariNote ? 'yes' : `MISSING tab=${onIphone} note=${note}`));
    await p2.close();
  }
  return out.join('\n');
}
