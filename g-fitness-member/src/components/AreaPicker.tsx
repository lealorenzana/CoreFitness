import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Select, TextInput } from './ui/Field';
import { toast } from './ui/Toast';
import { NocButton } from './ui/noc';

const ADD = '__add__';

/**
 * The coach picks a class's area from the gym's list (0284), the same list the owner keeps in admin under
 * Gym → Areas and lists; the last line adds a new one. A value saved before the list existed still shows. Before
 * 0284 is live it is a text box, as it was.
 */
export default function AreaPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [areas, setAreas] = useState<string[] | undefined | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    void supabase.from('gym_choices').select('name').eq('kind', 'area').is('retired_at', null).order('sort_order').order('name')
      .then(({ data, error }) => { if (live) setAreas(error ? undefined : (data ?? []).map((r) => r.name as string)); });
    return () => { live = false; };
  }, []);

  if (areas === undefined) return <TextInput value={value} maxLength={60} placeholder="e.g. Studio A" onChange={(e) => onChange(e.target.value)} />;

  if (adding !== null) {
    const save = async () => {
      const name = adding.trim();
      if (!name) return;
      setBusy(true);
      const { error } = await supabase.rpc('gym_choice_add', { p_kind: 'area', p_name: name });
      setBusy(false);
      if (error) { toast.error(error.message.replace(/^.*?: /, '')); return; }
      setAreas((a) => (a?.some((x) => x.toLowerCase() === name.toLowerCase()) ? a : [...(a ?? []), name]));
      onChange(areas?.find((x) => x.toLowerCase() === name.toLowerCase()) ?? name);
      setAdding(null);
    };
    return (
      <div style={{ display: 'flex', gap: 6 }}>
        <TextInput autoFocus value={adding} maxLength={60} placeholder="New area" aria-label="New area" disabled={busy}
          onChange={(e) => setAdding(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void save(); } }} />
        <NocButton onClick={() => void save()} disabled={busy || !adding.trim()}>Add</NocButton>
      </div>
    );
  }

  const kept = value && !(areas ?? []).some((a) => a.toLowerCase() === value.trim().toLowerCase()) ? value : null;
  return (
    <Select value={value} aria-label="Area" onChange={(e) => (e.target.value === ADD ? setAdding('') : onChange(e.target.value))}>
      <option value="">{areas === null ? 'Loading' : 'Not set'}</option>
      {(areas ?? []).map((a) => <option key={a} value={a}>{a}</option>)}
      {kept && <option value={kept}>{kept}</option>}
      <option value={ADD}>+ Add a new area</option>
    </Select>
  );
}
