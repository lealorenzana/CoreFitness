import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Activity, AlertTriangle, Building2, CalendarClock, ChevronRight, Download, ExternalLink, KeyRound, Plus, Search,
  Sparkles, Users,
} from 'lucide-react';
import { downloadCsv } from '../lib/csv';
import {
  createGym, gymFrontPhotos, gymHealth, listGyms, listPlatformPlans, setGymPlan, setGymStatus, slugFor,
  type PlatformGym, type PlatformPlan,
} from '../lib/platform';
import InviteOwner from '../components/InviteOwner';
import BillGym from '../components/BillGym';
import ViewMenu, { useLook, type Look } from '../components/ViewMenu';
import Ask from '../components/Ask';
import GymMark from '../components/GymMark';
import GymStatus from '../components/GymStatus';
import './gyms.css';
import Modal from '../components/Modal';
import Pagination from '../components/Pagination';
import { useFitCards } from '../lib/useFitCards';
import SkelRows from '../components/ui/SkelRows';

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
  | { kind: 'view' | 'plan' | 'bill' | 'suspend' | 'invite' | 'archive'; gym: PlatformGym }
  | { kind: 'add' };

const PER_PAGE = 9;
/** How the gyms are laid out (2026-11-27, the owner's File Explorer View menu). A screen preference, not a person's data. */
const VIEWS: [string, string][] = [['large', 'Large tiles'], ['small', 'Small tiles'], ['list', 'List'], ['details', 'Details']];
const VIEW_KEY = 'cf-platform-gyms-view';
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
  /** Gym id → a signed URL of its front photo (0267). */
  const [photos, setPhotos] = useState<Map<string, string>>(new Map());
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<Sort>('name');
  const [page, setPage] = useState(1);
  /** Cards a page = what fits the screen (useFitCards); PER_PAGE below 1280px. */
  const { ref: gridRef, perPage } = useFitCards(PER_PAGE);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [look, saveLook] = useLook('platform.gyms', VIEW_KEY, VIEWS, { view: 'large', pane: false });
  const [selected, setSelected] = useState<string | null>(null);
  const changeLook = (next: Look) => { saveLook(next); setPage(1); };
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
      setPhotos(await gymFrontPhotos());
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
  const pages = Math.max(1, Math.ceil(shown.length / perPage));
  const current = Math.min(page, pages);
  const onPage = shown.slice((current - 1) * perPage, current * perPage);

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
              data-tip={{ Gyms: 'Every gym on Core Fitness, click to show them all', Live: 'Open, set up, and not read-only',
                'Setting up': 'No owner yet, or the owner has not finished /admin/setup', Members: 'Active members across every gym, click for Growth',
                'Need you': 'Read-only, at risk of leaving, or due within 14 days, click to show only these' }[t.label]}
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
          {/* Live and Setting up are the strip's own figures above (they filter); the chips hold only what the strip does not. */}
          {([['all', 'All'], ['locked', 'Read-only'], ['risk', 'At risk'], ['due', 'Due soon'], ['archived', 'Archived']] as [Filter, string][])
            // Archived appears once a gym has been archived — an empty chip there only crowds the bar.
            .filter(([f]) => f !== 'archived' || filter === 'archived' || (gyms ? count(f) : 0) > 0).map(([f, label]) => (
            <button key={f} type="button" className={filter === f ? 'on' : ''} aria-pressed={filter === f} onClick={() => pick(f)}>
              {label}<b>{gyms ? count(f) : ''}</b>
            </button>
          ))}
        </div>
        <span className="spacer" />
        <label className="search" style={{ width: 200, margin: 0 }} aria-label="Find a gym">
          <Search size={15} />
          <input value={search} placeholder="Find a gym" onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        </label>
        <select aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value as Sort)} style={{ width: 150 }}>
          <option value="name">Name, A–Z</option>
          <option value="members">Most members</option>
          <option value="due">Due soonest</option>
          <option value="newest">Newest first</option>
        </select>
        <ViewMenu views={VIEWS} look={look} onChange={changeLook} />
        <button className="btn ghost" disabled={shown.length === 0} onClick={() => downloadCsv('core-fitness-gyms', shown, [
          ['Gym', (g) => g.name], ['Address', (g) => g.slug], ['Status', (g) => g.lock_reason ? `read-only (${g.lock_reason})` : g.status],
          ['Plan', (g) => g.plan_name ?? g.plan], ['Price a month', (g) => g.price_monthly], ['Paid until', (g) => g.paid_until],
          ['Days left', (g) => g.days_left], ['Members', (g) => g.members], ['Member limit', (g) => g.max_members], ['Staff', (g) => g.staff],
          ['Owners', (g) => g.owners], ['Set up', (g) => g.onboarded ? 'yes' : 'no'], ['Joined', (g) => g.created_at.slice(0, 10)],
          ['Last activity', (g) => g.last_activity?.slice(0, 10)], ['Risk', (g) => risk.get(g.id)?.reasons.join('; ')],
        ])}>
          <Download size={15} /> Export
        </button>
        <button className="btn" onClick={() => setDialog({ kind: 'add' })}><Plus size={15} /> Add a gym</button>
      </div>

      {error && <p className="err">{error}</p>}
      {gyms === null && <SkelRows label="Loading the gyms…" />}
      {gyms?.length === 0 && <p className="empty">No gyms yet. Let one in from Applications, or add one here.</p>}
      {gyms && gyms.length > 0 && shown.length === 0 && (
        <p className="empty">No gym matches{q ? ` “${search.trim()}”` : ''} in this view.</p>
      )}

      <div className={look.pane ? 'gx-split' : 'gx-nosplit'}>
      <div className="gx-main">
      {look.view === 'details' && onPage.length > 0 && (
        <div className="gx-row gx-row-head">
          <SortHead label="Gym" by="name" sort={sort} onSort={setSort} />
          <span>Status</span><span>Plan</span>
          <SortHead label="Covered until" by="due" sort={sort} onSort={setSort} />
          <SortHead label="Members" by="members" sort={sort} onSort={setSort} />
          <span>Activity</span>
        </div>
      )}
      <div className={`gym-grid view-${look.view}`} ref={gridRef} data-view={look.view}>
        {onPage.map((gym) => {
          const open = () => (look.pane ? setSelected(gym.id) : setDialog({ kind: 'view', gym }));
          return look.view === 'list' || look.view === 'details'
            ? <GymRow key={gym.id} gym={gym} details={look.view === 'details'} on={look.pane && selected === gym.id} onOpen={open} />
            : <GymCard key={gym.id} gym={gym} photo={photos.get(gym.id)} risk={risk.get(gym.id)} busy={busy === gym.id}
              onOpen={open}
              onPlan={() => setDialog({ kind: 'plan', gym })}
              onBill={() => setDialog({ kind: 'bill', gym })}
              onSuspend={() => setDialog({ kind: 'suspend', gym })}
              onInvite={() => setDialog({ kind: 'invite', gym })}
              onReactivate={() => void act(gym.id, () => setGymStatus(gym.id, 'active', ''))} />;
        })}
      </div>
      <Pagination page={current} perPage={perPage} total={shown.length} noun={shown.length === 1 ? 'gym' : 'gyms'} onPage={setPage} />
      </div>
      {look.pane && (
        <aside className="card gx-pane" aria-label="Details pane" data-gym-pane>
          {(() => {
            const gym = all.find((g) => g.id === selected);
            return !gym ? <p className="empty">Pick a gym to see it here.</p> : (
              <QuickView gym={gym} risk={risk.get(gym.id)} busy={busy === gym.id}
                onFull={() => navigate(`/gyms/${gym.id}`)}
                onPlan={() => setDialog({ kind: 'plan', gym })}
                onBill={() => setDialog({ kind: 'bill', gym })}
                onSuspend={() => setDialog({ kind: 'suspend', gym })}
                onInvite={() => setDialog({ kind: 'invite', gym })}
                onReactivate={() => void act(gym.id, () => setGymStatus(gym.id, 'active', ''))}
                onArchive={() => setDialog({ kind: 'archive', gym })} />
            );
          })()}
        </aside>
      )}
      </div>

      {/* ---- the popups ---- */}
      <Modal open={dialog?.kind === 'view'} onClose={close} size="lg" label="Gym">
        {dialog?.kind === 'view' && (
          <QuickView gym={dialog.gym} risk={risk.get(dialog.gym.id)} busy={busy === dialog.gym.id}
            onFull={() => navigate(`/gyms/${dialog.gym.id}`)}
            onPlan={() => setDialog({ kind: 'plan', gym: dialog.gym })}
            onBill={() => setDialog({ kind: 'bill', gym: dialog.gym })}
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
            blurb="For a gym that has closed or will not come back. It disappears from your lists (find it under Archived), stops being listed to members, and goes read-only, its records are kept, nothing is deleted, and you can restore it any time. Its owner is shown the reason."
            fields={[
              { key: 'reason', label: 'Why', required: true, placeholder: 'The gym closed in October' },
              { key: 'confirm', label: `Type ${dialog.gym.name} to confirm`, required: true, placeholder: dialog.gym.name },
            ]}
            confirmLabel="Archive the gym"
            onCancel={close}
            onConfirm={async (v) => {
              if (v.confirm.trim().toLowerCase() !== dialog.gym.name.trim().toLowerCase()) {
                throw new Error(`Type the gym's name exactly, ${dialog.gym.name}, to archive it.`);
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
            blurb="The plan decides what the gym can use and how many members it may have. Its covered until date stays as it is: to record a payment or move the date, use Bill this gym."
            fields={[
              // The plans that exist; a retired plan is still listed when this
              // gym is the one on it, or the picker could not show its own value.
              { key: 'plan', label: 'Plan', initial: dialog.gym.plan,
                options: plans.filter((p) => p.is_active || p.key === dialog.gym.plan).map((p) => p.key),
                optionLabels: Object.fromEntries(plans.map((p) => [p.key, `${p.name}${p.price_monthly !== null ? `, ${peso(p.price_monthly)} a month` : ''}`])) },
            ]}
            confirmLabel="Save"
            onCancel={close}
            onConfirm={async (v) => { await setGymPlan(dialog.gym.id, v.plan, null); setDialog(null); await load(); }}
          />
        )}
      </Modal>

      <Modal open={dialog?.kind === 'bill'} onClose={close} size="lg" label="Bill this gym">
        {dialog?.kind === 'bill' && (
          <BillGym gym={dialog.gym} onCancel={close} onDone={() => { setDialog(null); void load(); }} />
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
            Its name, address and logo stay blank, the owner fills those in when they first sign in. Invite the owner
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
  onPlan: () => void; onBill: () => void; onSuspend: () => void; onInvite: () => void; onReactivate: () => void; onArchive: () => void;
}

function Flags({ gym, risk }: { gym: PlatformGym; risk?: Risk }) {
  // One line, the most pressing first (2026-11-08): a row of chips made a flagged card taller than its row-mates,
  // so the cards a page could not be counted. Every warning is still in the line's tooltip and on the gym's page.
  const all: { icon: typeof AlertTriangle; text: string }[] = [
    ...(risk ? [{ icon: AlertTriangle, text: `${risk.level === 'high' ? 'At risk' : 'Watch'}: ${risk.reasons[0]}` }] : []),
    ...(dueSoon(gym) ? [{ icon: CalendarClock, text: gym.days_left! < 0 ? `${-gym.days_left!} days late` : gym.days_left === 0 ? 'Due today' : `Due in ${gym.days_left} days` }] : []),
    ...(gym.owners === 0 ? [{ icon: KeyRound, text: 'Nobody can sign in yet' }] : []),
  ];
  // An empty line when there is nothing to warn about: every card is one height, so every page holds as many.
  if (!all.length) return <div className="gym-line gym-flag" aria-hidden="true" />;
  const Icon = all[0].icon;
  const tip = [...all.map((f) => f.text), ...(risk && risk.reasons.length > 1 ? risk.reasons.slice(1) : [])].join(' · ');
  return (
    <div className="gym-line gym-flag" title={tip} data-gym-flag>
      <Icon size={14} /><span className="gym-flag__text">{all[0].text}</span>
      {all.length > 1 && <span className="end">+{all.length - 1} more</span>}
    </div>
  );
}

/**
 * One gym. The card is a div with a button's role — never a <button>, because
 * it holds buttons of its own — and its footer buttons stop the click so they
 * open their own popup, not the quick view.
 */
function GymCard({ gym, photo, risk, busy, onOpen, onPlan, onBill, onSuspend, onInvite, onReactivate }: Omit<CardProps, 'onArchive'> & { onOpen: () => void; photo?: string }) {
  const stop = (fn: () => void) => (e: React.MouseEvent) => { e.stopPropagation(); fn(); };
  const warn = !!gym.lock_reason || risk?.level === 'high';
  /* A reveal tile (owner, 2026-11-23, like the admin's Exercises and Resources): the gym's own front photo behind a
     vignette, its name, status and first warning at rest; the figures and actions rise in under the pointer or focus.
     No photo: its logo blown up and blurred, else its colour and initials. */
  return (
    <div className={`gym-card gx-rv${warn ? ' warn' : ''}`} role="button" tabIndex={0} aria-label={`${gym.name}, open`}
      onClick={onOpen} data-has-photo={photo ? '' : undefined}
      onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onOpen(); } }}>
      <div className="gx-art" aria-hidden="true">
        {photo ? <img src={photo} alt="" loading="lazy" />
          : gym.logo_url ? <img className="gx-blur" src={gym.logo_url} alt="" loading="lazy" />
          : <span className="gx-big"><GymMark name={gym.name} logoUrl={null} accent={gym.accent} size={96} /></span>}
      </div>
      <div className="gx-corner"><GymStatus gym={gym} short /></div>
      <div className="gx-body">
      <div className="gx-head">
        <GymMark name={gym.name} logoUrl={gym.logo_url} accent={gym.accent} size={36} />
        <span className="gx-title">
          <span className="gx-name">{gym.name}</span>
          <span className="gx-slug">/join/{gym.slug}</span>
        </span>
      </div>
      <Flags gym={gym} risk={risk} />
      <div className="gx-more"><div>

      <div className="gx-figs">
        <div><b>{gym.members.toLocaleString('en-PH')}{gym.max_members !== null && <small> / {gym.max_members}</small>}</b><span>member{gym.members === 1 ? '' : 's'}</span></div>
        <div><b>{gym.staff}</b><span>on the desk</span></div>
        <div><b>{Number(gym.paid_total) > 0 ? peso(gym.paid_total) : '₱0'}</b><span>paid in all</span></div>
      </div>

      <dl className="gx-facts">
        <div><dt>Plan</dt><dd>{gym.plan_name ?? gym.plan}
          <span className={`gx-end${gym.days_left !== null && gym.days_left < 0 ? ' warn' : ''}`}>{gym.paid_until ? `to ${day(gym.paid_until)}` : 'no paid-until date'}</span></dd></div>
        <div><dt>Activity</dt><dd>{since(gym.last_activity)}</dd></div>
      </dl>

      <div className="gym-foot">
        {gym.owners === 0 && <button className="btn" disabled={busy} onClick={stop(onInvite)}>Invite the owner</button>}
        <button className="btn" disabled={busy} onClick={stop(onBill)}>Bill</button>
        <button className="btn ghost" disabled={busy} onClick={stop(onPlan)}>Plan</button>
        {gym.status === 'active'
          ? <button className="btn ghost" disabled={busy} onClick={stop(onSuspend)}>Suspend</button>
          : <button className="btn" disabled={busy} onClick={stop(onReactivate)}>{gym.status === 'archived' ? 'Restore' : 'Reactivate'}</button>}
        <span className="open">Details <ChevronRight size={14} /></span>
      </div>
      </div></div>
      </div>
    </div>
  );
}

/** The popup a card opens: the gym at a glance, its decisions, and its full page. */
function QuickView({ gym, risk, busy, onFull, onPlan, onBill, onSuspend, onInvite, onReactivate, onArchive }: CardProps & { onFull: () => void }) {
  const joined = day(gym.created_at);
  return (
    <div className="gx-qv">
      <header className="gx-qv-head">
        <GymMark name={gym.name} logoUrl={gym.logo_url} accent={gym.accent} size={52} />
        <div className="gx-title">
          <h2 className="gx-name">{gym.name}</h2>
          <span className="gx-slug">/join/{gym.slug} · on Core Fitness since {joined}</span>
        </div>
        <GymStatus gym={gym} />
      </header>

      <div className="gx-figs four">
        <div><b>{gym.members.toLocaleString('en-PH')}</b><span>{gym.max_members !== null ? `of ${gym.max_members} members` : 'members'}</span></div>
        <div><b>{gym.staff}</b><span>on the desk</span></div>
        <div><b>{gym.owners}</b><span>owner{gym.owners === 1 ? '' : 's'}</span></div>
        <div><b>{Number(gym.paid_total) > 0 ? peso(gym.paid_total) : '₱0'}</b><span>paid in all</span></div>
      </div>
      {gym.max_members !== null && (
        <div className="gx-cap" title={`${gym.members} of ${gym.max_members} members on this plan`}>
          <div className="meter"><span style={{ width: `${Math.min(100, (gym.members / Math.max(1, gym.max_members)) * 100)}%` }} /></div>
          <span>{Math.round((gym.members / Math.max(1, gym.max_members)) * 100)}% of the plan's members</span>
        </div>
      )}

      <dl className="gx-facts roomy">
        <div><dt>Plan</dt><dd>{gym.plan_name ?? gym.plan}{gym.price_monthly !== null ? ` · ${peso(gym.price_monthly)} a month` : ''}</dd></div>
        <div><dt>Paid until</dt><dd className={dueSoon(gym) ? 'warn' : undefined}>{gym.paid_until
          ? `${day(gym.paid_until)}${gym.days_left !== null ? (gym.days_left < 0 ? `, ${-gym.days_left} days late` : `, ${gym.days_left.toLocaleString('en-PH')} days left`) : ''}`
          : 'No paid-until date'}</dd></div>
        <div><dt>Activity</dt><dd>{since(gym.last_activity)}</dd></div>
        <div><dt>Set up</dt><dd>{gym.owners === 0 ? 'Nobody can sign in yet, invite the owner'
          : !gym.onboarded ? 'The owner has not finished setting the gym up' : 'Done'}</dd></div>
      </dl>

      {risk && (
        <div className="gx-watch">
          <span className="gx-watch-h"><AlertTriangle size={14} /> {risk.level === 'high' ? 'At risk of leaving' : 'Worth watching'}</span>
          <ul>{risk.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
        </div>
      )}

      <footer className="qv-actions gx-qv-foot">
        <button className="btn" onClick={onFull}><ExternalLink size={14} /> Open its full page</button>
        {gym.owners === 0 && <button className="btn ghost" disabled={busy} onClick={onInvite}>Invite the owner</button>}
        <span className="grow-gap" />
        <button className="btn" disabled={busy} onClick={onBill}>Bill this gym</button>
        <button className="btn ghost" disabled={busy} onClick={onPlan}>Change plan</button>
        {gym.status === 'active'
          ? <button className="btn ghost" disabled={busy} onClick={onSuspend}>Suspend</button>
          : <button className="btn ghost" disabled={busy} onClick={onReactivate}>{gym.status === 'archived' ? 'Restore' : 'Reactivate'}</button>}
        {gym.status !== 'archived' && <button className="btn ghost" disabled={busy} onClick={onArchive}>Archive</button>}
      </footer>
    </div>
  );
}

function SortHead({ label, by, sort, onSort }: { label: string; by: Sort; sort: Sort; onSort: (s: Sort) => void }) {
  return <button type="button" className={sort === by ? 'on' : undefined} aria-pressed={sort === by} onClick={() => onSort(by)}>{label}</button>;
}

/** One gym as a line (List) or a table row (Details). A div with a button's role, like the card. */
function GymRow({ gym, details, on, onOpen }: { gym: PlatformGym; details: boolean; on: boolean; onOpen: () => void }) {
  const members = `${gym.members.toLocaleString('en-PH')}${gym.max_members !== null ? ` / ${gym.max_members}` : ''}`;
  return (
    <div className={`gx-row${details ? '' : ' gx-row-list'}${on ? ' on' : ''}`} role="button" tabIndex={0} aria-label={`${gym.name}, open`}
      onClick={onOpen} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } }}>
      <span className="gx-row-id">
        <GymMark name={gym.name} logoUrl={gym.logo_url} accent={gym.accent} size={details ? 26 : 30} />
        <span className="gx-title"><span className="gx-name">{gym.name}</span>{!details && <span className="gx-slug">/join/{gym.slug}</span>}</span>
      </span>
      <GymStatus gym={gym} />
      {details ? <>
        <span>{gym.plan_name ?? gym.plan}</span>
        <span className={gym.days_left !== null && gym.days_left < 0 ? 'warn' : undefined}>{gym.paid_until
          ? `${day(gym.paid_until)}, ${gym.days_left !== null && gym.days_left < 0 ? `${-gym.days_left} late` : `${gym.days_left ?? 0} left`}`
          : 'Not billed'}</span>
        <span>{members}</span>
        <span className="muted">{since(gym.last_activity)}</span>
      </> : <span className="muted gx-row-end">{members} members <ChevronRight size={14} /></span>}
    </div>
  );
}
