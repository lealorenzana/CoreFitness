import { useCallback, useEffect, useState } from 'react';
import {
  addAdmin, enterSupport, explain, getOverview, lastBackup, leaveSupport, listAdmins,
  listCrashes, listEmails, listEvents, listSupportGrants, removeAdmin, resolveCrashes,
  type Backup, type CrashReport, type Overview, type PlatformAdmin, type PlatformEvent,
  type SentEmail, type SupportGrant,
} from '../lib/platform';

const stamp = (iso: string) =>
  new Date(iso).toLocaleString('en-PH', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
const peso = (n: string) => '₱' + Number(n).toLocaleString('en-PH', { maximumFractionDigits: 0 });

/**
 * The service's own health: how big it is, what has broken, what the platform
 * decided, and who else holds the keys.
 *
 * Crash reports are the one thing here that crosses gyms — they are the
 * platform's to fix (0095 files them, 0106 reads them, 0109 lets you clear
 * them). They carry a screen and an error, never a member's data.
 *
 * The numbers are counts and sums over every gym, which is the one cross-gym
 * read that stays inside the processor line: nothing here names a gym's member
 * or resolves to a row (docs/TENANCY.md).
 */
export default function Platform() {
  const [events, setEvents] = useState<PlatformEvent[] | null>(null);
  const [crashes, setCrashes] = useState<CrashReport[] | null>(null);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [admins, setAdmins] = useState<PlatformAdmin[] | null>(null);
  const [showResolved, setShowResolved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addingAdmin, setAddingAdmin] = useState('');
  const [backup, setBackup] = useState<Backup | null | undefined>(undefined);
  const [grants, setGrants] = useState<SupportGrant[]>([]);
  const [emails, setEmails] = useState<SentEmail[]>([]);
  const [inside, setInside] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [e, c] = await Promise.all([listEvents(60), listCrashes(14, showResolved)]);
      setEvents(e);
      setCrashes(c);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the platform log');
    }
    // 0109's half, kept separate: on a database where it is not pasted yet the
    // log above still works, and only these two sections say they are waiting.
    try {
      const [o, a, b] = await Promise.all([getOverview(), listAdmins(), lastBackup()]);
      setOverview(o);
      setAdmins(a);
      setBackup(b);
    } catch (err) {
      setOverview(null);
      setAdmins([]);
      setError(explain(err, '0109'));
    }
  }, [showResolved]);

  useEffect(() => { void (async () => { await load(); })(); }, [load]);

  // 0113, in its own effect: on a database where it is not pasted these two
  // simply stay empty and the rest of the screen is untouched.
  useEffect(() => {
    void (async () => {
      try { setGrants(await listSupportGrants()); } catch { setGrants([]); }
      try { setEmails(await listEmails(30)); } catch { setEmails([]); }
    })();
  }, []);

  // One line per distinct message: fifty copies of one broken screen is one
  // problem, and a list of fifty hides the other two. Resolving works the same
  // way — by message, so a fix clears every copy including the late arrivals.
  const grouped = (crashes ?? []).reduce<Record<string, { n: number; last: CrashReport }>>((acc, c) => {
    const key = `${c.app}:${c.message}`;
    acc[key] = { n: (acc[key]?.n ?? 0) + 1, last: acc[key]?.last ?? c };
    return acc;
  }, {});

  const clear = async (c: CrashReport) => {
    try {
      const n = await resolveCrashes(c.app, c.message);
      await load();
      setError(`Marked ${n} report${n === 1 ? '' : 's'} handled.`);
    } catch (e) {
      setError(explain(e, '0109'));
    }
  };

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await addAdmin(addingAdmin.trim());
      setAddingAdmin('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add them');
    }
  };

  return (
    <>
      {error && <p className="err">{error}</p>}

      {overview && (
        <div className="card">
          <div className="name">Core Fitness, right now</div>
          <div className="meta">
            Counts and sums across every gym. No gym's own rows are read to build this.
          </div>
          <div className="stats">
            <Stat n={overview.gyms} label="gyms" sub={`${overview.gyms_live} open for business`} />
            <Stat n={overview.members} label="members" sub={`across every gym`} />
            <Stat n={overview.checkins_30d} label="check-ins" sub="last 30 days" />
            <Stat n={overview.staff + overview.trainers} label="staff and coaches" sub="signed in somewhere" />
            <Stat text={peso(overview.revenue_this_month)} label="this month" sub={`${peso(overview.revenue_all_time)} in all`} />
            <Stat n={overview.new_gyms_30d} label="new gyms" sub="last 30 days" />
          </div>
          {(overview.applications_waiting > 0 || overview.gyms_unclaimed > 0
            || overview.gyms_unset_up > 0 || overview.overdue_gyms > 0
            || overview.gyms_suspended > 0) && (
            <div className="meta" style={{ marginTop: 12 }}>
              {[
                overview.applications_waiting > 0 && `${overview.applications_waiting} application${overview.applications_waiting === 1 ? '' : 's'} waiting for an answer`,
                overview.gyms_unclaimed > 0 && `${overview.gyms_unclaimed} gym${overview.gyms_unclaimed === 1 ? '' : 's'} nobody can sign into`,
                overview.gyms_unset_up > 0 && `${overview.gyms_unset_up} not set up by their owner yet`,
                overview.overdue_gyms > 0 && `${overview.overdue_gyms} past their paid-until date`,
                overview.gyms_suspended > 0 && `${overview.gyms_suspended} suspended by you`,
              ].filter(Boolean).join(' · ')}
            </div>
          )}
        </div>
      )}

      <div className="card">
        <div className="row">
          <span className="grow">
            <span className="name">
              {showResolved ? 'Crashes, last 14 days' : 'Crashes still open, last 14 days'}
            </span>
            <span className="meta">Filed automatically by both apps when a screen breaks (0095).</span>
          </span>
          <button className="btn ghost" onClick={() => setShowResolved((v) => !v)}>
            {showResolved ? 'Open only' : 'Show handled too'}
          </button>
        </div>
        <div style={{ marginTop: 10 }}>
          {crashes === null && <p className="empty">Loading…</p>}
          {crashes?.length === 0 && (
            <p className="empty">
              {showResolved ? 'Nothing has crashed in the last 14 days.' : 'Nothing is outstanding.'}
            </p>
          )}
          {Object.entries(grouped).map(([key, { n, last }]) => (
            <div className="row log" key={key}>
              <span className="grow">
                <strong style={{ color: 'var(--text)' }}>{last.message.slice(0, 140)}</strong>
                <br />
                {last.app} · {last.gym_name ?? 'before sign-in'} · {last.route ?? 'no route'} ·{' '}
                {n} time{n === 1 ? '' : 's'} · last {stamp(last.created_at)}
                {last.resolved_at && ' · handled'}
              </span>
              {!last.resolved_at && (
                <button className="btn ghost" onClick={() => void clear(last)}>
                  {n === 1 ? 'Handled' : `Handled (all ${n})`}
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="name">What the platform did</div>
        <div className="meta">Every gym let in, suspended, reactivated, renamed, paid or re-planned.</div>
        <div style={{ marginTop: 10 }}>
          {events === null && <p className="empty">Loading…</p>}
          {events?.length === 0 && <p className="empty">Nothing yet.</p>}
          {events?.map((e) => (
            <div className="log" key={e.id}>
              {e.summary}
              {typeof e.detail?.reason === 'string' && <> — “{e.detail.reason as string}”</>}
              <span className="muted"> · {stamp(e.created_at)}</span>
            </div>
          ))}
        </div>
      </div>

      {admins !== null && admins.length > 0 && (
        <div className="card">
          <div className="name">Who can run the platform</div>
          <div className="meta">
            Anyone here can let a gym in, suspend one, and change what the service sells. The last one
            cannot be removed — there is no way back in if nobody holds the keys.
          </div>
          <div style={{ marginTop: 10 }}>
            {admins.map((a) => (
              <div className="row log" key={a.user_id}>
                <span className="grow">
                  <strong style={{ color: 'var(--text)' }}>
                    {[a.first_name, a.last_name].filter(Boolean).join(' ') || a.email}
                  </strong>
                  {a.email && ` · ${a.email}`}
                  {a.is_me && ' · you'}
                </span>
                {!a.is_me && admins.length > 1 && (
                  <button className="btn ghost" onClick={() => void (async () => {
                    try { await removeAdmin(a.user_id); await load(); }
                    catch (e) { setError(e instanceof Error ? e.message : 'Could not remove them'); }
                  })()}>Remove</button>
                )}
              </div>
            ))}
          </div>
          <form className="row" style={{ marginTop: 12 }} onSubmit={add}>
            <input className="grow" type="email" required value={addingAdmin}
              placeholder="their email — they need a Core Fitness account already"
              onChange={(e) => setAddingAdmin(e.target.value)} />
            <button className="btn" type="submit">Add</button>
          </form>
        </div>
      )}

      {backup !== undefined && (
        <div className={'card' + (backup === null || backup.days_ago > 8 ? ' notice' : '')}>
          <div className="name">
            {backup === null ? 'No backup has ever reported itself'
              : backup.days_ago <= 1 ? 'The database was backed up today'
              : `The database was backed up ${backup.days_ago} days ago`}
          </div>
          <div className="meta">
            {backup === null
              ? 'The weekly backup runs on GitHub (Actions → Weekly database backup). Nothing has '
                + 'reported success here, which means either it has not run since this was added, or '
                + 'it is not running at all. Silence is the thing worth checking.'
              : backup.days_ago > 8
                ? 'It runs weekly, so more than eight days is a run that did not happen. Check '
                  + 'Actions → Weekly database backup on GitHub.'
                : backup.summary}
          </div>
        </div>
      )}

      {grants.length > 0 && (
        <div className="card notice">
          <div className="name">
            {grants.length === 1 ? 'A gym has asked for help' : `${grants.length} gyms have asked for help`}
          </div>
          <div className="meta">
            They granted this themselves and can withdraw it at any moment. You can look and not
            touch: the database refuses every write while you are inside, and the visit is written
            into that gym's own activity log where its owner reads it.
          </div>
          <div style={{ marginTop: 10 }}>
            {grants.map((g) => (
              <div className="row log" key={g.id}>
                <span className="grow">
                  <strong style={{ color: 'var(--text)' }}>{g.gym_name}</strong>
                  {g.reason ? ` — "${g.reason}"` : ''}
                  <br />
                  until {stamp(g.expires_at)}
                  {g.first_used_at ? ' — already visited' : ' — not looked at yet'}
                </span>
                <button className="btn" onClick={() => void (async () => {
                  try {
                    const name = await enterSupport(g.gym_id);
                    setInside(name ?? g.gym_name);
                  } catch (e) {
                    setError(e instanceof Error ? e.message : 'Could not enter');
                  }
                })()}>Look</button>
              </div>
            ))}
          </div>
          {inside && (
            <div className="meta" style={{ marginTop: 10, color: 'var(--warn)' }}>
              You are looking at <strong>{inside}</strong>. Nothing you do can change it.{' '}
              <button className="btn ghost" style={{ marginLeft: 8 }}
                onClick={() => void (async () => { await leaveSupport(); setInside(null); })()}>
                Stop looking
              </button>
            </div>
          )}
        </div>
      )}

      {emails.length > 0 && (
        <div className="card">
          <div className="name">Mail, last 30 days</div>
          <div className="meta">
            Who was told what, and whether it arrived. Never the message itself — an invitation or a
            temporary password lives in there, and it was shown once already.
          </div>
          <div style={{ marginTop: 10 }}>
            {emails.slice(0, 25).map((e) => (
              <div className="log" key={e.id}>
                <strong style={{ color: 'var(--text)' }}>{e.subject}</strong>
                <br />
                {e.to_email}{e.gym_name ? ` — ${e.gym_name}` : ''} — {e.kind.replace(/_/g, ' ')} —{' '}
                <span style={{ color: e.status === 'sent' ? 'var(--text-2)' : 'var(--warn)' }}>
                  {e.status === 'sent' ? `sent ${stamp(e.sent_at!)}`
                    : e.status === 'not_configured' ? 'no mail provider set up — handed over by hand'
                    : e.status === 'failed' ? `failed: ${e.error ?? 'no reason given'}`
                    : 'queued'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card">
        <div className="name">Migrations</div>
        <div className="meta">
          Which are live is asked of the database, never assumed:
          <code style={{ marginLeft: 6 }}>python scripts/probe-migrations.py</code>. Paste waiting ones
          one at a time, in number order, in the Supabase SQL editor — and the matching
          <code style={{ margin: '0 4px' }}>scripts/sql/verify/verifyNNNN.sql</code> after each.
        </div>
      </div>
    </>
  );
}

function Stat({ n, text, label, sub }: { n?: number; text?: string; label: string; sub?: string }) {
  return (
    <span className="stat">
      <strong>{text ?? (n ?? 0).toLocaleString('en-PH')}</strong>
      <span>{label}</span>
      {sub && <span className="muted">{sub}</span>}
    </span>
  );
}
