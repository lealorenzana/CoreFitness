/**
 * The website (redesigned 2026-11-24 to the owner's mock-up 02): shorter browsing, every feature still there.
 * The catalogue shows one category at a time and its search finds features in any category; the owner's
 * day and the four roles switch with buttons, not long pinned scrolls; pricing shows one plan at a time
 * (Next plan walks them); the gym directory pages six at a time; the old floor plan hero still opens
 * from the hero. Words still light up with the scroll in the manifesto. No sideways scroll on a desktop
 * or a phone, and the Apply with Google button stays one line.
 *
 * Website dev server on :5176.
 */
async (page) => {
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  const out = [];
  const TIERS = ['trial', 'starter', 'growth', 'pro'].map((key, i) => ({ key, name: key[0].toUpperCase() + key.slice(1), line: 'x',
    price_monthly: [0, 1499, 3499, 6999][i], price_yearly: [null, 14990, 34990, 69990][i], trial_days: i === 0 ? 30 : null, max_members: [100, 100, 400, null][i],
    max_staff: [3, 3, 10, null][i], ai_monthly_cap: [300, 300, 1500, 4000][i], includes: [], sort_order: i }));
  const GYMS = Array.from({ length: 8 }, (_, i) => ({ id: `g${i}`, slug: `gym-${i}`, name: `Sample Gym ${i + 1}`, is_demo: i >= 6 }));
  await page.route('**/rest/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const json = (b) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
    if (path.includes('/rpc/platform_price_list')) return json(TIERS);
    if (path.includes('/rpc/list_gyms')) return json(GYMS);
    if (path.includes('/rpc/')) return json(path.includes('testimonials') ? [] : null);
    return json([]);
  });
  const shown = (sel) => page.evaluate((s) => [...document.querySelectorAll(s)].filter((e) => e.offsetParent !== null).length, sel);
  const scrollInto = async (sel, k) => {
    await page.evaluate(([s, kk]) => {
      const el = document.querySelector(s);
      const top = el.getBoundingClientRect().top + window.scrollY;
      window.scrollTo(0, top + (el.offsetHeight - window.innerHeight) * kk);
    }, [sel, k]);
    await page.waitForTimeout(450);
  };

  for (const [label, w, h] of [['desktop', 1440, 900], ['phone', 390, 844]]) {
    await page.setViewportSize({ width: w, height: h });
    await page.goto('about:blank');
    await page.goto('http://localhost:5176/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    await page.addStyleTag({ content: 'html { scroll-behavior: auto !important; }' });

    if (label === 'desktop') {
      const items = await page.locator('.cat-item').count();
      const groups = await page.locator('.cat-group').count();
      out.push(`the catalogue keeps every feature (${items} in ${groups} groups): ` + (items >= 50 && groups >= 9 ? 'yes' : 'MISSING'));
      out.push('…one category at a time: ' + ((await shown('.cat-group')) === 1 ? 'yes' : `MISSING ${await shown('.cat-group')}`));
      await page.locator('#inside a[href="#cat-coaches"]').click(); await page.waitForTimeout(300);
      const onCoaches = await page.evaluate(() => [...document.querySelectorAll('.cat-group')].filter((g) => g.offsetParent !== null).map((g) => g.id));
      out.push('a category link shows that category: ' + (onCoaches.length === 1 && onCoaches[0] === 'cat-coaches' ? 'yes' : 'MISSING ' + onCoaches));
      await page.locator('#cat-q').fill('GCash'); await page.waitForTimeout(300);
      const hits = await page.evaluate(() => [...document.querySelectorAll('.cat-item')].filter((e) => e.offsetParent !== null).map((e) => e.textContent));
      out.push(`search finds features in any category (${hits.length}): ` + (hits.length > 0 && hits.every((t) => /gcash/i.test(t)) ? 'yes' : 'MISSING'));
      await page.locator('#cat-q').fill('');
    }

    await scrollInto('.manifesto', 0.1); const m1 = await page.evaluate(() => getComputedStyle(document.querySelectorAll('.mw')[20]).opacity);
    await scrollInto('.manifesto', 0.9); const m2 = await page.evaluate(() => getComputedStyle(document.querySelectorAll('.mw')[20]).opacity);
    out.push(`${label}: words light up with the scroll: ` + (Number(m1) < 0.5 && Number(m2) > 0.9 ? 'yes' : `MISSING ${m1}→${m2}`));

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    out.push(`${label}: no sideways scroll: ` + (overflow <= 1 ? 'yes' : `MISSING ${overflow}px`));
  }

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('http://localhost:5176/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);

  // The day and the roles switch with buttons.
  const noon = page.locator('#day button', { hasText: '12:00 PM' });
  await noon.click(); await page.waitForTimeout(300);
  out.push('the day moves to a chosen hour: ' + ((await noon.getAttribute('aria-current')) === 'step' ? 'yes' : 'MISSING'));
  const desk = page.locator('.v2-role-tabs button', { hasText: 'Front desk' });
  await desk.click(); await page.waitForTimeout(300);
  out.push('a role tab shows that role: ' + ((await desk.getAttribute('aria-selected')) === 'true' ? 'yes' : 'MISSING'));

  // Pricing: one plan at a time, from the price list.
  const pressed = () => page.locator('.v2-plan-picker button[aria-pressed="true"]').innerText();
  const p0 = await pressed();
  await page.locator('.v2-plan-next').click(); await page.waitForTimeout(200);
  const p1 = await pressed();
  out.push('pricing: Next plan walks the plans: ' + (p0 === 'Trial' && p1 === 'Starter' ? 'yes' : `MISSING ${p0}→${p1}`));
  const priceText = await page.locator('#pricing').innerText();
  out.push('…and the price comes from the price list: ' + (/1,499/.test(priceText) ? 'yes' : 'MISSING'));

  // The directory pages six at a time.
  const gymNames = () => page.evaluate(() => [...document.querySelectorAll('#gyms')].flatMap((s) => (s.innerText.match(/Sample Gym \d+/g) ?? [])));
  const g1 = await gymNames();
  await page.locator('#gyms button', { hasText: 'Next →' }).click(); await page.waitForTimeout(200);
  const g2 = await gymNames();
  out.push(`the gym directory pages six at a time (${g1.length}, then ${g2.length}): ` + (g1.length === 6 && g2.length === 2 ? 'yes' : 'MISSING'));

  // The floor plan hero is still there, one tap away.
  await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(300);
  await page.locator('details.v2-floor summary').click(); await page.waitForTimeout(400);
  const zones = await page.locator('[data-hero-plan] .hp-zone').count();
  out.push(`the floor plan opens from the hero (${zones} areas): ` + (zones === 10 ? 'yes' : 'MISSING'));
  const deco = await page.evaluate(() => document.querySelectorAll('.cursor-glow, .tilt, .magnetic, .blob, .grain').length);
  out.push('no cursor glow, tilt, magnetic buttons, blobs or grain: ' + (deco === 0 ? 'yes' : `MISSING ${deco} left`));
  await page.screenshot({ path: 'shots/site-hero.png' });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => document.getElementById('apply').scrollIntoView()); await page.waitForTimeout(600);
  const g = page.locator('[data-google-button]').first();
  const gb = await g.boundingBox();
  out.push('Apply with Google is one line: ' + (gb && gb.height <= 52 && (await g.innerText()).trim() === 'Apply with Google' ? 'yes' : 'MISSING ' + JSON.stringify(gb)));
  await page.screenshot({ path: 'shots/site-apply-google.png' });
  return out.join('\n');
}
