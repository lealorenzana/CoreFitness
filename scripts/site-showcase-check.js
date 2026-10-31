/**
 * The website's scroll-told showcase (2026-10-11): every feature in the
 * catalogue, and each scroll technique doing its job — words lighting up with
 * the scroll (text reveal), the phone turning in 3D, the canvas sequence
 * scrubbing with the scrollbar, group titles pinned while features pass,
 * parallax on the photos, the marquee answering the scroll — on a desktop and
 * a phone, with no sideways scroll. Pricing's four tiers sit in one row.
 *
 * Website dev server on :5176.
 */
async (page) => {
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  const out = [];
  const TIERS = ['trial', 'starter', 'growth', 'pro'].map((key, i) => ({ key, name: key[0].toUpperCase() + key.slice(1), line: 'x',
    price_monthly: [0, 1499, 3499, 6999][i], price_yearly: [null, 14990, 34990, 69990][i], trial_days: i === 0 ? 30 : null, max_members: [100, 100, 400, null][i],
    max_staff: [3, 3, 10, null][i], ai_monthly_cap: [300, 300, 1500, 4000][i], includes: [], sort_order: i }));
  await page.route('**/rest/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const json = (b) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
    if (path.includes('/rpc/platform_price_list')) return json(TIERS);
    if (path.includes('/rpc/')) return json(path.includes('list_gyms') || path.includes('testimonials') ? [] : null);
    return json([]);
  });

  const pinOf = (sel) => page.evaluate((s) => Number(getComputedStyle(document.querySelector(s)).getPropertyValue('--pin') || 'NaN'), sel);
  const scrollInto = async (sel, k) => {
    await page.evaluate(([s, kk]) => {
      const el = document.querySelector(s);
      const top = el.getBoundingClientRect().top + window.scrollY;
      window.scrollTo(0, top + (el.offsetHeight - window.innerHeight) * kk);
    }, [sel, k]);
    await page.waitForTimeout(450);
  };
  const canvasHash = () => page.evaluate(() => {
    const c = document.querySelector('.scrub-canvas');
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let h = 0; for (let i = 0; i < d.length; i += 997) h = (h * 31 + d[i]) >>> 0; return h;
  });

  for (const [label, w, h] of [['desktop', 1440, 900], ['phone', 390, 844]]) {
    await page.setViewportSize({ width: w, height: h });
    await page.goto('about:blank');
    await page.goto('http://localhost:5176/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    await page.addStyleTag({ content: 'html { scroll-behavior: auto !important; }' });

    const items = await page.locator('.cat-item').count();
    const groups = await page.locator('.cat-group').count();
    if (label === 'desktop') out.push(`the catalogue lists every feature (${items} in ${groups} groups): ` + (items >= 50 && groups >= 9 ? 'yes' : 'MISSING'));

    await scrollInto('.manifesto', 0.1); const m1 = await page.evaluate(() => getComputedStyle(document.querySelectorAll('.mw')[20]).opacity);
    await scrollInto('.manifesto', 0.9); const m2 = await page.evaluate(() => getComputedStyle(document.querySelectorAll('.mw')[20]).opacity);
    out.push(`${label}: words light up with the scroll: ` + (Number(m1) < 0.5 && Number(m2) > 0.9 ? 'yes' : `MISSING ${m1}→${m2}`));

    await scrollInto('.p3d', 0.05); const t1 = await page.evaluate(() => getComputedStyle(document.querySelector('.p3d-phone')).transform);
    await scrollInto('.p3d', 0.95); const t2 = await page.evaluate(() => getComputedStyle(document.querySelector('.p3d-phone')).transform);
    out.push(`${label}: the phone turns in 3D: ` + (t1 !== t2 && /matrix3d/.test(t2) ? 'yes' : 'MISSING'));
    if (label === 'phone') await page.screenshot({ path: 'shots/site-3d-phone.png' });

    await scrollInto('.scrub', 0.05); const c1 = await canvasHash(); const p1 = await pinOf('.scrub');
    await scrollInto('.scrub', 0.6); const c2 = await canvasHash();
    await scrollInto('.scrub', 0.05); const c3 = await canvasHash();
    out.push(`${label}: the sequence scrubs with the scrollbar, both ways: ` + (c1 !== c2 && c1 === c3 && p1 < 0.2 ? 'yes' : `MISSING ${c1} ${c2} ${c3}`));
    await scrollInto('.scrub', 0.6);
    await page.screenshot({ path: `shots/site-scrub-${label}.png` });

    // Pinning: a group's title holds while its items pass.
    await page.evaluate(() => { document.getElementById('cat-owner').scrollIntoView(); window.scrollBy(0, 260); });
    await page.waitForTimeout(300);
    const y1 = await page.evaluate(() => document.querySelector('#cat-owner .cat-head').getBoundingClientRect().top);
    await page.evaluate(() => window.scrollBy(0, 200));
    await page.waitForTimeout(300);
    const y2 = await page.evaluate(() => document.querySelector('#cat-owner .cat-head').getBoundingClientRect().top);
    out.push(`${label}: group titles stay pinned while features scroll: ` + (Math.abs(y1 - y2) < 4 ? 'yes' : `MISSING ${y1}→${y2}`));
    await page.screenshot({ path: `shots/site-catalogue-${label}.png` });

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    out.push(`${label}: no sideways scroll: ` + (overflow <= 1 ? 'yes' : `MISSING ${overflow}px`));
  }

  // Parallax and the marquee, desktop.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('http://localhost:5176/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  await page.addStyleTag({ content: 'html { scroll-behavior: auto !important; }' });
  const tk = () => page.evaluate(() => getComputedStyle(document.querySelector('.ticker-row')).translate);
  const a = await tk(); await page.evaluate(() => window.scrollTo(0, 2400)); await page.waitForTimeout(400); const b = await tk();
  out.push('the marquee moves with the scroll: ' + (a !== b ? 'yes' : `MISSING ${a}`));
  await page.evaluate(() => document.getElementById('floor').scrollIntoView({ block: 'end' })); await page.waitForTimeout(300);
  const pa = await page.evaluate(() => getComputedStyle(document.querySelector('.pb-img img')).transform);
  await page.evaluate(() => document.getElementById('floor').scrollIntoView({ block: 'start' })); await page.waitForTimeout(300);
  const pb = await page.evaluate(() => getComputedStyle(document.querySelector('.pb-img img')).transform);
  out.push('the photo band moves slower than the page (parallax): ' + (pa !== pb ? 'yes' : 'MISSING'));

  await page.evaluate(() => document.getElementById('pricing').scrollIntoView());
  await page.waitForTimeout(800);
  const tops = await page.evaluate(() => [...document.querySelectorAll('.card.tier')].map((c) => Math.round(c.getBoundingClientRect().top)));
  out.push('pricing: four tiers in one row on a desktop: ' + (tops.length === 4 && new Set(tops).size === 1 ? 'yes' : 'MISSING ' + JSON.stringify(tops)));
  await page.screenshot({ path: 'shots/site-pricing.png' });

  // The hero names the strongest features; the Google button is one clean line.
  await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(400);
  const orbits = await page.locator('.hero-visual .orbit').allInnerTexts();
  out.push('the hero names the AI assistant, paying in the app, the coach app and check-in: ' + (orbits.some((o) => /AI assistant/.test(o)) && orbits.some((o) => /QRPh/.test(o)) && orbits.some((o) => /coach app/.test(o)) && !orbits.some((o) => /Filipino/.test(o)) ? 'yes' : 'MISSING ' + JSON.stringify(orbits)));
  await page.screenshot({ path: 'shots/site-hero.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => document.getElementById('apply').scrollIntoView()); await page.waitForTimeout(600);
  const g = page.locator('[data-google-button]').first();
  const gb = await g.boundingBox();
  out.push('Apply with Google is one line: ' + (gb && gb.height <= 52 && (await g.innerText()).trim() === 'Apply with Google' ? 'yes' : 'MISSING ' + JSON.stringify(gb)));
  await g.scrollIntoViewIfNeeded(); await page.evaluate(() => window.scrollBy(0, -120)); await page.waitForTimeout(300);
  await page.screenshot({ path: 'shots/site-apply-google.png' });
  return out.join('\n');
}
