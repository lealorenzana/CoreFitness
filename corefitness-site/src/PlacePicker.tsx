import { useEffect, useMemo, useState } from 'react';

type Places = [string, string[]][];

/**
 * Where the gym is: province, then city or municipality, then the street or
 * barangay in their own words — composed into the one address line the
 * application has always stored ("Brgy. 9, Mamburao, Occidental Mindoro").
 *
 * The list is the PSA's own (PSGC: 81 provinces and Metro Manila, 1,634 cities
 * and municipalities, src/phPlaces.json), loaded when the form is, so the
 * marketing page never carries it. Typing a town never invents one.
 */
export default function PlacePicker({ onChange }: { onChange: (address: string) => void }) {
  const [places, setPlaces] = useState<Places | null>(null);
  const [province, setProvince] = useState('');
  const [town, setTown] = useState('');
  const [street, setStreet] = useState('');

  useEffect(() => {
    let alive = true;
    void import('./phPlaces.json').then((m) => { if (alive) setPlaces(m.default as Places); });
    return () => { alive = false; };
  }, []);

  const towns = useMemo(() => places?.find(([p]) => p === province)?.[1] ?? [], [places, province]);

  useEffect(() => {
    onChange([street.trim(), town, province].filter(Boolean).join(', '));
  }, [street, town, province, onChange]);

  return (
    <div className="place-picker">
      <div className="field">
        <label htmlFor="province">Province</label>
        <select id="province" value={province} disabled={!places}
          onChange={(e) => { setProvince(e.target.value); setTown(''); }}>
          <option value="">{places ? 'Choose a province' : 'Loading places…'}</option>
          {places?.map(([p]) => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>
      <div className="field">
        <label htmlFor="town">City or municipality</label>
        <select id="town" value={town} disabled={!province} onChange={(e) => setTown(e.target.value)}>
          <option value="">{province ? 'Choose one' : 'Pick the province first'}</option>
          {towns.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>
      <div className="field place-street">
        <label htmlFor="street">Street or barangay <span className="opt">(optional)</span></label>
        <input id="street" maxLength={100} placeholder="Brgy. Payompon, Capitol Road" value={street}
          disabled={!town} onChange={(e) => setStreet(e.target.value)} />
      </div>
    </div>
  );
}
