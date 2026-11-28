import { useEffect, useState } from 'react';
import { Check, X } from 'lucide-react';
import { RdSelect } from './ui/rd';
import { addChoice, CHOICE_WORDS, listChoices, type ChoiceKind, type GymChoice } from '../lib/api/gymChoices';
import { showToast } from '../utils/toast';

const ADD = '__add__';

/**
 * Pick from the gym's own list (0284): its areas, or one of its category lists. The last line adds a new entry in
 * place, so nobody leaves the form. A value already saved that is no longer on the list (retired, or typed before
 * the list existed) still shows, so opening an old class never blanks it. Before 0284 is live it is a text box.
 */
export default function ChoicePicker({ kind, value, onChange, label, none = 'None', className = 'w-full' }: {
  kind: ChoiceKind; value: string; onChange: (v: string) => void; label: string;
  /** The empty choice's words, e.g. "Not set" or "Other". */ none?: string; className?: string;
}) {
  const [list, setList] = useState<GymChoice[] | undefined | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const words = CHOICE_WORDS[kind];

  useEffect(() => {
    let live = true;
    void listChoices(kind).then((l) => { if (live) setList(l); });
    return () => { live = false; };
  }, [kind]);

  if (list === undefined) {
    return <input className="v2-select h-9 w-full px-3 rounded-lg text-[13px] outline-none" value={value} maxLength={60} aria-label={label}
      onChange={(e) => onChange(e.target.value)} style={{ background: 'var(--v2-field, rgba(255,255,255,0.03))', border: '1px solid rgb(var(--hair-rgb, 255 255 255) / 0.12)' }} />;
  }

  const save = async () => {
    const name = (adding ?? '').trim();
    if (!name) return;
    setBusy(true);
    try {
      const id = await addChoice(kind, name);
      setList((l) => (l?.some((c) => c.id === id) ? l.map((c) => (c.id === id ? { ...c, retired: false } : c)) : [...(l ?? []), { id, kind, name, retired: false }]));
      onChange(list?.find((c) => c.id === id)?.name ?? name);
      setAdding(null);
    } catch (e) {
      showToast((e as Error).message, 'error');
    } finally { setBusy(false); }
  };

  if (adding !== null) {
    return (
      <div className={`flex items-center gap-1.5 ${className}`} data-choice-add={kind}>
        <input autoFocus value={adding} maxLength={60} placeholder={`New ${words.one}`} aria-label={`New ${words.one}`} disabled={busy}
          onChange={(e) => setAdding(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void save(); } if (e.key === 'Escape') { e.stopPropagation(); setAdding(null); } }}
          className="h-9 flex-1 min-w-0 px-3 rounded-lg text-[13px] outline-none"
          style={{ background: 'var(--v2-field, rgba(255,255,255,0.03))', border: '1px solid var(--color-primary)', color: 'var(--color-text-primary)' }} />
        <button type="button" onClick={() => void save()} disabled={busy || !adding.trim()} aria-label={`Add ${words.one}`}
          className="h-9 px-3 rounded-lg text-[13px] font-semibold inline-flex items-center gap-1 disabled:opacity-50"
          style={{ background: 'var(--v2-act, #F59E0B)', color: 'var(--v2-on-act, #1a1206)' }}><Check size={14} />Add</button>
        <button type="button" onClick={() => setAdding(null)} aria-label="Cancel" className="h-9 w-9 rounded-lg grid place-items-center"
          style={{ border: '1px solid rgb(var(--hair-rgb, 255 255 255) / 0.12)', color: 'var(--color-text-secondary)' }}><X size={14} /></button>
      </div>
    );
  }

  const active = (list ?? []).filter((c) => !c.retired);
  const kept = value && !active.some((c) => c.name.toLowerCase() === value.trim().toLowerCase()) ? value : null;
  return (
    <RdSelect label={label} className={className} value={value}
      onChange={(v) => (v === ADD ? setAdding('') : onChange(v))}>
      <option value="">{list === null ? 'Loading the list' : none}</option>
      {active.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
      {kept && <option value={kept}>{kept} (not on the list)</option>}
      <option value={ADD}>+ Add a new {words.one}</option>
    </RdSelect>
  );
}
