import { useEffect, useMemo, useState } from 'react';
import { Field, Select, TextInput } from './Field';

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
 * Where someone lives — the same picker as the admin's and the website's apply
 * form (owner, 2026-11-07: "the filling up of the address should be like this
 * across the system"): province, then city or municipality from the PSA's list
 * (`data/phPlaces.json`, loaded only when a form asks for it), then the street
 * or barangay in their own words. Stored as the one address line the app always has.
 */
export default function PlacePicker({ value, onChange }: { value: string; onChange: (address: string) => void }) {
  const [places, setPlaces] = useState<Places | null>(null);
  const [parts, setParts] = useState(() => split(value, null));

  useEffect(() => {
    let alive = true;
    void import('../../data/phPlaces.json').then((m) => {
      if (!alive) return;
      const list = m.default as unknown as Places;
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
    <div className="grid grid-cols-2 gap-x-3 gap-y-3 rounded-2xl p-3.5" data-place-picker
      style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}>
      <Field label="Province">
        <Select value={parts.province} disabled={!places} aria-label="Province"
          onChange={(e) => set({ ...parts, province: e.target.value, town: '' })}>
          <option value="">{places ? 'Choose a province' : 'Loading places…'}</option>
          {places?.map(([p]) => <option key={p} value={p}>{p}</option>)}
        </Select>
      </Field>
      <Field label="City or municipality">
        <Select value={parts.town} disabled={!parts.province} aria-label="City or municipality"
          onChange={(e) => set({ ...parts, town: e.target.value })}>
          <option value="">{parts.province ? 'Choose one' : 'Pick the province first'}</option>
          {towns.map((t) => <option key={t} value={t}>{t}</option>)}
        </Select>
      </Field>
      <Field label="Street or barangay (optional)" className="col-span-2">
        <TextInput value={parts.street} aria-label="Street or barangay" placeholder="Brgy. Payompon, Capitol Road" maxLength={120}
          autoComplete="address-line1" onChange={(e) => set({ ...parts, street: e.target.value })} />
      </Field>
    </div>
  );
}
