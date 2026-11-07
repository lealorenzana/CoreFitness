import { useEffect, useMemo, useState } from 'react';
import { STEP_INPUT, STEP_INPUT_STYLE } from './stepStyles';

type Places = [string, string[]][];

/** "Brgy. 9, Mamburao, Occidental Mindoro" → its three parts, when the last two are on the list. */
function split(address: string, places: Places | null): { street: string; town: string; province: string } {
  const parts = address.split(',').map((p) => p.trim()).filter(Boolean);
  if (!places || parts.length < 2) return { street: address, town: '', province: '' };
  const province = parts[parts.length - 1];
  const towns = places.find(([p]) => p === province)?.[1];
  if (!towns) return { street: address, town: '', province: '' };
  const town = parts[parts.length - 2];
  if (!towns.includes(town)) return { street: parts.slice(0, -1).join(', '), town: '', province };
  return { street: parts.slice(0, -2).join(', '), town, province };
}

/**
 * Where someone (or the gym) is: province, then city or municipality, then the
 * street or barangay in their own words — stored as the one address line the
 * app always has. The list is the PSA's (PSGC, `data/phPlaces.json`, the same
 * file the website's apply form and the phone app use), loaded only when a form
 * asks for it. Laid out as the website's apply form (owner, 2026-11-07): one
 * box, each field labelled, the same everywhere in the system.
 */
export default function PlacePicker({ value, onChange, inputClass = STEP_INPUT, inputStyle = STEP_INPUT_STYLE, streetPlaceholder = 'Brgy. Payompon, Capitol Road' }: {
  value: string;
  onChange: (address: string) => void;
  /** The form's own field look (the wizards' by default; Settings passes its `a-in`). */
  inputClass?: string;
  inputStyle?: React.CSSProperties;
  streetPlaceholder?: string;
}) {
  const [places, setPlaces] = useState<Places | null>(null);
  const [parts, setParts] = useState(() => split(value, null));

  useEffect(() => {
    let alive = true;
    void import('../../data/phPlaces.json').then((m) => {
      if (!alive) return;
      const list = m.default as Places;
      setPlaces(list);
      setParts(split(value, list));
    });
    return () => { alive = false; };
    // Read once: after that the picker owns the parts and writes the line.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const towns = useMemo(() => places?.find(([p]) => p === parts.province)?.[1] ?? [], [places, parts.province]);
  const set = (next: typeof parts) => {
    setParts(next);
    onChange([next.street.trim(), next.town, next.province].filter(Boolean).join(', '));
  };
  const label = 'block text-[12.5px] font-semibold mb-1.5';
  const labelStyle = { color: 'var(--color-text-secondary)' };

  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-3 rounded-2xl p-4" data-place-picker
      style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}>
      <label className="min-w-0">
        <span className={label} style={labelStyle}>Province</span>
        <select value={parts.province} disabled={!places} aria-label="Province" className={`${inputClass} w-full`} style={inputStyle}
          onChange={(e) => set({ ...parts, province: e.target.value, town: '' })}>
          <option value="">{places ? 'Choose a province' : 'Loading places…'}</option>
          {places?.map(([p]) => <option key={p} value={p}>{p}</option>)}
        </select>
      </label>
      <label className="min-w-0">
        <span className={label} style={labelStyle}>City or municipality</span>
        <select value={parts.town} disabled={!parts.province} aria-label="City or municipality" className={`${inputClass} w-full`} style={inputStyle}
          onChange={(e) => set({ ...parts, town: e.target.value })}>
          <option value="">{parts.province ? 'Choose one' : 'Pick the province first'}</option>
          {towns.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </label>
      <label className="col-span-2 min-w-0">
        <span className={label} style={labelStyle}>Street or barangay <span style={{ fontWeight: 400, color: 'var(--color-text-muted)' }}>(optional)</span></span>
        <input value={parts.street} aria-label="Street or barangay" placeholder={streetPlaceholder} maxLength={120}
          className={`${inputClass} w-full`} style={inputStyle}
          onChange={(e) => set({ ...parts, street: e.target.value })} />
      </label>
    </div>
  );
}
