import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Banknote, CalendarClock, Dumbbell, PauseCircle, RefreshCw, UserPlus } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { listPendingRegistrations } from '../../lib/api/members';
import { listOpenRenewalRequests, type OpenRenewalRequest } from '../../lib/api/renewalRequests';
import { listOpenMembershipRequests, type OpenMembershipRequest } from '../../lib/api/membershipRequests';
import { confirmCoachingPayment, type CoachingRow } from '../../lib/api/coaching';
import { approveRegistration, approveRenewalRequest, decideSession, deskMayAnswer, loadToDecide, type ToDecide } from '../../services/deskActions';
import { useBranding } from '../../hooks/useBranding';
import { showToast } from '../../utils/toast';
import type { PendingRegistrationRow } from '../../types/db';
import SkelRows from '../ui/SkelRows';

/**
 * Notifications with nothing open (mock-up B, owner 2026-11-27, design/admin-v2/inbox-b.html): a greeting, a
 * three-figure summary and what needs you, grouped, each item with its own actions. Every action is the one its
 * page runs (services/deskActions): nothing here decides a rule of its own. What needs a reason or a form
 * (declining a sign-up, freezing a member) opens its page instead of guessing.
 */
interface Data {
  signups: PendingRegistrationRow[] | null;
  renewals: OpenRenewalRequest[] | null;
  asks: OpenMembershipRequest[] | null;
  pt: ToDecide | null;
  names: Record<string, string>;
}
interface Act { label: string; run?: () => Promise<unknown>; href?: string; to?: string }
interface Item { key: string; icon: LucideIcon; title: string; line: string; acts: Act[] }

const peso = (n: number) => `₱${n.toLocaleString('en-PH', { maximumFractionDigits: 2 })}`;
const whenLabel = (iso: string | null) => (iso
  ? new Date(iso).toLocaleString('en-PH', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
  : 'time to be set');
const greeting = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'; };

export default function NeedsYou({ inboxLine, onChanged }: { inboxLine: string; onChanged: () => void }) {
  const navigate = useNavigate();
  const branding = useBranding();
  const [data, setData] = useState<Data | null>(null);
  const [first, setFirst] = useState('');
  const [busy, setBusy] = useState('');

  const load = useCallback(async () => {
    const [signups, renewals, asks, pt] = await Promise.all([
      listPendingRegistrations().catch(() => null), listOpenRenewalRequests().catch(() => null),
      listOpenMembershipRequests().catch(() => null), loadToDecide().catch(() => null),
    ]);
    // Package rows carry ids only: their names, in one read.
    const ids = [...new Set([...(pt?.payments ?? []), ...(pt?.asked ?? [])].flatMap((r) => [r.member_id, r.trainer_id]))];
    const names: Record<string, string> = {};
    if (ids.length) {
      const { data: ps } = await supabase.from('profiles').select('id, first_name, last_name').in('id', ids);
      for (const p of (ps ?? []) as { id: string; first_name: string | null; last_name: string | null }[]) names[p.id] = `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim();
    }
    setData({ signups, renewals, asks, pt, names });
  }, []);
  useEffect(() => {
    void (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (u.user) {
        const { data: p } = await supabase.from('profiles').select('first_name').eq('id', u.user.id).maybeSingle();
        setFirst((p as { first_name: string | null } | null)?.first_name ?? '');
      }
      await load();
    })();
  }, [load]);

  const act = async (key: string, a: Act) => {
    if (a.to) { navigate(a.to); return; }
    if (!a.run || busy) return;
    setBusy(key);
    try { await a.run(); await load(); onChanged(); } catch (e) { showToast(e instanceof Error ? e.message : 'That could not be saved', 'error'); }
    finally { setBusy(''); }
  };
  const told = (done: string) => (r: { notified: boolean }) => showToast(r.notified ? done : `${done}, but the member could not be notified`, r.notified ? 'success' : 'error');

  if (!data) return <div className="nb-home"><SkelRows label="Loading what needs you" /></div>;

  const name = (id: string) => data.names[id] || 'Someone';
  const renewals = data.renewals ?? [];
  const online = renewals.filter((r) => r.paid);
  const cash = renewals.filter((r) => !r.paid);
  const sessions = data.pt?.sessions ?? [];
  const packPay = data.pt?.payments ?? [];
  const packAsk = (data.pt?.asked ?? []).filter((r) => deskMayAnswer(data.pt!.approval, r));

  const groups: [string, Item[]][] = [
    ['To approve', [
      ...(data.signups ?? []).map((g): Item => ({
        key: `reg:${g.id}`, icon: UserPlus, title: `${g.first_name} ${g.last_name} registered`,
        line: `Signed up on the app, ${new Date(g.created_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}. Approving starts them on the free tier.`,
        acts: [
          { label: 'Approve', run: () => approveRegistration(g, branding.name).then(told(`${g.first_name} ${g.last_name} approved`)) },
          { label: 'Open sign-ups', to: '/members?pending=1' },
        ],
      })),
      ...online.map((r): Item => ({
        key: `paid:${r.id}`, icon: Banknote, title: `${r.memberName} paid ${peso(r.paid!.amount)} by ${r.paid!.method}`,
        line: `For ${r.planName}, reference ${r.paid!.reference}. Check it on your ${r.paid!.method} account first.`,
        acts: [
          { label: 'Mark paid', run: () => approveRenewalRequest(r).then(told('Payment recorded')) },
          r.paid!.proof ? { label: 'See proof', href: r.paid!.proof } : { label: 'Open', to: '/payments' },
        ],
      })),
    ]],
    ['Renewals', cash.map((r): Item => ({
      key: `ren:${r.id}`, icon: RefreshCw, title: `${r.memberName} wants to renew ${r.planName}`,
      line: `Pays ${peso(r.planPrice)} cash at the desk.${r.note ? ` "${r.note}"` : ''}`,
      acts: [
        { label: `Record ${peso(r.planPrice)} and renew`, run: () => approveRenewalRequest(r).then(told('Payment recorded')) },
        { label: 'Open', to: '/payments' },
      ],
    }))],
    ['Freeze and cancel', (data.asks ?? []).map((r): Item => ({
      key: `ask:${r.id}`, icon: PauseCircle, title: `${r.memberName} asks to ${r.kind === 'freeze' ? `freeze${r.requestedDays ? ` for ${r.requestedDays} days` : ''}` : 'cancel'}`,
      // Granting is freezing or cancelling at the desk (0118), never a button here.
      line: `"${r.reason}" Freezing or cancelling them on Members closes the request.`,
      acts: [{ label: `Open ${r.memberName.split(' ')[0]}`, to: `/members?open=${r.memberId}` }],
    }))],
    ['Personal training', [
      ...sessions.map((r): Item => ({
        key: `pt:${r.id}`, icon: CalendarClock, title: `${r.memberName} asked for a session${r.trainerName ? ` with ${r.trainerName}` : ''}`,
        line: `${whenLabel(r.when)}${r.coachOkName ? `. ${r.coachOkName} accepted; the gym confirms.` : '.'}`,
        acts: [
          { label: 'Confirm', run: () => decideSession(r, 'approved').then(told('Session confirmed')) },
          { label: 'Decline', run: () => decideSession(r, 'rejected').then(told('Session declined')) },
        ],
      })),
      ...packPay.map((r: CoachingRow): Item => ({
        key: `pp:${r.id}`, icon: Dumbbell, title: `${name(r.member_id)} paid for a ${r.months} month package`,
        line: `With ${name(r.trainer_id)}, ${r.price != null ? peso(r.price) : 'no price'}, ${r.pay_reference ? `reference ${r.pay_reference}` : 'to pay at the desk'}.`,
        acts: [
          { label: r.pay_reference ? 'Confirm payment' : 'Paid in cash', run: () => confirmCoachingPayment(r.id, true, r.pay_reference ? 'online' : 'cash').then(() => showToast('Confirmed: the package has started', 'success')) },
          ...(r.pay_reference ? [{ label: 'Not found', run: () => confirmCoachingPayment(r.id, false, null).then(() => showToast('They have been asked to check it', 'success')) }] : []),
        ],
      })),
      ...packAsk.map((r: CoachingRow): Item => ({
        key: `pa:${r.id}`, icon: Dumbbell, title: `${name(r.member_id)} asked ${name(r.trainer_id)} to coach them`,
        line: `${r.months} month${r.months === 1 ? '' : 's'}. Your rule says the desk answers this one.`,
        acts: [{ label: 'Answer', to: '/personal-training' }],
      })),
    ]],
  ];
  const shown = groups.filter(([, items]) => items.length > 0);
  const total = shown.reduce((s, [, items]) => s + items.length, 0);
  const toApprove = (data.signups?.length ?? 0) + online.length;
  const failed = [data.signups, data.renewals, data.asks, data.pt].some((x) => x === null);
  let amberUsed = false;

  return (
    <div className="nb-home" data-needs-you>
      <div className="nb-hd">
        <h2>{greeting()}{first ? `, ${first}` : ''}</h2>
        <p>{total === 0 ? 'Nothing waits on you right now.' : `${total} thing${total === 1 ? '' : 's'} wait on you. Answer them here; the rest of the inbox is for reading.`}</p>
        <p className="nb-inbox" data-overview>{inboxLine}</p>
      </div>
      <div className="nb-sum" data-needs-summary>
        <div><b>{toApprove}</b><span>to approve</span></div>
        <div><b>{peso(cash.reduce((s, r) => s + r.planPrice, 0))}</b><span>asked to renew, cash</span></div>
        <div><b>{sessions.length + packPay.length + packAsk.length}</b><span>personal training</span></div>
      </div>
      {failed && <p className="nb-fail">Part of this could not be loaded. Reload the page to try again; what is shown is real.</p>}
      <div className="nb-need">
        {shown.map(([g, items]) => (
          <section key={g} data-needs-group={g}>
            <h3>{g} <span>{items.length}</span></h3>
            {items.map((it) => (
              <div key={it.key} className="nb-item" data-needs-item={it.key.split(':')[0]}>
                <span className="nb-k"><it.icon size={16} /></span>
                <div className="min-w-0"><b>{it.title}</b><p>{it.line}</p></div>
                <div className="nb-acts">
                  {it.acts.map((a, i) => {
                    // One amber button in the area: the first thing waiting. The rest are plain.
                    const amber = i === 0 && !amberUsed; if (amber) amberUsed = true;
                    const cls = `nb-btn${amber ? ' go' : i === 0 ? ' strong' : ''}`;
                    return a.href
                      ? <a key={a.label} className={cls} href={a.href} target="_blank" rel="noreferrer">{a.label}</a>
                      : <button key={a.label} type="button" className={cls} disabled={busy === it.key} onClick={() => void act(it.key, a)}>{a.label}</button>;
                  })}
                </div>
              </div>
            ))}
          </section>
        ))}
        {total === 0 && !failed && <p className="nb-none">New sign-ups, renewal requests and personal training requests show up here, each with its own buttons.</p>}
      </div>
    </div>
  );
}
