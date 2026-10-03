import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Building2, CalendarDays, Download, History, ListFilter, Search, UserRound, X } from 'lucide-react';
import { listGyms, type PlatformGym } from '../lib/platform';
import { eventActions, searchEvents, type EventFilter, type LoggedEvent } from '../lib/insight';
import { downloadCsv } from '../lib/csv';
import Tiles from '../components/Tiles';
import Pagination from '../components/Pagination';
import InfoDot from '../components/InfoDot';
import Modal from '../components/Modal';
import EventDetail from '../components/EventDetail';

const PER_PAGE = 25;
const stamp = (iso: string) => new Date(iso).toLocaleString('en-PH', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
/** "gym.paid" → "Gym paid"; the family is the part before the dot. */
const say = (a: string) => a.replace(/[._]/g, ' ').replace(/^./, (c) => c.toUpperCase());
const family = (a: string) => a.split('.')[0];
const manilaDay = (offsetDays = 0) => new Date(Date.now() + 8 * 3_600_000 - offsetDays * 86_400_000).toISOString().slice(0, 10);

/**
 * Everything the platform did (0106's log, searchable from 0140): every gym let
 * in, suspended, paid, re-planned, exported; every setting changed. Filter by
 * words, gym, kind of action and Manila dates; export what you filtered.
 */
export default function Activity() {
  const [f, setF] = useState<EventFilter>({ q: '', gym: null, action: null, from: null, to: null });
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<LoggedEvent[] | null>(null);
  const [actions, setActions] = useState<{ action: string; n: number }[]>([]);
  const [gyms, setGyms] = useState<PlatformGym[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<LoggedEvent | null>(null);

  useEffect(() => {
    void (async () => {
      setGyms(await listGyms().catch(() => []));
      setActions(await eventActions().catch(() => []));
    })();
  }, []);
  // Typing settles for a moment before it searches.
  useEffect(() => {
    const t = window.setTimeout(() => { setF((x) => ({ ...x, q })); setPage(1); }, 250);
    return () => window.clearTimeout(t);
  }, [q]);

  const load = useCallback(async () => {
    try { setRows(await searchEvents({ ...f, limit: PER_PAGE, offset: (page - 1) * PER_PAGE })); setError(null); }
    catch (e) { setRows([]); setError(e instanceof Error && /platform_events_search/.test(e.message) ? 'Paste migration 0140 to search the log.' : (e as Error).message); }
  }, [f, page]);
  useEffect(() => { void (async () => { await load(); })(); }, [load]);

  const set = (patch: Partial<EventFilter>) => { setF((x) => ({ ...x, ...patch })); setPage(1); };
  const total = rows?.[0]?.total ?? 0;
  const families = Object.entries(actions.reduce<Record<string, number>>((m, a) => ({ ...m, [family(a.action)]: (m[family(a.action)] ?? 0) + a.n }), {}))
    .sort((a, b) => b[1] - a[1]);
  const filtered = !!(f.q || f.gym || f.action || f.from || f.to);

  const exportAll = async () => {
    const all = await searchEvents({ ...f, limit: 500, offset: 0 });
    downloadCsv('core-fitness-activity', all, [
      ['When', (e) => e.created_at], ['Gym', (e) => e.gym_name], ['Action', (e) => e.action], ['What happened', (e) => e.summary],
      ['Reason', (e) => (typeof e.detail?.reason === 'string' ? e.detail.reason : null)], ['By', (e) => e.actor_name],
    ]);
  };

  return (
    <>
      <Tiles items={[
        { icon: History, value: count(actions.reduce((n, a) => n + a.n, 0)), label: 'Events, ever', tip: 'Everything the platform has recorded since 0106' },
        { icon: CalendarDays, value: rows ? count(total) : '…', label: filtered ? 'Match your filters' : 'In view', tip: 'How many events the list below holds, across every page' },
        { icon: Building2, value: count(families.find(([k]) => k === 'gym')?.[1] ?? 0), label: 'About gyms', onClick: () => set({ action: 'gym' }), on: f.action === 'gym', tip: 'Let in, suspended, paid, re-planned, exported' },
        { icon: ListFilter, value: count(families.length), label: 'Kinds of action', tip: families.map(([k, n]) => `${say(k)}: ${n}`).join('\n') || 'None yet' },
      ]} />

      <div className="toolbar act-filters">
        <label className="search" style={{ width: 260, margin: 0 }} aria-label="Search the log">
          <Search size={15} />
          <input value={q} placeholder="Words in what happened" onChange={(e) => setQ(e.target.value)} />
        </label>
        <select aria-label="Gym" value={f.gym ?? ''} onChange={(e) => set({ gym: e.target.value || null })} style={{ width: 190 }}>
          <option value="">Every gym</option>
          {gyms.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
        <select aria-label="Action" value={f.action ?? ''} onChange={(e) => set({ action: e.target.value || null })} style={{ width: 210 }}>
          <option value="">Every action</option>
          {families.map(([k, n]) => <option key={k} value={k}>{say(k)} — all ({n})</option>)}
          {actions.map((a) => <option key={a.action} value={a.action}>{say(a.action)} ({a.n})</option>)}
        </select>
        <input type="date" aria-label="From" value={f.from ?? ''} max={f.to ?? undefined} onChange={(e) => set({ from: e.target.value || null })} style={{ width: 160 }} data-tip="From this Manila day" />
        <input type="date" aria-label="To" value={f.to ?? ''} min={f.from ?? undefined} onChange={(e) => set({ to: e.target.value || null })} style={{ width: 160 }} data-tip="To this Manila day" />
        <div className="filters">
          <button type="button" onClick={() => set({ from: manilaDay(0), to: manilaDay(0) })}>Today</button>
          <button type="button" onClick={() => set({ from: manilaDay(6), to: null })}>7 days</button>
          <button type="button" onClick={() => set({ from: manilaDay(29), to: null })}>30 days</button>
        </div>
        {filtered && <button className="btn ghost" onClick={() => { setQ(''); setF({ q: '', gym: null, action: null, from: null, to: null }); setPage(1); }}><X size={14} /> Clear</button>}
        <span className="spacer" />
        <button className="btn ghost" disabled={!total} onClick={() => void exportAll()} data-tip="Everything matching the filters, up to 500 events"><Download size={15} /> Export CSV</button>
      </div>

      {error && <p className="err">{error}</p>}

      <section className="card act-card">
        <h2 className="section-title"><History size={14} /> {filtered ? 'Matching events' : 'Every event, newest first'} <InfoDot tip="Written by the database itself when the platform acts — never by this screen, so it cannot be edited or skipped." /></h2>
        {rows === null ? <p className="empty">Loading…</p> : rows.length === 0 ? (
          <p className="empty"><History size={22} className="empty-icon" />{filtered ? 'Nothing matches.' : 'Nothing has happened yet.'}</p>
        ) : (
          <div className="act-list">
            {rows.map((e) => (
              <div key={e.id} className="act-row clickable" role="button" tabIndex={0} data-tip="Open the details"
                onClick={(ev) => { if (!(ev.target as HTMLElement).closest('a')) setOpen(e); }}
                onKeyDown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); setOpen(e); } }}>
                <span className={`act-kind k-${family(e.action)}`} data-tip={e.action}>{say(family(e.action))}</span>
                <span className="act-text">
                  <span className="act-summary">{e.summary}{typeof e.detail?.reason === 'string' && <em> — “{e.detail.reason as string}”</em>}</span>
                  <span className="act-meta">
                    {e.gym_id ? <Link to={`/gyms/${e.gym_id}`}><Building2 size={12} />{e.gym_name ?? 'a gym'}</Link> : <span><Building2 size={12} />the platform</span>}
                    {e.actor_name && <span><UserRound size={12} />{e.actor_name}</span>}
                  </span>
                </span>
                <time dateTime={e.created_at}>{stamp(e.created_at)}</time>
              </div>
            ))}
          </div>
        )}
        <Pagination page={page} perPage={PER_PAGE} total={total} noun={total === 1 ? 'event' : 'events'} onPage={setPage} />
      </section>

      <Modal open={!!open} onClose={() => setOpen(null)} size="md" title={open ? say(open.action) : ''}
        subtitle={open ? (open.gym_name ?? 'The platform') : undefined}>
        {open && <EventDetail event={open} />}
      </Modal>
    </>
  );
}

function count(n: number) { return n.toLocaleString('en-PH'); }
