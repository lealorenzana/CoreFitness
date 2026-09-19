#!/usr/bin/env node
/**
 * Runs the fixture checks in scripts/*.js outside the agent's Playwright tool,
 * so they can run on every push (.github/workflows/ci.yml) or by hand.
 *
 *   node scripts/ci/run-ui-checks.mjs                 # every check in the manifest
 *   node scripts/ci/run-ui-checks.mjs workout-run     # just the ones whose name matches
 *
 * Needs the dev servers up (member :5173, admin :5174 for admin checks) and
 * `playwright` resolvable from the current directory — like the SQL harness, it
 * is not a dependency of either app.
 *
 * Each check file is one `async (page) => { ... }` expression (the shape the
 * agent's runner takes). It passes when:
 *   - it returns an object with a `failures` array that is empty (older checks), or
 *   - it returns text containing none of the failure words below (newer checks
 *     print "label: value" lines and spell a failure in capitals).
 */
import { readFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..', '..');
const requireFromCwd = createRequire(join(process.cwd(), 'noop.js'));
let chromium;
try {
  const mod = await import(pathToFileURL(requireFromCwd.resolve('playwright')).href);
  chromium = mod.chromium ?? mod.default?.chromium;   // CommonJS arrives as default
} catch {
  console.error('playwright is not installed here. Run: npm install playwright && npx playwright install chromium');
  process.exit(2);
}

const manifest = JSON.parse(readFileSync(join(here, 'ui-checks.json'), 'utf-8'));
const filter = process.argv[2];
const checks = manifest.checks.filter((c) => !filter || c.file.includes(filter));

/** A capitalised word the checks use only when something is wrong. */
const FAILURE = /\bMISSING\b|\bSTILL (SHOWN|QUEUED)\b|\bNO\b|=ALLOWED\b|\bERRORS\b|\bNO DOWNLOAD\b|\bFAILED\b|\bENGLISH\b|\bREFUSED:/;

mkdirSync(join(process.cwd(), 'shots'), { recursive: true });
// UI_CHECKS_CHANNEL=chrome uses the installed Chrome instead of Playwright's
// own download — handy on a PC that has Chrome and no Playwright browsers.
const browser = await chromium.launch(process.env.UI_CHECKS_CHANNEL ? { channel: process.env.UI_CHECKS_CHANNEL } : {});
let failed = 0;

for (const check of checks) {
  const code = readFileSync(join(repo, 'scripts', check.file), 'utf-8');
  const started = Date.now();
  const context = await browser.newContext();
  const page = await context.newPage();
  page.setDefaultTimeout(20_000);
  let verdict = 'pass';
  let detail = '';
  try {
    // The file is a single arrow-function expression, comments included.
    const fn = (0, eval)(`(${code}\n)`);
    const result = await Promise.race([
      fn(page),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timed out after 180 s')), 180_000)),
    ]);
    if (result && typeof result === 'object' && Array.isArray(result.failures)) {
      detail = result.summary ?? '';
      if (result.failures.length) { verdict = 'FAIL'; detail += '\n  ' + result.failures.join('\n  '); }
    } else {
      detail = String(result);
      if (FAILURE.test(detail)) verdict = 'FAIL';
    }
  } catch (err) {
    verdict = 'FAIL';
    detail = err instanceof Error ? err.message : String(err);
  } finally {
    await context.close();
  }
  if (verdict === 'FAIL') failed += 1;
  const secs = ((Date.now() - started) / 1000).toFixed(0);
  console.log(`\n${verdict === 'pass' ? 'PASS' : 'FAIL'}  ${check.file}  (${secs} s)`);
  console.log('  ' + detail.split('\n').join('\n  '));
}

await browser.close();
console.log(`\n${checks.length - failed} of ${checks.length} checks passed`);
process.exit(failed ? 1 : 0);
