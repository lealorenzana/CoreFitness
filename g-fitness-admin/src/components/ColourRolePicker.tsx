import { useState } from 'react';
import { ACCENTS } from '../lib/accents';
import { contrast, isColourCode, rampFor } from '../lib/gymTheme';

/**
 * One colour role for the members' app (0112/0141): a preset swatch, or the
 * gym's own colour code.
 *
 * A gym's brand colour is rarely one of fourteen presets, so a code is allowed
 * (0141). It is not used raw: `rampFor()` — a byte-identical copy of the member
 * app's `lib/gymTheme.ts` — keeps the hue and raises the text shade until it
 * reads at 4.5:1 on the app's dark background. The preview draws exactly what
 * the phone will, so the owner sees the adjusted text shade before saving
 * rather than discovering it on a member's phone.
 *
 * `value` is '' for "not set" where the role allows it (the action colour,
 * which is then amber); `unsetLabel` names that choice.
 */
export default function ColourRolePicker({ value, fallback, onChange, unsetLabel, idPrefix }: {
  value: string;
  fallback: 'violet' | 'amber';
  onChange: (v: string) => void;
  unsetLabel?: string;
  idPrefix: string;
}) {
  const custom = isColourCode(value);
  // What is typed into the code box, kept apart from `value` so a half-typed
  // code ("#1F8") is never sent upwards as a colour.
  const [draft, setDraft] = useState(custom ? value : '');
  const current = value || fallback;
  const ramp = rampFor(current, fallback);
  // Drawn as the phone draws each role (noc.tsx): the state colour fills with
  // white text and writes in its 300 shade; the action colour fills with the
  // dark background as its text, and writes in its own base colour.
  const action = fallback === 'amber';
  const textShade = action ? ramp.base : ramp.c300;
  const ink = action ? '#0B0B12' : '#FFFFFF';
  const adjusted = custom && ramp.base.toUpperCase() !== value.toUpperCase();

  const pick = (code: string) => {
    setDraft(code);
    if (isColourCode(code)) onChange(code.toUpperCase());
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        {unsetLabel && (
          <button type="button" data-tip={unsetLabel}
            aria-label={unsetLabel} aria-pressed={value === ''}
            onClick={() => onChange('')}
            className="h-9 w-9 rounded-full border-2 text-[10px] font-semibold"
            style={{
              background: rampFor(fallback, fallback).base, color: '#fff',
              borderColor: value === '' ? 'var(--color-text-primary)' : 'transparent',
            }}>
            Std
          </button>
        )}
        {ACCENTS.map((a) => (
          <button key={a.key} type="button" data-tip={a.label}
            aria-label={a.label} aria-pressed={value === a.key}
            onClick={() => onChange(a.key)}
            className="h-9 w-9 rounded-full border-2"
            style={{
              background: a.swatch,
              borderColor: value === a.key ? 'var(--color-text-primary)' : 'transparent',
            }} />
        ))}
        {/* The gym's own colour. The native picker and the code box edit the
            same thing; either one is enough. */}
        <label className="flex items-center gap-2 rounded-full border-2 pl-1 pr-3 h-9 text-xs cursor-pointer"
          data-tip="Your own brand colour — pick it or type its code"
          style={{
            borderColor: custom ? 'var(--color-text-primary)' : 'var(--color-border)',
            color: 'var(--color-text-secondary)',
          }}>
          <input type="color" aria-label="Pick your own colour"
            value={isColourCode(draft) ? draft : ramp.base}
            onChange={(e) => pick(e.target.value)}
            className="h-6 w-6 cursor-pointer rounded-full border-0 bg-transparent p-0" />
          <input id={idPrefix + '-code'} aria-label="Colour code" placeholder="#1F8A70"
            value={draft} maxLength={7}
            onChange={(e) => {
              const v = e.target.value.trim();
              pick(v.startsWith('#') || v === '' ? v : '#' + v);
            }}
            className="w-[72px] bg-transparent text-xs outline-none"
            style={{ color: 'var(--color-text-primary)' }} />
        </label>
      </div>

      {draft !== '' && !isColourCode(draft) && (
        <p className="mt-2 text-xs" style={{ color: 'var(--color-warning, #D97706)' }}>
          A colour code is # and six characters, like #1F8A70.
        </p>
      )}

      {/* What the phone will draw with this role, on the phone's background. */}
      <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg px-3 py-2.5"
        style={{ background: '#0B0B12', border: '1px solid var(--color-border)' }}>
        <span className="inline-flex h-7 items-center rounded-md px-3 text-xs font-semibold"
          style={{ background: ramp.base, color: ink }}>
          Button
        </span>
        <span className="text-xs font-semibold" style={{ color: textShade }}>Text in this colour</span>
        <span className="h-1.5 w-20 overflow-hidden rounded-full" style={{ background: ramp.light }}>
          <span className="block h-full w-2/3 rounded-full" style={{ background: ramp.base }} />
        </span>
        <span className="ml-auto text-[11px]" style={{ color: 'var(--color-text-muted)' }}
          data-tip="How readable small text in this colour is on the app's background. 4.5 or more passes.">
          Text contrast {contrast(textShade, '#0B0B12').toFixed(1)}:1
        </span>
      </div>
      {adjusted && (
        <p className="mt-2 text-xs" style={{ color: 'var(--color-text-secondary)' }}>
          {value} is {contrast(value, '#0B0B12') < contrast(ramp.base, '#0B0B12') ? 'darker' : 'lighter'} than
          the colours the app is tested with, so on your members' dark screen it uses {ramp.base} — the
          same hue — for buttons and bars{action ? '' : ', and a lighter shade for text'}.
        </p>
      )}
    </div>
  );
}
