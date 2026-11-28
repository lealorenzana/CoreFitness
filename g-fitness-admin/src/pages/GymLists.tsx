import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Archive, ArchiveRestore, Check, MapPin, Pencil, Plus, Tag, X } from 'lucide-react';
import { RdHeader, RdCard, PageTabs, RdButton } from '../components/ui/rd';
import { addChoice, CHOICE_WORDS, listChoices, renameChoice, retireChoice, type ChoiceKind, type GymChoice } from '../lib/api/gymChoices';
import { showToast } from '../utils/toast';
import SkelRows from '../components/ui/SkelRows';

const KINDS: ChoiceKind[] = ['area', 'shop', 'reward', 'resource', 'badge'];

/**
 * Gym → Areas and lists (owner, 2026-11-28; 0284). The gym's own areas (Studio, Gym floor) and its category lists,
 * which every form picks from instead of typing. Renaming changes every class, item or badge that used the old
 * name; retiring hides it from new picks and leaves old rows alone. The desk adds from a form's dropdown; this page
 * is the owner's.
 */
export default function GymLists() {
  const [kind, setKind] = useState<ChoiceKind>('area');
  const [list, setList] = useState<GymChoice[] | null | undefined>(null);
  const [draft, setDraft] = useState('');
  const [edit, setEdit] = useState<{ id: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => setList(await listChoices()), []);
  useEffect(() => { void (async () => { await load(); })(); }, [load]);

  const run = async (fn: () => Promise<string>) => {
    setBusy(true);
    try { showToast(await fn(), 'success'); await load(); return true; }
    catch (e) { showToast(e instanceof Error ? e.message : 'That did not work', 'error'); return false; }
    finally { setBusy(false); }
  };

  if (list === null) return <SkelRows label="Loading your lists…" />;
  if (list === undefined) {
    return (
      <RdCard className="p-5 flex items-start gap-3">
        <AlertTriangle size={18} style={{ color: 'var(--a-a300, #FBBF24)' }} />
        <p className="text-[14px]" style={{ color: 'var(--color-text-primary)' }}>Areas and lists are not switched on yet: migration 0284 is not live on this database.</p>
      </RdCard>
    );
  }

  const words = CHOICE_WORDS[kind];
  const rows = list.filter((c) => c.kind === kind);
  const active = rows.filter((c) => !c.retired);
  const retired = rows.filter((c) => c.retired);
  const add = () => { const n = draft.trim(); if (n) void run(async () => { await addChoice(kind, n); setDraft(''); return `${n} added`; }); };
  const rename = () => edit && void run(async () => {
    const n = await renameChoice(edit.id, edit.name.trim());
    setEdit(null);
    return n ? `Renamed, and ${n} ${n === 1 ? 'place uses' : 'places use'} the new name` : 'Renamed';
  });

  const row = (c: GymChoice) => (
    <li key={c.id} className="gl-row" data-choice={c.name}>
      {edit?.id === c.id ? (
        <>
          <input autoFocus value={edit.name} maxLength={60} aria-label={`New name for ${c.name}`} onChange={(e) => setEdit({ ...edit, name: e.target.value })}
            onKeyDown={(e) => { if (e.key === 'Enter') rename(); if (e.key === 'Escape') setEdit(null); }} className="gl-in" disabled={busy} />
          <RdButton size="sm" variant="primary" icon={Check} onClick={rename} disabled={busy || !edit.name.trim()}>Save</RdButton>
          <RdButton size="sm" variant="ghost" icon={X} onClick={() => setEdit(null)}>Cancel</RdButton>
        </>
      ) : (
        <>
          <span className="gl-name">{c.name}</span>
          {!c.retired && <RdButton size="sm" variant="ghost" icon={Pencil} onClick={() => setEdit({ id: c.id, name: c.name })}>Rename</RdButton>}
          <RdButton size="sm" variant="ghost" icon={c.retired ? ArchiveRestore : Archive} disabled={busy}
            onClick={() => void run(async () => { await retireChoice(c.id, !c.retired); return c.retired ? `${c.name} is back on the list` : `${c.name} retired; what used it keeps the name`; })}>
            {c.retired ? 'Bring back' : 'Retire'}</RdButton>
        </>
      )}
    </li>
  );

  return (
    <div className="rd-fit" data-gym-lists>
      <RdHeader title="Areas and lists"
        subtitle={<>What your forms pick from. {words.many} are used by {words.usedBy}.</>}
        actions={<PageTabs<ChoiceKind> label="Lists" value={kind} onChange={(k) => { setKind(k); setEdit(null); setDraft(''); }}
          tabs={KINDS.map((k) => ({ key: k, label: CHOICE_WORDS[k].many, icon: k === 'area' ? MapPin : Tag, count: list.filter((c) => c.kind === k && !c.retired).length }))} />} />
      <div className="gl-grid">
        <RdCard className="gl-card">
          <form className="gl-add" onSubmit={(e) => { e.preventDefault(); add(); }}>
            <input value={draft} maxLength={60} onChange={(e) => setDraft(e.target.value)} placeholder={kind === 'area' ? 'e.g. Studio, Gym floor, Mat area' : `A new ${words.one}`}
              aria-label={`New ${words.one}`} className="gl-in" disabled={busy} />
            <RdButton type="submit" variant="primary" icon={Plus} disabled={busy || !draft.trim()}>Add</RdButton>
          </form>
          {active.length === 0 ? <p className="gl-empty">No {words.many.toLowerCase()} yet. Add one here, or from the dropdown on any form that uses it.</p>
            : <ul className="gl-list" data-choice-list>{active.map(row)}</ul>}
          {retired.length > 0 && (
            <>
              <h3 className="gl-sub">Retired · not offered on new forms</h3>
              <ul className="gl-list">{retired.map(row)}</ul>
            </>
          )}
        </RdCard>
        <RdCard className="gl-card gl-help">
          <h3>How these lists work</h3>
          <p><b>Rename</b> changes the name everywhere it is used, so old {words.usedBy} follow.</p>
          <p><b>Retire</b> hides it from new picks. What already uses it keeps the name.</p>
          <p>The front desk can add a new one from a form's dropdown. Only you rename or retire.</p>
        </RdCard>
      </div>
    </div>
  );
}
