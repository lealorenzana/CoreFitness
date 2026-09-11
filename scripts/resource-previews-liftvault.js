async (page) => {
  // Lift Vault's first capture was dimmed under a timed "Unlock The Vault!"
  // overlay. The overlay arrives after load, so this frames the page at a few
  // moments before it does — nothing is clicked or dismissed. Each frame is
  // judged by eye; if every one is covered, Lift Vault keeps no picture.
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await page.setViewportSize({ width: 1200, height: 800 });
  const out = [];
  for (const ms of [800, 1500, 2500]) {
    await page.goto('https://liftvault.com/programs/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(ms);
    await page.screenshot({ path: `shots/previews-raw/liftvault-${ms}.png`, clip: { x: 0, y: 0, width: 1200, height: 400 } });
    out.push(`liftvault at ${ms}ms`);
  }
  return out.join('\n');
}
