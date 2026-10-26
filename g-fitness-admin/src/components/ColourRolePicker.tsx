import { useEffect, useState } from 'react';
import { payOnline, themeState, waitForPayment } from '../lib/api/paymongo';
import { showToast } from '../utils/toast';
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
export default function ColourRolePicker({ value, fallback, onChange, unsetLabel, idPrefix, compact }: {
  value: string;
  fallback: 'violet' | 'amber';
  onChange: (v: string) => void;
  unsetLabel?: string;
  idPrefix: string;
  /** Your app's mock-up layout (2026-10-25): round swatches and one line under them, inside `.att`. */
  compact?: boolean;
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
  /**
   * 0191: a gym's own colour code is a one-time purchase; the presets stay free.
   * null = not known yet, or before 0191 (nothing locked). A gym already on a
   * code before 0191 was given the unlock ('kept'), so it is never taken away.
   *
   * Locked follows the unlock alone, never the current value: the ready-made
   * pairs are partly codes (Volt is #7C3AED + #A3E635), and treating "the value
   * is a code" as "the gym owns codes" opened the code box to a gym that had not
   * paid — whose typed code the database then refused (2026-10-27). The pairs'
   * own codes are free on the server too (0214).
   */
  const [locked, setLocked] = useState<{ price: number } | null>(null);
  /** Back from PayMongo: confirming, then unlocked in place — no reload (0191). */
  const [confirming, setConfirming] = useState<'waiting' | 'slow' | null>(null);
  useEffect(() => {
    let cancelled = false;
    void themeState().then((t) => { if (!cancelled && t && !t.custom_colours) setLocked({ price: Number(t.price ?? 0) }); });
    const stopWaiting = waitForPayment((state, row) => {
      if (cancelled || (row && row.purpose !== 'custom_colours')) return;
      if (state === 'paid') {
        setConfirming(null); setLocked(null);
        // Only one picker on the page says it out loud.
        if (idPrefix.endsWith('accent')) showToast('Payment received — custom colours are yours', 'success');
      } else setConfirming(state);
    });
    return () => { cancelled = true; stopWaiting(); };
  }, [idPrefix]);
  const [buying, setBuying] = useState(false);
  const buy = async () => {
    setBuying(true);
    try { await payOnline('custom_colours', {}, window.location.pathname + window.location.search); }
    catch (e) { setBuying(false); showToast(e instanceof Error ? e.message : 'Could not open the payment', 'error'); }
  };

  if (compact) {
    const ratio = contrast(textShade, '#0B0B12');
    return (
      <div>
        <div className="flex flex-wrap items-center gap-1.5">
          {unsetLabel && (
            <button type="button" className={`a-swc ${value === '' ? 'on' : ''}`} data-tip={unsetLabel}
              aria-label={unsetLabel} aria-pressed={value === ''} onClick={() => onChange('')}
              style={{ background: rampFor(fallback, fallback).base, color: '#1f1a0a', fontSize: 9, fontWeight: 800 }}>Std</button>
          )}
          {ACCENTS.map((a) => (
            <button key={a.key} type="button" className={`a-swc ${value === a.key ? 'on' : ''}`} data-tip={a.label}
              aria-label={a.label} aria-pressed={value === a.key} onClick={() => onChange(a.key)} style={{ background: a.swatch }} />
          ))}
        </div>
        <div className="a-sub" style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {locked ? (
            <button type="button" className="a-chip" onClick={() => void buy()} disabled={buying} data-buy-colours
              data-tip="Presets are free. Your own colour codes are a one-time purchase, paid online.">
              <span style={{ width: 14, height: 14, borderRadius: 99, background: 'conic-gradient(#ef4444, #f59e0b, #22c55e, #3b82f6, #a855f7, #ef4444)' }} />
              {buying ? 'Opening PayMongo…' : `Your own colour · ₱${locked.price.toLocaleString('en-PH')} once`}
            </button>
          ) : (
            <>
              <span>or your brand code</span>
              <label className="a-chip" style={{ padding: '3px 8px 3px 4px', borderColor: custom ? '#fff' : undefined }}>
                <input type="color" aria-label="Pick your own colour" value={isColourCode(draft) ? draft : ramp.base}
                  onChange={(e) => pick(e.target.value)} style={{ width: 18, height: 18, border: 0, padding: 0, background: 'transparent', borderRadius: 99 }} />
                <input id={idPrefix + '-code'} aria-label="Colour code" placeholder="#1F8A70" value={draft} maxLength={7}
                  onChange={(e) => { const v = e.target.value.trim(); pick(v.startsWith('#') || v === '' ? v : '#' + v); }}
                  style={{ width: 64, background: 'transparent', outline: 'none', color: '#fff', fontWeight: 700 }} />
              </label>
            </>
          )}
          <span data-tip="How readable small text in this colour is on the app's background. 4.5 or more passes.">
            Text contrast {ratio.toFixed(1)}:1 {ratio >= 4.5 ? '✓' : ''}
          </span>
        </div>
        {confirming && idPrefix.endsWith('accent') && (
          <p className="a-sub" style={{ marginTop: 6 }} data-colours-confirming>
            {confirming === 'waiting' ? 'Confirming your payment with PayMongo…' : 'PayMongo has not confirmed it yet. If you were charged, it unlocks here shortly — or ask in Help.'}
          </p>
        )}
        {draft !== '' && !isColourCode(draft) && <p className="a-sub" style={{ marginTop: 6, color: 'var(--a-a300)' }}>A colour code is # and six characters, like #1F8A70.</p>}
        {adjusted && (
          <p className="a-sub" style={{ marginTop: 6 }}>
            {value} is {contrast(value, '#0B0B12') < contrast(ramp.base, '#0B0B12') ? 'darker' : 'lighter'} than the colours the app is tested with,
            so on your members' dark screen it uses {ramp.base} — the same hue{action ? '' : ', with a lighter shade for text'}.
          </p>
        )}
      </div>
    );
  }

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
            same thing; either one is enough. Locked until bought (0191). */}
        {locked ? (
          <button type="button" onClick={() => void buy()} disabled={buying} data-buy-colours
            className="flex items-center gap-2 rounded-full border-2 px-3 h-9 text-xs font-semibold disabled:opacity-60"
            data-tip="Presets are free. Your own colour codes are a one-time purchase, paid online."
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}>
            <span className="h-5 w-5 rounded-full" style={{ background: 'conic-gradient(#ef4444, #f59e0b, #22c55e, #3b82f6, #a855f7, #ef4444)' }} />
            {buying ? 'Opening PayMongo…' : `Your own colour · ₱${locked.price.toLocaleString('en-PH')} once`}
          </button>
        ) : (
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
        )}
      </div>

      {confirming && idPrefix.endsWith('accent') && (
        <p className="mt-2 text-xs" style={{ color: 'var(--color-text-secondary)' }} data-colours-confirming>
          {confirming === 'waiting' ? 'Confirming your payment with PayMongo…' : 'PayMongo has not confirmed it yet. If you were charged, it unlocks here shortly — or ask in Help.'}
        </p>
      )}
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
