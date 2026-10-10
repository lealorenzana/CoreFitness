import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { SkeletonList } from '../components/ui/Skeleton';
import { toast } from '../components/ui/Toast';
import { Field, TextInput } from '../components/ui/Field';
import GlassSheet from '../components/ui/GlassSheet';
import { Page, PageTitle } from '../components/ui/page';
import { LineRow, NocButton, Panel, SectionHead, StatusPill } from '../components/ui/noc';
import { errorMessage } from '../utils/errorMessage';
import {
  CATEGORY_WORDS, listEquipment, myOpenReports, reportEquipment, STATUS_WORDS, type EquipmentItem,
} from '../lib/api/equipment';

/**
 * The gym's equipment (0184): what there is, how many, where in the gym, and
 * what is under repair. Tap one for the exercises that use it and to report a
 * problem — once per item until the desk fixes it. Shared by members and
 * coaches (/member/equipment, /trainer/equipment).
 */
export default function Equipment() {
  const trainer = useLocation().pathname.startsWith('/trainer');
  const [items, setItems] = useState<EquipmentItem[] | null | undefined>(undefined);
  const [reported, setReported] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<EquipmentItem | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      const [list, mine] = await Promise.all([listEquipment(), myOpenReports()]);
      setItems(list);
      setReported(mine);
    })();
  }, []);

  const send = async () => {
    if (!open) return;
    setBusy(true);
    try {
      await reportEquipment(open.id, note);
      setReported((s) => new Set(s).add(open.id));
      setNote('');
      toast.success('Thanks — the front desk has it.');
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const groups = new Map<string, EquipmentItem[]>();
  for (const i of items ?? []) groups.set(i.category, [...(groups.get(i.category) ?? []), i]);

  return (
    <Page>
      <PageTitle title="Equipment" subtitle="What the gym has, and where" back fallback={trainer ? '/trainer/home' : '/member/home'} />
      {items === undefined ? <SkeletonList count={4} />
        : items === null ? <Panel><p style={{ fontSize: 13.5, color: 'var(--color-secondary)' }}>The equipment list could not be loaded.</p></Panel>
        : items.length === 0 ? <Panel><p style={{ fontSize: 13.5, color: 'var(--color-text-secondary)' }}>Your gym has not listed its equipment yet.</p></Panel>
        : [...groups.entries()].map(([cat, list]) => (
          <div key={cat} data-equipment-group={cat}>
            <SectionHead title={CATEGORY_WORDS[cat] ?? cat} meta={String(list.length)} />
            {list.map((i, n) => (
              <LineRow key={i.id} last={n === list.length - 1}
                gutter={i.photoUrl ? <img src={i.photoUrl} alt="" width={40} height={40} style={{ width: 40, height: 40, borderRadius: 10, objectFit: 'cover' }} /> : undefined}
                gutterWidth={i.photoUrl ? 52 : undefined}
                title={i.quantity > 1 ? `${i.name} ×${i.quantity}` : i.name}
                meta={[i.locationNote, i.exercises.length ? `${i.exercises.length} exercise${i.exercises.length === 1 ? '' : 's'}` : null].filter(Boolean).join(' · ') || undefined}
                action={i.status === 'available' ? undefined : <StatusPill label={STATUS_WORDS[i.status]} tone="action" />}
                dim={i.status !== 'available'}
                onClick={() => setOpen(i)} />
            ))}
          </div>
        ))}

      <GlassSheet open={open !== null} onClose={() => { setOpen(null); setNote(''); }}
        title={open?.name ?? ''} subtitle={open ? [STATUS_WORDS[open.status], open.locationNote, open.quantity > 1 ? `${open.quantity} of them` : null].filter(Boolean).join(' · ') : undefined}
        footer={open && !reported.has(open.id) ? (
          <NocButton className="w-full" disabled={busy || note.trim().length < 3} onClick={() => void send()}>Report a problem</NocButton>
        ) : undefined}>
        {open && (
          <div className="flex flex-col" style={{ gap: 12 }}>
            {open.photoUrl && <img src={open.photoUrl} alt="" style={{ width: '100%', maxHeight: 220, objectFit: 'cover', borderRadius: 16 }} />}
            {open.notes && <p style={{ fontSize: 13.5, color: 'var(--color-text-secondary)' }}>{open.notes}</p>}
            {open.exercises.length > 0 && (
              <div>
                <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-primary-300)' }}>Exercises that use it</p>
                <p style={{ fontSize: 13.5, marginTop: 4, color: 'var(--color-text-primary)' }}>{open.exercises.map((e) => e.name).join(' · ')}</p>
              </div>
            )}
            {reported.has(open.id) ? (
              <p data-reported style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>You reported a problem with this — the desk has it, and you will be told when it is fixed.</p>
            ) : (
              <Field label="Something wrong with it?">
                <TextInput aria-label="What is wrong" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder="The seat pin is stuck, a cable is frayed…" />
              </Field>
            )}
          </div>
        )}
      </GlassSheet>
    </Page>
  );
}
