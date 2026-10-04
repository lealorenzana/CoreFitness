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
 * Where someone lives: province, then city or municipality, then the street or
 * barangay in their own words — stored as the one address line the app always
 * has. The list is the PSA's (PSGC, `data/phPlaces.json`, the same file the
 * website's apply form uses), loaded only when a form asks for it.
 */
export default function PlacePicker({ value, onChange }: { value: string; onChange: (address: string) => void }) {
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

  return (
    <div className="grid grid-cols-2 gap-2">
      <select value={parts.province} disabled={!places} aria-label="Province" className={STEP_INPUT} style={STEP_INPUT_STYLE}
        onChange={(e) => set({ ...parts, province: e.target.value, town: '' })}>
        <option value="">{places ? 'Province' : 'Loading places…'}</option>
        {places?.map(([p]) => <option key={p} value={p}>{p}</option>)}
      </select>
      <select value={parts.town} disabled={!parts.province} aria-label="City or municipality" className={STEP_INPUT} style={STEP_INPUT_STYLE}
        onChange={(e) => set({ ...parts, town: e.target.value })}>
        <option value="">{parts.province ? 'City or municipality' : 'Pick the province first'}</option>
        {towns.map((t) => <option key={t} value={t}>{t}</option>)}
      </select>
      <input value={parts.street} aria-label="Street or barangay" placeholder="Street or barangay (optional)" maxLength={120}
        className={`${STEP_INPUT} col-span-2`} style={STEP_INPUT_STYLE}
        onChange={(e) => set({ ...parts, street: e.target.value })} />
    </div>
  );
}
