async (page) => {
  // Captures the top of each 0075 resource's page, the way 0061's previews
  // were made: 1200x400 of the page as it first loads, later scaled to 900x300
  // by scripts/resource-previews-process.py. Nothing is clicked — a cookie
  // banner or bot check in the frame means that resource gets no picture
  // (0061: a screenshot of a CAPTCHA is not a picture of the resource).
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  const SHOTS = [
    ['ace', 'https://www.acefitness.org/resources/everyone/exercise-library/'],
    ['nasm-library', 'https://www.nasm.org/resource-center/exercise-library'],
    ['musclewiki', 'https://musclewiki.com/'],
    ['exerciselibrary', 'https://www.exerciselibrary.com/'],
    ['visualbody', 'https://visualbody.net/workout-library/'],
    ['repdriver', 'https://repdriver.com/'],
    ['sbs-bundle', 'https://www.strongerbyscience.com/program-bundle/'],
    ['boostcamp-programs', 'https://www.boostcamp.app/programs'],
    ['sbs-newsletter', 'https://www.strongerbyscience.com/newsletter/'],
    ['strengthlog-programs', 'https://www.strengthlog.com/training-programs/'],
    ['fitstra', 'https://fitstra.com/workout-programs/'],
    ['ironlibrary', 'https://www.ironlibrary.ca/programs'],
    ['sbs-home', 'https://www.strongerbyscience.com/'],
    ['nasm-resources', 'https://www.nasm.org/resource-center'],
    ['strengthlog-beginners', 'https://www.strengthlog.com/strength-training-for-beginners/'],
    ['liftvault', 'https://liftvault.com/programs/'],
    ['sbs-articles', 'https://www.strongerbyscience.com/articles/'],
    ['examine', 'https://examine.com/'],
    ['nsca', 'https://www.nsca.com/'],
    ['acsm', 'https://acsm.org/'],
    ['boostcamp-app', 'https://www.boostcamp.app/'],
    ['strengthlog-app', 'https://www.strengthlog.com/'],
    ['trainsmart', 'https://www.trainsmart.com/'],
    ['liftlab', 'https://play.google.com/store/apps/details?id=com.liftlab.app'],
    ['free-exercise-db', 'https://github.com/yuhonas/free-exercise-db'],
  ];
  await page.setViewportSize({ width: 1200, height: 800 });
  const out = [];
  for (const [slug, url] of SHOTS) {
    try {
      const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(4500);
      await page.screenshot({ path: `shots/previews-raw/${slug}.png`, clip: { x: 0, y: 0, width: 1200, height: 400 } });
      out.push(`${res ? res.status() : '?'}  ${slug}  ${(await page.title()).slice(0, 60)}`);
    } catch (e) {
      out.push(`ERR  ${slug}  ${String(e).slice(0, 80)}`);
    }
  }
  return out.join('\n');
}
