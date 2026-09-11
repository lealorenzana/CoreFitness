async (page) => {
  // Second pass for pages whose first frame opened with a promotional strip —
  // a sale bar (NASM) or an email sign-up bar (StrengthLog) — above the page
  // itself. Same 1200x400 frame, taken from just below the strip. Still
  // nothing clicked.
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  const SHOTS = [
    ['nasm-library', 'https://www.nasm.org/resource-center/exercise-library', 38],
    ['nasm-resources', 'https://www.nasm.org/resource-center', 38],
    ['strengthlog-programs', 'https://www.strengthlog.com/training-programs/', 100],
    ['strengthlog-beginners', 'https://www.strengthlog.com/strength-training-for-beginners/', 100],
  ];
  await page.setViewportSize({ width: 1200, height: 800 });
  const out = [];
  for (const [slug, url, y] of SHOTS) {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(4500);
    await page.screenshot({ path: `shots/previews-raw/${slug}.png`, clip: { x: 0, y, width: 1200, height: 400 } });
    out.push(`${slug} from y=${y}`);
  }
  return out.join('\n');
}
