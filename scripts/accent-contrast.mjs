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

// ---- a gym's own colour code (0141) ----------------------------------------------------------
// A code is not a preset anybody checked by eye, so the rule is proven over the
// whole colour wheel: every hue in 5-degree steps, at five saturations and six
// lightnesses (2,160 codes, near-black and near-white included), through the very
// function the phone runs. Every text shade must clear 4.5:1 on the ground.
//
// The admin app previews with a copy of the same file; a copy that drifted
// would preview one colour and ship another, so the two must be identical.
const adminCopy = readFileSync(new URL('../g-fitness-admin/src/lib/gymTheme.ts', import.meta.url), 'utf8');
if (adminCopy !== src) { console.log('FAIL  g-fitness-admin/src/lib/gymTheme.ts differs from the member app copy'); failed++; }

const theme = await import(new URL('../g-fitness-member/src/lib/gymTheme.ts', import.meta.url).href);
const hsl = (h, s, l) => {
  const a = s * Math.min(l, 1 - l);
  const f = (n) => { const k = (n + h / 30) % 12; return Math.round((l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))) * 255).toString(16).padStart(2, '0'); };
  return `#${f(0)}${f(8)}${f(4)}`;
};
const presetFills = Object.values(theme.ACCENTS).map((a) => lum(a.base));
let codes = 0, worst = { r: 99 };
for (let h = 0; h < 360; h += 5) for (const s of [0, 0.1, 0.4, 0.7, 1]) for (const l of [0.03, 0.2, 0.4, 0.55, 0.75, 0.97]) {
  const code = hsl(h, s, l);
  const ramp = theme.rampFor(code, 'violet');
  codes++;
  for (const stop of ['c300', 'c200', 'c400']) {
    const r = ratio(ramp[stop], BG);
    if (r < worst.r) worst = { r, code, stop, shade: ramp[stop] };
    if (r < 4.5) { failed++; console.log(`FAIL  ${code} ${stop} ${ramp[stop]} ${r.toFixed(2)}:1`); }
  }
  // A code in the presets' own brightness range is drawn exactly, as the fill.
  const L = lum(code);
  if (L >= Math.min(...presetFills) && L <= Math.max(...presetFills) && ramp.base !== code.toUpperCase()) {
    failed++; console.log(`FAIL  ${code} is a usable fill but the app would draw ${ramp.base}`);
  }
}
// A preset key still gets exactly its own ramp, and an unknown word the fallback.
if (theme.rampFor('rose', 'violet') !== theme.ACCENTS.rose) { failed++; console.log('FAIL  a preset key no longer maps to its ramp'); }
if (theme.rampFor('nonsense', 'amber') !== theme.ACCENTS.amber) { failed++; console.log('FAIL  an unknown key does not fall back'); }
console.log(`${codes} colour codes: the least readable text shade is ${worst.shade} for ${worst.code} (${worst.stop}), ${worst.r.toFixed(2)}:1`);
console.log(failed ? `\n${failed} failure(s)` : 'every colour a gym can choose is readable as text');
process.exit(failed ? 1 : 0);
