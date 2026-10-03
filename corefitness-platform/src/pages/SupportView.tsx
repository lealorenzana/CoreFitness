import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, Eye, Lock, MailCheck, RefreshCw } from 'lucide-react';
import { explain, supportSnapshot, type SupportSnapshot } from '../lib/platform';
import GymMark from '../components/GymMark';

const stamp = (iso: string | null) => (iso ? new Date(iso).toLocaleString('en-PH', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—');
const left = (iso: string) => {
  const m = Math.max(0, Math.round((new Date(iso).getTime() - Date.now()) / 60000));
  return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`;
};
type Tab = 'overview' | 'invitations' | 'members' | 'staff' | 'activity' | 'errors';

/**
 * Looking at a gym that asked for help (0149). Read-only by construction: the
 * screen has no buttons that change anything, and the function behind it is a
 * read that refuses unless the gym's own grant is live. Every visit is in the
 * gym's activity log, which its owner reads.
 *
 * Never here: chat, progress photos, health answers, workouts, the assistant,
 * or an invitation's link — those are the gym's members', not ours to see.
 */
export default function SupportView() {
  const { gymId = '' } = useParams();
  const [snap, setSnap] = useState<SupportSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('overview');
  const [q, setQ] = useState('');

  const load = useCallback(async () => {
    try { setSnap(await supportSnapshot(gymId)); setError(null); }
    catch (e) { setSnap(null); setError(explain(e, '0149')); }
  }, [gymId]);
  useEffect(() => { void (async () => { await load(); })(); }, [load]);

  if (error) {
    return (
      <section className="card">
        <h2 className="section-title"><Lock size={14} /> Cannot look at this gym</h2>
        <p className="meta">{error}</p>
        <Link className="btn ghost" to="/support" style={{ marginTop: 10 }}><ArrowLeft size={14} /> Back to Support</Link>
      </section>
    );
  }
  if (!snap) return <p className="empty">Opening the gym, read-only…</p>;

  const s = snap;
  const match = (...xs: (string | null | undefined)[]) => !q.trim() || xs.some((x) => x?.toLowerCase().includes(q.trim().toLowerCase()));
  const count = (k: string) => s.counts?.[k] ?? 0;
  const waitingInv = s.invitations.filter((i) => i.state === 'waiting');

  return (
    <>
      <div className="card notice" style={{ marginBottom: 16 }}>
        <div className="row" style={{ gap: 12, alignItems: 'center' }}>
          <GymMark name={s.gym.name} logoUrl={s.settings?.logo_url ?? null} accent={s.settings?.accent ?? 'violet'} size={40} />
          <span className="grow">
            <span className="name"><Eye size={14} style={{ verticalAlign: -2 }} /> Looking at {s.gym.name} — read-only</span>
            <span className="meta" style={{ margin: 0 }}>
              {s.grant.granted_by ? `${s.grant.granted_by} opened it` : 'The owner opened it'}
              {s.grant.reason ? ` for: “${s.grant.reason}”` : ''} · ends by itself in {left(s.grant.expires_at)} · this visit is in their activity log
            </span>
          </span>
          <button className="btn ghost" onClick={() => void load()}><RefreshCw size={14} /> Refresh</button>
          <Link className="btn ghost" to={`/gyms/${s.gym.id}`}>Gym profile</Link>
        </div>
      </div>

      <div className="sv-tabs" role="tablist">
        {([['overview', 'Overview'], ['invitations', `Invitations (${s.invitations.length})`], ['members', `Members (${s.members.length})`],
          ['staff', `Staff (${s.staff.length})`], ['activity', 'Activity log'], ['errors', `Errors (${s.errors.length})`]] as [Tab, string][]).map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{label}</button>
        ))}
        {(tab === 'members' || tab === 'invitations' || tab === 'activity') && (
          <input style={{ width: 220, marginLeft: 'auto', height: 32 }} placeholder="Filter…" value={q} onChange={(e) => setQ(e.target.value)} />
        )}
      </div>

      {tab === 'overview' && (
        <div className="grid-2">
          <section className="card">
            <h2 className="section-title">The gym</h2>
            <dl className="kv">
              <dt>Status</dt><dd>{s.gym.status}{s.gym.lock_reason ? ` — read-only (${s.gym.lock_reason})` : ''}</dd>
              <dt>Plan</dt><dd>{s.gym.plan}{s.gym.paid_until ? `, paid to ${stamp(s.gym.paid_until).replace(/,.*$/, '')}` : ''}</dd>
              <dt>Link</dt><dd>/join/{s.gym.slug}</dd>
              <dt>Joining</dt><dd>{s.settings?.join_policy === 'open' ? 'Listed: anyone can find it' : s.settings?.join_policy === 'code' ? 'Only with the link or code' : 'At the desk only'}
                {s.settings?.join_code ? ` · code ${s.settings.join_code}` : ''}</dd>
              <dt>Set up</dt><dd>{s.gym.onboarded_at ? stamp(s.gym.onboarded_at) : 'Not finished'}</dd>
              <dt>Contact</dt><dd>{[s.settings?.phone, s.settings?.email].filter(Boolean).join(' · ') || '—'}</dd>
              <dt>Address</dt><dd>{s.settings?.address ?? '—'}</dd>
            </dl>
          </section>
          <section className="card">
            <h2 className="section-title">People</h2>
            <dl className="kv">
              <dt>Members</dt><dd>{count('member:active')} active · {count('member:pending_approval')} waiting for the desk · {count('member:archived')} archived</dd>
              <dt>Coaches</dt><dd>{count('trainer:active')} active</dd>
              <dt>Desk and owners</dt><dd>{count('admin:active')} owners · {count('staff:active')} desk</dd>
              <dt>Invitations</dt><dd>{waitingInv.length} waiting · {s.invitations.filter((i) => i.state === 'accepted').length} accepted · {s.invitations.filter((i) => i.state === 'expired').length} expired</dd>
              <dt>Membership plans</dt><dd>{s.plans.map((p) => p.name).join(', ') || 'None'}</dd>
            </dl>
            {waitingInv.some((i) => i.has_account) && (
              <p className="meta" style={{ color: 'var(--warn)', display: 'flex', gap: 6 }}><AlertTriangle size={14} />
                {waitingInv.filter((i) => i.has_account).length} waiting invitation(s) are for an email that already has an account — that person must sign in (not sign up) and open the link again.</p>
            )}
            {s.settings?.join_policy === 'closed' && (
              <p className="meta" style={{ color: 'var(--warn)' }}>This gym signs members up at the desk only, so members cannot use a join link or code.</p>
            )}
          </section>
        </div>
      )}

      {tab === 'invitations' && (
        <section className="card">
          <table className="dd-table">
            <thead><tr><th>Who</th><th>As</th><th>State</th><th>Sent</th><th>Expires</th><th>Account?</th></tr></thead>
            <tbody>
              {s.invitations.filter((i) => match(i.email, i.name)).map((i) => (
                <tr key={i.email + i.created_at}>
                  <td>{i.name ? `${i.name} · ` : ''}{i.email}</td><td>{i.role}</td>
                  <td style={{ color: i.state === 'waiting' ? 'var(--text)' : undefined }}>{i.state}{i.accepted_at ? ` ${stamp(i.accepted_at)}` : ''}</td>
                  <td>{stamp(i.created_at)}</td><td>{stamp(i.expires_at)}</td>
                  <td>{i.has_account ? 'Has one — must sign in' : 'None yet — must sign up'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {s.invitations.length === 0 && <p className="empty"><MailCheck size={20} className="empty-icon" />This gym has sent no invitations.</p>}
          <p className="meta">Invitation links are never shown here: a link is a key to join this gym, and it is theirs.</p>
        </section>
      )}

      {tab === 'members' && (
        <section className="card">
          <table className="dd-table">
            <thead><tr><th>Name</th><th>Email</th><th>Status</th><th>Joined</th><th>Last signed in</th></tr></thead>
            <tbody>
              {s.members.filter((m) => match(m.name, m.email)).map((m, i) => (
                <tr key={(m.email ?? '') + i}><td>{m.name ?? '—'}</td><td>{m.email ?? '—'}</td><td>{m.status}</td><td>{stamp(m.joined)}</td><td>{stamp(m.last_sign_in_at)}</td></tr>
              ))}
            </tbody>
          </table>
          {s.members.length >= 300 && <p className="meta">The newest 300 are shown.</p>}
        </section>
      )}

      {tab === 'staff' && (
        <section className="card">
          <table className="dd-table">
            <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Last signed in</th></tr></thead>
            <tbody>{s.staff.map((m, i) => <tr key={(m.email ?? '') + i}><td>{m.name ?? '—'}</td><td>{m.email ?? '—'}</td><td>{m.role}</td><td>{m.status}</td><td>{stamp(m.last_sign_in_at)}</td></tr>)}</tbody>
          </table>
        </section>
      )}

      {tab === 'activity' && (
        <section className="card">
          {s.activity.filter((a) => match(a.summary, a.action, a.by)).map((a, i) => (
            <div key={i} className="row" style={{ gap: 12, padding: '8px 0', borderBottom: '1px solid var(--border-soft)', fontSize: 13 }}>
              <span className="grow">{a.summary}<span className="muted" style={{ display: 'block', fontSize: 11.5 }}>{a.action}{a.by ? ` · ${a.by}` : ''}</span></span>
              <span className="muted" style={{ whiteSpace: 'nowrap', fontSize: 12 }}>{stamp(a.at)}</span>
            </div>
          ))}
          {s.activity.length === 0 && <p className="empty">Nothing logged.</p>}
        </section>
      )}

      {tab === 'errors' && (
        <section className="card">
          {s.errors.length === 0 ? <p className="empty">No app errors from this gym in 14 days.</p> : s.errors.map((e, i) => (
            <div key={i} style={{ padding: '8px 0', borderBottom: '1px solid var(--border-soft)', fontSize: 13 }}>
              <b style={{ color: 'var(--text)' }}>{e.message}</b>
              <span className="muted" style={{ display: 'block', fontSize: 11.5 }}>{e.app} app · {e.route ?? ''} · {stamp(e.at)}</span>
            </div>
          ))}
        </section>
      )}
    </>
  );
}
