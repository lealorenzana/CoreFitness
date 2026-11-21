/**
 * The website's scroll-told showcase (2026-10-11): every feature in the
 * catalogue, and each scroll technique doing its job — words lighting up with
 * the scroll (text reveal), the member's screen assembling, the month calendar
 * scrubbing with the scrollbar (both tappable), group titles pinned while features pass,
 * parallax on the photos — on a desktop and a phone, with no sideways scroll.
 * Pricing's four tiers sit in one row.
 *
 * Redesign 2026-11-21 (design/lessons/LESSONS.md): the marquee, the orbiting hero chips and every
 * pointer effect (cursor glow, tilt, magnetic buttons) were removed as decoration; the hero now shows
 * the gym app and the member app over the owner's photo, with three depths of scroll parallax.
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
  const litDays = () => page.evaluate(() => Number(document.querySelector('.month').dataset.lit));
  const piecesIn = () => page.evaluate(() => document.querySelectorAll('.as-piece.in').length);

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

    await scrollInto('.assemble', 0.05); const a1 = await piecesIn();
    await scrollInto('.assemble', 0.97); const a2 = await piecesIn();
    out.push(`${label}: the member's screen assembles piece by piece with the scroll: ` + (a1 === 1 && a2 === 4 ? 'yes' : `MISSING ${a1}→${a2}`));
    const clipped = await page.evaluate(() => { const scr = document.querySelector('.as-phone .phone-screen').getBoundingClientRect();
      const last = document.querySelector('.as-piece[data-piece="ai"]').getBoundingClientRect(); return last.bottom - scr.bottom; });
    out.push(`${label}: …and the last piece fits inside the phone: ` + (clipped <= 1 ? 'yes' : `MISSING ${Math.round(clipped)}px cut`));
    if (label === 'phone') await page.screenshot({ path: 'shots/site-assemble-phone.png' });
    await page.locator('.as-key button').nth(1).click(); await page.waitForTimeout(1200);
    out.push(`${label}: tapping a line jumps to its piece: ` + ((await page.locator('.as-key button[aria-current="step"]').count()) === 1
      && /next session/i.test(await page.locator('.as-key button[aria-current="step"]').innerText()) ? 'yes' : 'MISSING'));

    await scrollInto('.month', 0.05); const c1 = await litDays(); const p1 = await pinOf('.month');
    await scrollInto('.month', 0.7); const c2 = await litDays();
    await scrollInto('.month', 0.05); const c3 = await litDays();
    out.push(`${label}: the month fills with the scrollbar, both ways: ` + (c1 < c2 && c1 === c3 && p1 < 0.2 ? 'yes' : `MISSING ${c1} ${c2} ${c3}`));
    await scrollInto('.month', 0.7);
    const future = await page.locator('.cal-d:not(.past)').first().isDisabled();
    await page.locator('.cal-d.record').click(); await page.waitForTimeout(250);
    const said = await page.locator('.cal-info').innerText();
    out.push(`${label}: a passed day can be tapped and says what happened, a future one cannot: ` + (future && /personal record/.test(said) ? 'yes' : `MISSING ${future} ${said.slice(0, 60)}`));
    await page.screenshot({ path: `shots/site-month-${label}.png` });

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

  // Parallax, desktop; and no decoration that follows the mouse.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('http://localhost:5176/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  await page.addStyleTag({ content: 'html { scroll-behavior: auto !important; }' });
  // The hero (2026-11-22): a floor plan to explore. It tours on its own, a tap shows that area, and it tilts with the scroll.
  const title = () => page.locator('.hp-card__title').innerText();
  const zones = await page.locator('[data-hero-plan] .hp-zone').count();
  const t0 = await title(); await page.waitForTimeout(4200); const t1 = await title();
  out.push(`the hero plan has its areas (${zones}) and tours them on its own: ` + (zones === 10 && t0 !== t1 ? 'yes' : `MISSING ${zones} ${t0}→${t1}`));
  await page.locator('[data-zone="floor"]').click(); await page.waitForTimeout(300);
  const picked = await title(); await page.waitForTimeout(4200); const stayed = await title();
  out.push('a tapped area shows what happens there, and the tour stops: ' + (/Personal training/.test(picked) && picked === stayed ? 'yes' : `MISSING ${picked}→${stayed}`));
  const tilt = () => page.evaluate(() => getComputedStyle(document.querySelector('.hp-board')).transform);
  const a = await tilt(); await page.evaluate(() => window.scrollTo(0, 500)); await page.waitForTimeout(400); const b = await tilt();
  out.push('the hero plan tilts back as the page scrolls: ' + (a !== b ? 'yes' : `MISSING ${a}`));
  const deco = await page.evaluate(() => document.querySelectorAll('.cursor-glow, .tilt, .magnetic, .ticker, .blob, .orbit, .grain').length);
  out.push('no cursor glow, tilt, magnetic buttons, marquee, blobs or grain: ' + (deco === 0 ? 'yes' : `MISSING ${deco} left`));
  await page.evaluate(() => document.getElementById('floor').scrollIntoView({ block: 'end' })); await page.waitForTimeout(300);
  const pa = await page.evaluate(() => getComputedStyle(document.querySelector('.pb-img img')).transform);
  await page.evaluate(() => document.getElementById('floor').scrollIntoView({ block: 'start' })); await page.waitForTimeout(300);
  const pb = await page.evaluate(() => getComputedStyle(document.querySelector('.pb-img img')).transform);
  out.push('the photo band moves slower than the page (parallax): ' + (pa !== pb ? 'yes' : 'MISSING'));

  await page.evaluate(() => document.getElementById('pricing').scrollIntoView());
  await page.waitForTimeout(800);
  const tops = await page.evaluate(() => [...document.querySelectorAll('.tiers .tier')].map((c) => Math.round(c.getBoundingClientRect().top)));
  out.push('pricing: four tiers in one row on a desktop: ' + (tops.length === 4 && new Set(tops).size === 1 ? 'yes' : 'MISSING ' + JSON.stringify(tops)));
  await page.screenshot({ path: 'shots/site-pricing.png' });

  // The hero names the strongest features; the Google button is one clean line.
  await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(400);
  const lede = await page.locator('.hero .lede').innerText();
  out.push('the hero names the AI assistant, check-in and paying in the app: ' + (/AI assistant/.test(lede) && /check-in/.test(lede) && /in the app/.test(lede) ? 'yes' : 'MISSING ' + lede.slice(0, 80)));
  const primaries = await page.locator('.hero .cta:not(.ghost)').count();
  out.push('the hero has one primary button: ' + (primaries === 1 ? 'yes' : `MISSING ${primaries}`));
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
