import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Activity, AlertTriangle, Building2, CalendarClock, ChevronRight, Download, ExternalLink, KeyRound, Plus, Search,
  Sparkles, Users, Wallet,
} from 'lucide-react';
import { downloadCsv } from '../lib/csv';
import {
  createGym, gymHealth, listGyms, listPlatformPlans, setGymPlan, setGymStatus, slugFor,
  type PlatformGym, type PlatformPlan,
} from '../lib/platform';
import InviteOwner from '../components/InviteOwner';
import Ask from '../components/Ask';
import GymMark from '../components/GymMark';
import Modal from '../components/Modal';
import Pagination from '../components/Pagination';

const day = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-PH', { day: 'numeric', month: 'short', year: 'numeric' }) : null;
const peso = (n: string | number) => '₱' + Number(n).toLocaleString('en-PH', { maximumFractionDigits: 0 });

/** "3 days ago" — a gym nobody has used in a month is the thing worth seeing. */
function since(iso: string | null): string {
  if (!iso) return 'no activity yet';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return 'active today';
  if (days === 1) return 'active yesterday';
  if (days < 30) return `active ${days} days ago`;
  const months = Math.floor(days / 30);
  return `quiet for ${months} month${months === 1 ? '' : 's'}`;
}

type Risk = { level: string; reasons: string[] };
type Filter = 'all' | 'live' | 'setup' | 'locked' | 'risk' | 'due' | 'needs' | 'archived';
type Sort = 'name' | 'members' | 'due' | 'newest';
type Dialog =
  | { kind: 'view' | 'plan' | 'suspend' | 'invite' | 'archive'; gym: PlatformGym }
  | { kind: 'add' };

const PER_PAGE = 9;
const setupState = (g: PlatformGym) => g.owners === 0 || !g.onboarded;
const dueSoon = (g: PlatformGym) => g.days_left !== null && g.days_left <= 14;
const archived = (g: PlatformGym) => g.status === 'archived';
const matches = (g: PlatformGym, f: Filter, risk: Map<string, Risk>) =>
  f === 'archived' ? archived(g)
  : archived(g) ? false
  : f === 'all' ? true
  : f === 'live' ? !g.lock_reason && !setupState(g)
  : f === 'setup' ? !g.lock_reason && setupState(g)
  : f === 'locked' ? !!g.lock_reason
  : f === 'risk' ? risk.has(g.id)
  : f === 'needs' ? !!g.lock_reason || risk.has(g.id) || dueSoon(g)
  : dueSoon(g);

/**
 * The gyms on Core Fitness, in the admin app's own layout (2026-09-28): a bento
 * row of figures that filter, chips with counts, a paged grid of gym cards, and
 * every decision — plan, suspend, invite, add — in a popup rather than unfolding
 * inside the list. A card opens a quick view; its full page is one more click.
 *
 * Member and staff counts, never members: the platform is the processor of a
 * gym's data, not its controller (docs/TENANCY.md).
 */
export default function Gyms() {
  const [gyms, setGyms] = useState<PlatformGym[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [plans, setPlans] = useState<PlatformPlan[]>([]);
  /** Gym id → its risk (0136). Empty before 0136. */
  const [risk, setRisk] = useState<Map<string, Risk>>(new Map());
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<Sort>('name');
  const [page, setPage] = useState(1);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [form, setForm] = useState({ name: '', slug: '' });
  const navigate = useNavigate();

  const load = useCallback(async () => {
    try {
      const [g, p] = await Promise.all([listGyms(), listPlatformPlans()]);
      setGyms(g);
      setPlans(p);
      setError(null);
      const h = await gymHealth().catch(() => []);
      setRisk(new Map(h.filter((x) => x.level !== 'healthy').map((x) => [x.gym_id, { level: x.level, reasons: x.reasons }])));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the gyms');
    }
  }, []);
  useEffect(() => { void (async () => { await load(); })(); }, [load]);

  const close = useCallback(() => setDialog(null), []);
  const act = async (id: string, what: () => Promise<unknown>) => {
    setBusy(id);
    setError(null);
    try { await what(); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : 'That did not work'); }
    finally { setBusy(null); }
  };
  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await createGym(form.name.trim(), (form.slug || slugFor(form.name)).trim());
      setForm({ name: '', slug: '' });
      setDialog(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the gym');
    }
  };
  const pick = (f: Filter) => { setFilter(f); setPage(1); };

  const all = gyms ?? [];
  const count = (f: Filter) => all.filter((g) => matches(g, f, risk)).length;
  const q = search.trim().toLowerCase();
  const shown = all
    .filter((g) => matches(g, filter, risk))
    .filter((g) => !q || (g.name + ' ' + g.slug).toLowerCase().includes(q))
    .sort((a, b) => sort === 'members' ? b.members - a.members
      : sort === 'due' ? (a.days_left ?? 1e9) - (b.days_left ?? 1e9)
      : sort === 'newest' ? b.created_at.localeCompare(a.created_at)
      : a.name.localeCompare(b.name));
  const pages = Math.max(1, Math.ceil(shown.length / PER_PAGE));
  const current = Math.min(page, pages);
  const onPage = shown.slice((current - 1) * PER_PAGE, current * PER_PAGE);

  const tiles: { f: Filter | null; icon: typeof Building2; value: string; label: string; act?: boolean; go?: string }[] = [
    { f: 'all', icon: Building2, value: gyms ? String(all.length) : '…', label: 'Gyms' },
    { f: 'live', icon: Activity, value: gyms ? String(count('live')) : '…', label: 'Live' },
    { f: 'setup', icon: Sparkles, value: gyms ? String(count('setup')) : '…', label: 'Setting up' },
    { f: null, icon: Users, value: gyms ? all.reduce((n, g) => n + g.members, 0).toLocaleString('en-PH') : '…', label: 'Members', go: '/growth' },
    { f: 'needs', icon: AlertTriangle, value: gyms ? String(count('needs')) : '…', label: 'Need you', act: true },
  ];

  return (
    <>
      <div className="tiles">
        {tiles.map((t) => {
          const Icon = t.icon;
          const on = t.f !== null && filter === t.f;
          return (
            <button key={t.label} type="button" className={`tile${t.act ? ' act' : ''}${on ? ' on' : ''}`}
              data-tip={{ Gyms: 'Every gym on Core Fitness — click to show them all', Live: 'Open, set up, and not read-only',
                'Setting up': 'No owner yet, or the owner has not finished /admin/setup', Members: 'Active members across every gym — click for Growth',
                'Need you': 'Read-only, at risk of leaving, or due within 14 days — click to show only these' }[t.label]}
              onClick={() => (t.go ? navigate(t.go) : pick(on ? 'all' : t.f!))}>
              <span className="tile-icon"><Icon size={19} /></span>
              <span className="tile-text">
                <span className="tile-value">{t.value}</span>
                <span className="tile-label">{t.label}</span>
              </span>
              <ChevronRight size={16} className="tile-chev" />
            </button>
          );
        })}
      </div>

      <div className="toolbar">
        <div className="filters" role="group" aria-label="Show">
          {([['all', 'All'], ['live', 'Live'], ['setup', 'Setting up'], ['locked', 'Read-only'], ['risk', 'At risk'], ['due', 'Due soon'], ['archived', 'Archived']] as [Filter, string][])
            // Archived appears once a gym has been archived — an empty chip there only crowds the bar.
            .filter(([f]) => f !== 'archived' || filter === 'archived' || (gyms ? count(f) : 0) > 0).map(([f, label]) => (
            <button key={f} type="button" className={filter === f ? 'on' : ''} aria-pressed={filter === f} onClick={() => pick(f)}>
              {label}<b>{gyms ? count(f) : ''}</b>
            </button>
          ))}
        </div>
        <span className="spacer" />
        <label className="search" style={{ width: 210, margin: 0 }} aria-label="Find a gym">
          <Search size={15} />
          <input value={search} placeholder="Find a gym" onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        </label>
        <select aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value as Sort)} style={{ width: 150 }}>
          <option value="name">Name, A–Z</option>
          <option value="members">Most members</option>
          <option value="due">Due soonest</option>
          <option value="newest">Newest first</option>
        </select>
        <button className="btn ghost" disabled={shown.length === 0} onClick={() => downloadCsv('core-fitness-gyms', shown, [
          ['Gym', (g) => g.name], ['Address', (g) => g.slug], ['Status', (g) => g.lock_reason ? `read-only (${g.lock_reason})` : g.status],
          ['Plan', (g) => g.plan_name ?? g.plan], ['Price a month', (g) => g.price_monthly], ['Paid until', (g) => g.paid_until],
          ['Days left', (g) => g.days_left], ['Members', (g) => g.members], ['Member limit', (g) => g.max_members], ['Staff', (g) => g.staff],
          ['Owners', (g) => g.owners], ['Set up', (g) => g.onboarded ? 'yes' : 'no'], ['Joined', (g) => g.created_at.slice(0, 10)],
          ['Last activity', (g) => g.last_activity?.slice(0, 10)], ['Risk', (g) => risk.get(g.id)?.reasons.join('; ')],
        ])}>
          <Download size={15} /> Export CSV
        </button>
        <button className="btn" onClick={() => setDialog({ kind: 'add' })}><Plus size={15} /> Add a gym</button>
      </div>

      {error && <p className="err">{error}</p>}
      {gyms === null && <p className="empty">Loading the gyms…</p>}
      {gyms?.length === 0 && <p className="empty">No gyms yet. Let one in from Applications, or add one here.</p>}
      {gyms && gyms.length > 0 && shown.length === 0 && (
        <p className="empty">No gym matches{q ? ` “${search.trim()}”` : ''} in this view.</p>
      )}

      <div className="gym-grid">
        {onPage.map((gym) => (
          <GymCard key={gym.id} gym={gym} risk={risk.get(gym.id)} busy={busy === gym.id}
            onOpen={() => setDialog({ kind: 'view', gym })}
            onPlan={() => setDialog({ kind: 'plan', gym })}
            onSuspend={() => setDialog({ kind: 'suspend', gym })}
            onInvite={() => setDialog({ kind: 'invite', gym })}
            onReactivate={() => void act(gym.id, () => setGymStatus(gym.id, 'active', ''))} />
        ))}
      </div>
      <Pagination page={current} perPage={PER_PAGE} total={shown.length} noun={shown.length === 1 ? 'gym' : 'gyms'} onPage={setPage} />

      {/* ---- the popups ---- */}
      <Modal open={dialog?.kind === 'view'} onClose={close} size="lg" label="Gym">
        {dialog?.kind === 'view' && (
          <QuickView gym={dialog.gym} risk={risk.get(dialog.gym.id)} busy={busy === dialog.gym.id}
            onFull={() => navigate(`/gyms/${dialog.gym.id}`)}
            onPlan={() => setDialog({ kind: 'plan', gym: dialog.gym })}
            onSuspend={() => setDialog({ kind: 'suspend', gym: dialog.gym })}
            onInvite={() => setDialog({ kind: 'invite', gym: dialog.gym })}
            onReactivate={() => void act(dialog.gym.id, async () => { await setGymStatus(dialog.gym.id, 'active', ''); setDialog(null); })}
            onArchive={() => setDialog({ kind: 'archive', gym: dialog.gym })} />
        )}
      </Modal>

      <Modal open={dialog?.kind === 'suspend'} onClose={close} size="sm" label="Suspend">
        {dialog?.kind === 'suspend' && (
          <Ask
            title={`Suspend ${dialog.gym.name}?`}
            blurb="The gym goes read-only: its desk can still look things up, but nothing can be written. Its owner is shown the reason you give, so write it for them."
            fields={[{ key: 'reason', label: 'Why', required: true, placeholder: 'Did not pay for three months' }]}
            confirmLabel="Suspend the gym"
            onCancel={close}
            onConfirm={async (v) => { await setGymStatus(dialog.gym.id, 'suspended', v.reason.trim()); setDialog(null); await load(); }}
          />
        )}
      </Modal>

      <Modal open={dialog?.kind === 'archive'} onClose={close} size="sm" label="Archive">
        {dialog?.kind === 'archive' && (
          <Ask
            title={`Archive ${dialog.gym.name}?`}
            blurb="For a gym that has closed or will not come back. It disappears from your lists (find it under Archived), stops being listed to members, and goes read-only — its records are kept, nothing is deleted, and you can restore it any time. Its owner is shown the reason."
            fields={[
              { key: 'reason', label: 'Why', required: true, placeholder: 'The gym closed in October' },
              { key: 'confirm', label: `Type ${dialog.gym.name} to confirm`, required: true, placeholder: dialog.gym.name },
            ]}
            confirmLabel="Archive the gym"
            onCancel={close}
            onConfirm={async (v) => {
              if (v.confirm.trim().toLowerCase() !== dialog.gym.name.trim().toLowerCase()) {
                throw new Error(`Type the gym's name exactly — ${dialog.gym.name} — to archive it.`);
              }
              await setGymStatus(dialog.gym.id, 'archived', v.reason.trim());
              setDialog(null);
              await load();
            }}
          />
        )}
      </Modal>

      <Modal open={dialog?.kind === 'plan'} onClose={close} size="md" label="Plan">
        {dialog?.kind === 'plan' && (
          <Ask
            title={`What plan is ${dialog.gym.name} on?`}
            blurb="The plan decides what the gym can use and how many members it may have. The date is better moved by recording a payment on the Money screen — that leaves an amount and a reference behind it."
            fields={[
              // The plans that exist; a retired plan is still listed when this
              // gym is the one on it, or the picker could not show its own value.
              { key: 'plan', label: 'Plan', initial: dialog.gym.plan,
                options: plans.filter((p) => p.is_active || p.key === dialog.gym.plan).map((p) => p.key) },
              { key: 'paid', label: 'Paid until', type: 'date', initial: dialog.gym.paid_until ?? '' },
            ]}
            confirmLabel="Save"
            onCancel={close}
            onConfirm={async (v) => { await setGymPlan(dialog.gym.id, v.plan, v.paid.trim() || null); setDialog(null); await load(); }}
          />
        )}
      </Modal>

      <Modal open={dialog?.kind === 'invite'} onClose={close} size="md" label="Invite the owner">
        {dialog?.kind === 'invite' && (
          <InviteOwner gymId={dialog.gym.id} gymName={dialog.gym.name} onCancel={close}
            onDone={() => { setDialog(null); void load(); }} />
        )}
      </Modal>

      <Modal open={dialog?.kind === 'add'} onClose={close} size="md" title="Add a gym"
        subtitle="For a gym that is not applying through the website.">
        <form onSubmit={add}>
          <p className="meta" style={{ marginTop: 0 }}>
            It opens with Core Fitness's own plans, point rules, badges and settings, which the gym then edits as its own.
            Its name, address and logo stay blank — the owner fills those in when they first sign in. Invite the owner
            from its card afterwards; until you do, nobody can sign into it.
          </p>
          <div className="fields">
            <div>
              <label htmlFor="gym-name">Gym name</label>
              <input id="gym-name" value={form.name} required autoFocus onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <label htmlFor="gym-slug">Link name (…/join/…)</label>
              <input id="gym-slug" value={form.slug} placeholder={slugFor(form.name) || 'harbour-strength'}
                onChange={(e) => setForm({ ...form, slug: e.target.value })} />
            </div>
          </div>
          <div className="qv-actions">
            <button className="btn" type="submit" disabled={!form.name.trim()}>Create the gym</button>
            <button className="btn ghost" type="button" onClick={close}>Cancel</button>
          </div>
        </form>
      </Modal>
    </>
  );
}

interface CardProps {
  gym: PlatformGym; risk?: Risk; busy: boolean;
  onPlan: () => void; onSuspend: () => void; onInvite: () => void; onReactivate: () => void; onArchive: () => void;
}

function StatusPill({ gym }: { gym: PlatformGym }) {
  return gym.lock_reason ? (
    <span className="pill warn"><span className="dot" />{gym.lock_reason === 'suspended' ? 'Suspended'
      : gym.lock_reason === 'archived' ? 'Archived'
      : gym.lock_reason === 'cancelled' ? 'Left Core Fitness' : 'Overdue — read-only'}</span>
  ) : (
    <span className="pill ok"><span className="dot" />{setupState(gym) ? 'Setting up' : 'Live'}</span>
  );
}

function Flags({ gym, risk }: { gym: PlatformGym; risk?: Risk }) {
  if (!risk && !dueSoon(gym) && gym.owners > 0) return null;
  return (
    <div className="gym-flags">
      {risk && (
        <span className="chip warn" title={risk.reasons.join(' · ')}><AlertTriangle size={12} />
          {risk.level === 'high' ? 'At risk' : 'Watch'}: {risk.reasons[0]}</span>
      )}
      {dueSoon(gym) && (
        <span className="chip warn"><CalendarClock size={12} />
          {gym.days_left! < 0 ? `${-gym.days_left!} days late` : gym.days_left === 0 ? 'due today' : `due in ${gym.days_left} days`}</span>
      )}
      {gym.owners === 0 && <span className="chip warn"><KeyRound size={12} />Nobody can sign in yet</span>}
    </div>
  );
}

/**
 * One gym. The card is a div with a button's role — never a <button>, because
 * it holds buttons of its own — and its footer buttons stop the click so they
 * open their own popup, not the quick view.
 */
function GymCard({ gym, risk, busy, onOpen, onPlan, onSuspend, onInvite, onReactivate }: Omit<CardProps, 'onArchive'> & { onOpen: () => void }) {
  const stop = (fn: () => void) => (e: React.MouseEvent) => { e.stopPropagation(); fn(); };
  const warn = !!gym.lock_reason || risk?.level === 'high';
  return (
    <div className={`gym-card${warn ? ' warn' : ''}`} role="button" tabIndex={0} aria-label={`${gym.name}, open`}
      onClick={onOpen}
      onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onOpen(); } }}>
      <div className="gym-head">
        <GymMark name={gym.name} logoUrl={gym.logo_url} accent={gym.accent} size={46} />
        <span className="gym-title">
          <span className="name">{gym.name}</span>
          <span className="slug">/join/{gym.slug}</span>
        </span>
        <StatusPill gym={gym} />
      </div>

      <div className="gym-stats">
        <div className="gym-stat"><b>{gym.members.toLocaleString('en-PH')}</b><span>member{gym.members === 1 ? '' : 's'}</span></div>
        <div className="gym-stat"><b>{gym.staff}</b><span>on the desk</span></div>
        <div className="gym-stat"><b>{Number(gym.paid_total) > 0 ? peso(gym.paid_total) : '—'}</b><span>paid in all</span></div>
      </div>

      <div>
        <div className="gym-line"><Wallet size={14} />{gym.plan_name ?? gym.plan}
          <span className={`end${gym.days_left !== null && gym.days_left < 0 ? ' warn' : ''}`}>
            {gym.paid_until ? `to ${day(gym.paid_until)}` : 'no paid-until date'}</span>
        </div>
        <div className="gym-line" style={{ marginTop: 6 }}><Activity size={14} />{since(gym.last_activity)}
          {gym.max_members !== null && <span className="end">{gym.members} of {gym.max_members}</span>}
        </div>
        {gym.max_members !== null && (
          <div className="meter" title={`${gym.members} of ${gym.max_members} members on this plan`}>
            <span style={{ width: `${Math.min(100, (gym.members / Math.max(1, gym.max_members)) * 100)}%` }} />
          </div>
        )}
      </div>

      <Flags gym={gym} risk={risk} />

      <div className="gym-foot">
        {gym.owners === 0 && <button className="btn" disabled={busy} onClick={stop(onInvite)}>Invite the owner</button>}
        <button className="btn ghost" disabled={busy} onClick={stop(onPlan)}>Plan</button>
        {gym.status === 'active'
          ? <button className="btn ghost" disabled={busy} onClick={stop(onSuspend)}>Suspend</button>
          : <button className="btn" disabled={busy} onClick={stop(onReactivate)}>{gym.status === 'archived' ? 'Restore' : 'Reactivate'}</button>}
        <span className="open">Details <ChevronRight size={14} /></span>
      </div>
    </div>
  );
}

/** The popup a card opens: the gym at a glance, its decisions, and its full page. */
function QuickView({ gym, risk, busy, onFull, onPlan, onSuspend, onInvite, onReactivate, onArchive }: CardProps & { onFull: () => void }) {
  const joined = day(gym.created_at);
  return (
    <>
      <div className="qv-head">
        <GymMark name={gym.name} logoUrl={gym.logo_url} accent={gym.accent} size={60} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <h2>{gym.name}</h2>
          <span className="meta" style={{ marginTop: 2 }}>/join/{gym.slug} · on Core Fitness since {joined}</span>
        </div>
        <StatusPill gym={gym} />
      </div>

      <div className="qv-kpis">
        <div className="gym-stat"><b>{gym.members.toLocaleString('en-PH')}</b><span>{gym.max_members !== null ? `of ${gym.max_members} members` : 'members'}</span></div>
        <div className="gym-stat"><b>{gym.staff}</b><span>on the desk</span></div>
        <div className="gym-stat"><b>{gym.owners}</b><span>owner{gym.owners === 1 ? '' : 's'}</span></div>
        <div className="gym-stat"><b>{Number(gym.paid_total) > 0 ? peso(gym.paid_total) : '—'}</b><span>paid in all</span></div>
      </div>

      <dl className="qv-rows">
        <div><dt>Plan</dt><dd>{gym.plan_name ?? gym.plan}{gym.price_monthly !== null ? ` · ${peso(gym.price_monthly)} a month` : ''}</dd></div>
        <div><dt>Paid until</dt><dd style={dueSoon(gym) ? { color: 'var(--warn)' } : undefined}>{gym.paid_until
          ? `${day(gym.paid_until)}${gym.days_left !== null ? (gym.days_left < 0 ? ` — ${-gym.days_left} days late` : ` — ${gym.days_left} days left`) : ''}`
          : 'No paid-until date'}</dd></div>
        <div><dt>Activity</dt><dd>{since(gym.last_activity)}</dd></div>
        <div><dt>Set up</dt><dd>{gym.owners === 0 ? 'Nobody can sign in yet — invite the owner'
          : !gym.onboarded ? 'The owner has not finished setting the gym up' : 'Done'}</dd></div>
      </dl>

      {risk && (
        <div className="qv-flags">
          <span className="section-title" style={{ marginBottom: 8 }}><AlertTriangle size={13} /> {risk.level === 'high' ? 'At risk of leaving' : 'Worth watching'}</span>
          <div className="gym-flags">{risk.reasons.map((r) => <span key={r} className="chip warn">{r}</span>)}</div>
        </div>
      )}

      <div className="qv-actions">
        <button className="btn" onClick={onFull}><ExternalLink size={14} /> Open its full page</button>
        {gym.owners === 0 && <button className="btn ghost" disabled={busy} onClick={onInvite}>Invite the owner</button>}
        <span className="grow-gap" />
        <button className="btn ghost" disabled={busy} onClick={onPlan}>Change plan</button>
        {gym.status === 'active'
          ? <button className="btn ghost" disabled={busy} onClick={onSuspend}>Suspend</button>
          : <button className="btn ghost" disabled={busy} onClick={onReactivate}>{gym.status === 'archived' ? 'Restore' : 'Reactivate'}</button>}
        {gym.status !== 'archived' && <button className="btn ghost" disabled={busy} onClick={onArchive}>Archive</button>}
      </div>
    </>
  );
}
