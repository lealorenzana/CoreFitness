import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { HandWaving, Plus, Receipt } from '@phosphor-icons/react';
import Avatar from '../../components/ui/Avatar';
import { SkeletonList } from '../../components/ui/Skeleton';
import { toast } from '../../components/ui/Toast';
import { Field, Select, TextInput } from '../../components/ui/Field';
import OfferPackageSheet from '../../components/trainer/OfferPackageSheet';
import { Page, PageTitle } from '../../components/ui/page';
import { LineRow, NocButton, Panel, ProgressBar, SectionHead, StatusPill, TextTabs } from '../../components/ui/noc';
import ConnectPayMongo from '../../components/payments/ConnectPayMongo';
import { errorMessage } from '../../utils/errorMessage';
import {
  addPaymentMethod, coachingSweep, confirmCoachingPayment, endCoaching, getCoachingSettings, monthsLabel,
  myCoachings, peso, removePaymentMethod, respondCoaching, trainerPaymentMethods,
  type Coaching, type CoachingSettings, type TrainerPaymentMethod,
} from '../../lib/api/coaching';
import { getCurrentTrainerId } from '../../services/trainerService';

const fmt = (ymd: string | null) => (ymd ? new Date(`${ymd}T00:00:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }) : '');

type Tab = 'needs' | 'training' | 'ended' | 'payments';

/**
 * Packages (simplify, 2026-10-28; was Coaching): a coach's monthly packages (0181) — who asked, who paid them (tap Received), who
 * trains with them and until when, who they stand in for — and, at a gym where
 * members pay the coach directly, how members pay them.
 *
 * Wave 2 of the lively coach app (2026-10-27, mock-up approved): tabs instead of
 * one long page — **Needs you** (asks and payments to check, each a step that
 * says what to do), **Training** (and waiting, and standing in), **Ended**, and
 * **Payments** where members pay the coach directly. Offering to coach someone
 * moved behind *Start coaching someone* (OfferPackageSheet, also on the rail's +).
 * A package's room is its trainee's place (`/trainer/pt/:memberId`).
 */
export default function TrainerPackages() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [settings, setSettings] = useState<CoachingSettings | null | undefined>(undefined);
  const [list, setList] = useState<Coaching[] | null>(null);
  const [me, setMe] = useState<string | null>(null);
  const [methods, setMethods] = useState<TrainerPaymentMethod[]>([]);
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  // ?offer=<member> (a trainee's place: "Offer them a package") opens the sheet for them.
  const [offering, setOffering] = useState(() => params.get('offer') !== null);
  const [method, setMethod] = useState({ kind: 'gcash' as TrainerPaymentMethod['kind'], label: 'GCash', accountName: '', accountNumber: '' });
  // Read once when the page opens (a clock read during render is not pure).
  const [today] = useState(() => Date.now());

  const load = useCallback(async () => {
    await coachingSweep();
    const [s, l, id] = await Promise.all([getCoachingSettings(), myCoachings(), getCurrentTrainerId()]);
    setSettings(s);
    setList(l);
    setMe(id);
    if (id) setMethods(await trainerPaymentMethods(id));
  }, []);
  useEffect(() => { void (async () => { await load(); })(); }, [load]);

  const run = async (fn: () => Promise<unknown>, done: string) => {
    setBusy(true);
    try { await fn(); toast.success(done); await load(); return true; } catch (e) { toast.error(errorMessage(e)); return false; } finally { setBusy(false); }
  };

  if (settings === undefined) return <Page><PageTitle back fallback="/trainer/home" title="Packages" /><SkeletonList count={4} /></Page>;
  if (settings === null) {
    return <Page><PageTitle back fallback="/trainer/home" title="Packages" /><Panel><p style={{ fontSize: 13.5, color: 'var(--color-text-secondary)' }}>Your gym has not set up packages yet. You can still take single sessions.</p></Panel></Page>;
  }

  const mine = (list ?? []).filter((c) => c.iAm === 'coach');
  const requests = mine.filter((c) => c.status === 'requested');
  const toConfirm = mine.filter((c) => c.status === 'payment_sent' && c.feeMode === 'trainer_direct');
  const unpaid = mine.filter((c) => c.status === 'awaiting_payment' || (c.status === 'payment_sent' && c.feeMode !== 'trainer_direct'));
  const invited = mine.filter((c) => c.status === 'invited');
  const active = mine.filter((c) => c.status === 'active');
  const ended = mine.filter((c) => c.status === 'ended');
  const standing = (list ?? []).filter((c) => c.iAm === 'standin' && c.status === 'active');
  const direct = settings.feeMode === 'trainer_direct';
  const canOffer = settings.modes.includes('coach_invites');
  const person = (c: Coaching) => <Avatar name={c.memberName} photoUrl={c.memberPhoto} size={36} />;
  const needs = requests.length + toConfirm.length;
  const tabs: { id: Tab; label: string }[] = [
    { id: 'needs', label: needs ? `Needs you · ${needs}` : 'Needs you' },
    { id: 'training', label: active.length ? `Training · ${active.length}` : 'Training' },
    { id: 'ended', label: 'Ended' },
    ...(direct && me ? [{ id: 'payments' as Tab, label: 'Payments' }] : []),
  ];
  const asked = params.get('tab') as Tab | null;
  const tab: Tab = tabs.some((t) => t.id === asked) ? (asked as Tab) : needs === 0 && active.length > 0 ? 'training' : 'needs';
  /** How far into the term, from its own dates — nothing without both. */
  const termFraction = (c: Coaching) => {
    if (!c.startsOn || !c.endsOn) return null;
    const a = new Date(`${c.startsOn}T00:00:00`).getTime(), b = new Date(`${c.endsOn}T00:00:00`).getTime();
    return b > a ? Math.min(1, Math.max(0, (today - a) / (b - a))) : null;
  };

  return (
    <Page>
      <PageTitle back fallback="/trainer/home" title="Packages" subtitle="Monthly coaching: asked, paid, training" />
      {list === null && <Panel><p style={{ fontSize: 13.5, color: 'var(--color-secondary)' }}>Packages could not be loaded.</p></Panel>}
      <TextTabs<Tab> label="Packages" active={tab} onChange={(t) => setParams({ tab: t }, { replace: true })} tabs={tabs} />

      {tab === 'needs' && (
        <div data-requests>
          {needs === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Nothing needs you. Requests and payments to check show here.</p>
          ) : (
            <div className="td-card">
              {requests.map((c, i) => (
                <div key={c.id} className="flex items-start" style={{ gap: 12, padding: '12px 0', borderTop: i === 0 ? 0 : '1px solid var(--color-separator)' }}>
                  <span className="grid place-items-center flex-none" style={{ width: 34, height: 34, borderRadius: 11, background: 'var(--color-secondary-light)', color: 'var(--color-secondary)' }}>
                    <HandWaving size={18} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block" style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--color-text-primary)' }}>
                      {c.memberName.split(' ')[0]} asks for a {monthsLabel(c.months)} package
                    </span>
                    <span className="block" style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                      {direct ? 'Set your price, then accept' : c.price != null ? `${peso(c.price)} to the gym` : 'Accept or decline'}
                    </span>
                    {direct && (
                      <label className="flex items-center" style={{ gap: 8, height: 40, marginTop: 8, padding: '0 12px', borderRadius: 12, border: '1px solid var(--color-hairline)', background: 'var(--color-bg)' }}>
                        <span style={{ color: 'var(--color-text-muted)' }}>₱</span>
                        <input inputMode="decimal" aria-label={`Price for ${c.memberName}`} value={prices[c.id] ?? ''} placeholder="0"
                          onChange={(e) => setPrices((p) => ({ ...p, [c.id]: e.target.value.replace(/[^0-9.]/g, '') }))}
                          className="flex-1 min-w-0 bg-transparent outline-none" style={{ fontSize: 14, color: 'var(--color-text-primary)' }} />
                        <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>for {monthsLabel(c.months)}</span>
                      </label>
                    )}
                    <span className="grid grid-cols-2" style={{ gap: 8, marginTop: 8 }}>
                      <NocButton variant="ghost" disabled={busy}
                        onClick={() => void run(() => respondCoaching(c.id, false), 'Declined — they have been told')}>Decline</NocButton>
                      <NocButton disabled={busy || (direct && (prices[c.id] ?? '') === '')}
                        onClick={() => void run(() => respondCoaching(c.id, true, direct ? Number(prices[c.id]) : null), 'Accepted')}>Accept</NocButton>
                    </span>
                  </span>
                </div>
              ))}
              {toConfirm.map((c, i) => (
                <div key={c.id} className="flex items-start" data-to-confirm style={{ gap: 12, padding: '12px 0', borderTop: i === 0 && requests.length === 0 ? 0 : '1px solid var(--color-separator)' }}>
                  <span className="grid place-items-center flex-none" style={{ width: 34, height: 34, borderRadius: 11, background: 'var(--color-secondary-light)', color: 'var(--color-secondary)' }}>
                    <Receipt size={18} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block" style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--color-text-primary)' }}>
                      {c.memberName.split(' ')[0]} paid {c.price != null ? peso(c.price) : 'you'}{c.payReference ? ` · ref ${c.payReference}` : ''}
                    </span>
                    <span className="block" style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Check it reached you, then the package starts</span>
                    <span className="grid grid-cols-2" style={{ gap: 8, marginTop: 8 }}>
                      <NocButton variant="ghost" disabled={busy} onClick={() => void run(() => confirmCoachingPayment(c.id, false), 'They have been asked to check it')}>Not found</NocButton>
                      <NocButton disabled={busy} onClick={() => void run(() => confirmCoachingPayment(c.id, true), 'Received — the package has started')}>It arrived</NocButton>
                    </span>
                  </span>
                </div>
              ))}
            </div>
          )}
          {canOffer && (
            <div style={{ marginTop: 12 }}>
              <NocButton variant="ghost" className="w-full" icon={<Plus size={16} />} onClick={() => setOffering(true)}>Start coaching someone</NocButton>
            </div>
          )}
        </div>
      )}

      {tab === 'training' && (
        <>
          <div data-trainees>
            {active.length === 0 ? <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Nobody is on a package with you yet. Start one with + Start coaching someone.</p> : active.map((c, i) => {
              const f = termFraction(c);
              return (
                <div key={c.id}>
                  <LineRow gutter={person(c)} gutterWidth={48} title={c.memberName} last={i === active.length - 1 && f == null}
                    meta={`${monthsLabel(c.months)} · until ${fmt(c.endsOn)}${c.standin ? ` · ${c.standin.name} stands in to ${fmt(c.standin.to)}` : ''}`}
                    action="Open" onClick={() => navigate(`/trainer/pt/${c.memberId}`)} />
                  {f != null && <ProgressBar fraction={f} style={{ margin: '-4px 0 10px 48px' }} />}
                </div>
              );
            })}
          </div>
          {(unpaid.length > 0 || invited.length > 0) && (
            <div>
              <SectionHead title="Waiting" />
              {[...invited, ...unpaid].map((c, i, all) => (
                <LineRow key={c.id} gutter={person(c)} gutterWidth={48} title={c.memberName} last={i === all.length - 1}
                  meta={c.status === 'invited' ? 'You offered — waiting for them' : c.status === 'payment_sent' ? 'Paid the gym — the desk confirms' : 'Waiting for their payment'}
                  action={c.status === 'invited' ? 'Cancel' : undefined}
                  onClick={c.status === 'invited' ? () => void run(() => endCoaching(c.id), 'Offer withdrawn') : undefined} />
              ))}
            </div>
          )}
          {standing.length > 0 && (
            <div data-standing>
              <SectionHead title="Standing in" />
              {standing.map((c, i) => (
                <LineRow key={c.id} gutter={person(c)} gutterWidth={48} title={c.memberName} last={i === standing.length - 1}
                  meta={`For ${c.trainerName}, ${fmt(c.standin?.from ?? null)} – ${fmt(c.standin?.to ?? null)}`} />
              ))}
            </div>
          )}
        </>
      )}

      {tab === 'ended' && (
        <div data-ended>
          {ended.length === 0 ? <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>No packages have ended yet.</p> : ended.map((c, i) => (
            <LineRow key={c.id} gutter={person(c)} gutterWidth={48} title={c.memberName} last={i === ended.length - 1}
              meta={`${monthsLabel(c.months)}${c.endsOn ? ` · ended ${fmt(c.endsOn)}` : ''}`}
              action="Open" onClick={() => navigate(`/trainer/pt/${c.memberId}`)} />
          ))}
        </div>
      )}

      {/* 0192: paid directly, a coach may take payments online into their own PayMongo account. */}
      {tab === 'payments' && direct && me && (
        <>
          <ConnectPayMongo />
          <div data-pay-methods>
            <SectionHead title="How members pay you" />
            <p style={{ fontSize: 12.5, marginBottom: 6, color: 'var(--color-text-muted)' }}>
              At this gym members pay you directly. The gym never sees this money — only that they have a coach.
            </p>
            {methods.map((m, i) => (
              <LineRow key={m.id} title={m.label} meta={[m.accountName, m.accountNumber].filter(Boolean).join(' · ') || undefined}
                action={<StatusPill label="Remove" tone="action" />} last={i === methods.length - 1}
                onClick={() => void run(() => removePaymentMethod(m.id), 'Removed')} />
            ))}
            <div className="grid grid-cols-2" style={{ gap: 8, marginTop: 8 }}>
              <Field label="Kind">
                <Select value={method.kind} onChange={(e) => { const k = e.target.value as TrainerPaymentMethod['kind']; setMethod({ ...method, kind: k, label: k === 'gcash' ? 'GCash' : k === 'maya' ? 'Maya' : k === 'bank' ? 'Bank transfer' : '' }); }}>
                  <option value="gcash">GCash</option><option value="maya">Maya</option><option value="bank">Bank</option><option value="other">Other</option>
                </Select>
              </Field>
              <Field label="Label"><TextInput value={method.label} maxLength={60} onChange={(e) => setMethod({ ...method, label: e.target.value })} /></Field>
              <Field label="Account name"><TextInput value={method.accountName} maxLength={80} onChange={(e) => setMethod({ ...method, accountName: e.target.value })} /></Field>
              <Field label="Number"><TextInput value={method.accountNumber} maxLength={60} onChange={(e) => setMethod({ ...method, accountNumber: e.target.value })} /></Field>
            </div>
            <NocButton className="w-full" style={{ marginTop: 10 }} disabled={busy || !method.label.trim() || !method.accountNumber.trim()}
              onClick={() => void run(async () => {
                await addPaymentMethod({ kind: method.kind, label: method.label.trim(), accountName: method.accountName.trim() || null, accountNumber: method.accountNumber.trim(), qrUrl: null });
                setMethod({ kind: 'gcash', label: 'GCash', accountName: '', accountNumber: '' });
              }, 'Added')}>Add</NocButton>
          </div>
        </>
      )}

      <OfferPackageSheet open={offering && canOffer} onClose={() => setOffering(false)} settings={settings} member={params.get('offer')} onSent={() => void load()} />
    </Page>
  );
}
