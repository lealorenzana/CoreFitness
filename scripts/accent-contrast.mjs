/**
 * Every gym accent's text step, measured against the Nocturne ground.
 *
 * The member app's type floor is 12px, so the text shade must clear 4.5:1 —
 * violet 600 is 3.5:1, which is exactly why the ramp has a 300 step
 * (index.css). A gym picking a colour must not be able to make its own app
 * unreadable, so this runs in CI rather than being asserted by eye.
 *
 *   node scripts/accent-contrast.mjs
 */
import { readFileSync } from 'node:fs';

const BG = '#0B0B12';   // --color-bg
const src = readFileSync(new URL('../g-fitness-member/src/lib/gymTheme.ts', import.meta.url), 'utf8');

const lin = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const lum = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map(lin);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

let failed = 0;
for (const [, key, body] of src.matchAll(/^\s{2}(\w+): \{ label: '[^']+',([\s\S]*?)\},$/gm)) {
  const text = /c300: '(#[0-9a-fA-F]{6})'/.exec(body)?.[1];
  const fill = /base: '(#[0-9a-fA-F]{6})'/.exec(body)?.[1];
  if (!text || !fill) { console.log(`FAIL ${key}: no ramp`); failed++; continue; }
  const rt = ratio(text, BG);
  const ok = rt >= 4.5;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${key.padEnd(8)} text ${text} ${rt.toFixed(1)}:1 on ${BG} (fill ${fill})`);
}
console.log(failed ? `\n${failed} accent(s) below 4.5:1` : '\nevery accent is readable as text');
process.exit(failed ? 1 : 0);
