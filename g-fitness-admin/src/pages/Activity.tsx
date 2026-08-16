import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  History, Search, Calendar, CreditCard, CheckSquare, IdCard, Users,
  CalendarDays, Filter, X, ChevronRight, AlertTriangle, Archive,
} from 'lucide-react';
import Card from '../components/ui/Card';
import Avatar from '../components/ui/Avatar';
import Pagination from '../components/ui/Pagination';
import { showErrorToast } from '../utils/toast';
import { dateKey, addDays } from '../utils/dates';
import {
  listActivity, listActivityActors, activityHref, groupForAction,
  type ActivityGroup, type ActivityQuery,
} from '../lib/api/activityLog';
import type { ActivityFeedRow, UserRole } from '../types/db';

/**
 * The audit trail (migration 0037): who did what, and when.
 *
 * Everything here is written by database triggers, so it covers actions taken
 * from the member app and from Edge Functions, not just from this dashboard.
 * There is no way to edit or delete an entry — `activity_log` has a SELECT
 * policy and nothing else — which is what makes it worth reading.
 *
 * Admin only, deliberately. Front-desk staff cannot see this page or the table
 * behind it: the point of the log is that the owner can review a shift.
 */

const SURFACE        = 'var(--color-surface)';
const SURFACE_RAISED = 'var(--color-surface-raised)';
const BORDER         = 'var(--color-border)';
const PRIMARY        = 'var(--color-primary)';
const PRIMARY_LIGHT  = 'var(--color-primary-light)';
const SECONDARY      = 'var(--color-secondary)';
const SECONDARY_BG   = 'var(--color-secondary-light)';
const TEXT_SECOND    = 'var(--color-text-secondary)';
const TEXT_MUTED     = 'var(--color-text-muted)';

const PAGE_SIZE = 40;

const GROUPS: Array<{ id: ActivityGroup; label: string; icon: typeof Calendar }> = [
  { id: 'bookings',    label: 'Bookings',    icon: Calendar },
  { id: 'payments',    label: 'Payments',    icon: CreditCard },
  { id: 'attendance',  label: 'Check-ins',   icon: CheckSquare },
  { id: 'memberships', label: 'Memberships', icon: IdCard },
  { id: 'accounts',    label: 'Accounts',    icon: Users },
  { id: 'schedule',    label: 'Schedule',    icon: CalendarDays },
];

const GROUP_ICON: Record<ActivityGroup, typeof Calendar> =
  Object.fromEntries(GROUPS.map((g) => [g.id, g.icon])) as Record<ActivityGroup, typeof Calendar>;

/** Presets rather than a date-range picker: these are the three questions
 *  anyone actually asks of a log. "All time" stays available. */
const RANGES = [
  { id: 'today', label: 'Today',        days: 0 },
  { id: '7d',    label: 'Last 7 days',  days: 6 },
  { id: '30d',   label: 'Last 30 days', days: 29 },
  { id: 'all',   label: 'All time',     days: null },
] as const;
type RangeId = (typeof RANGES)[number]['id'];

const ROLE_FILTERS: Array<{ id: UserRole; label: string }> = [
  { id: 'member',  label: 'Members' },
  { id: 'staff',   label: 'Front desk' },
  { id: 'admin',   label: 'Admins' },
  { id: 'trainer', label: 'Trainers' },
];

/**
 * An action that undoes, deletes or cancels something is what an owner is
 * scanning for. Amber, matching the "needs attention" treatment elsewhere.
 * Never red — the palette has no reds.
 */
function isNotable(action: string): boolean {
  return /\.(cancelled|deleted|undone|rejected|suspended|archived|amended|price_changed|role_changed)$/.test(action);
}

const timeFmt = new Intl.DateTimeFormat('en-PH', {
  timeZone: 'Asia/Manila', hour: 'numeric', minute: '2-digit',
});
const dayFmt = new Intl.DateTimeFormat('en-PH', {
  timeZone: 'Asia/Manila', weekday: 'long', month: 'long', day: 'numeric',
});

/** Turns `booking.cancelled` into `Cancelled` for the small type tag. */
function verbOf(action: string): string {
  const verb = action.split('.').slice(1).join(' ').replace(/_/g, ' ');
  return verb ? verb[0].toUpperCase() + verb.slice(1) : action;
}

export default function Activity() {
  const navigate = useNavigate();

  const [rows, setRows] = useState<ActivityFeedRow[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  /** Set when the log itself is unreachable — almost always 0037 not yet run. */
  const [unavailable, setUnavailable] = useState(false);
  const [actors, setActors] = useState<Array<{ id: string; name: string; role: UserRole | null }>>([]);

  const [group, setGroupState] = useState<ActivityGroup | null>(null);
  const [range, setRangeState] = useState<RangeId>('7d');
  const [role, setRoleState] = useState<UserRole | null>(null);
  const [actorId, setActorIdState] = useState<string>('');
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [liveOnly, setLiveOnlyState] = useState(false);
  const [page, setPage] = useState(1);

  /**
   * Any filter change invalidates the current page number — staying on page 4 of
   * a result set that now has one page shows an empty list that reads as "no
   * matches". The reset happens **in the setters**, not in an effect watching
   * the filters: an effect would render the wrong page once and then correct
   * itself, which is a visible flash of the wrong empty state as well as the
   * cascading render `react-hooks/set-state-in-effect` warns about.
   */
  const setGroup    = (v: ActivityGroup | null) => { setGroupState(v);    setPage(1); };
  const setRange    = (v: RangeId)              => { setRangeState(v);    setPage(1); };
  const setRole     = (v: UserRole | null)      => { setRoleState(v);     setPage(1); };
  const setActorId  = (v: string)               => { setActorIdState(v);  setPage(1); };
  const setLiveOnly = (v: boolean)              => { setLiveOnlyState(v); setPage(1); };

  useEffect(() => {
    // Search resets the page when the debounce actually fires, not on keystroke
    // — the query has not changed until then.
    const t = setTimeout(() => { setDebounced(search); setPage(1); }, 220);
    return () => clearTimeout(t);
  }, [search]);

  const query = useMemo((): ActivityQuery => {
    const days = RANGES.find((r) => r.id === range)?.days ?? null;
    return {
      group: group ?? undefined,
      actorRole: role ?? undefined,
      actorId: actorId || undefined,
      search: debounced.trim() || undefined,
      liveOnly: liveOnly || undefined,
      // Local midnight, via the project's date helpers — never `toISOString()`,
      // which would put the boundary at 8am Manila and drop the morning's rows.
      from: days === null ? undefined : new Date(`${addDays(dateKey(new Date()), -days)}T00:00:00`).toISOString(),
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    };
  }, [group, range, role, actorId, debounced, liveOnly, page]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listActivity(query);
      setRows(res.rows);
      setTotal(res.total);
      setUnavailable(false);
    } catch (err) {
      setRows([]);
      setTotal(null);
      setUnavailable(true);
      showErrorToast(err instanceof Error ? err.message : 'Could not load the activity log');
    } finally {
      setLoading(false);
    }
  }, [query]);

  // `load` sets a loading flag before awaiting, which is exactly what the
  // skeleton needs and exactly what this rule flags. The rule is aimed at state
  // synced *from* other state; this is a fetch whose in-flight status is real UI
  // state, and the alternative it suggests is a data-fetching library this
  // project does not use. Every other page here fetches the same way.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    // Independent of the main list: an empty actor dropdown must not stop the
    // log itself from rendering.
    listActivityActors().then(setActors).catch(() => setActors([]));
  }, []);

  /** Grouped by Manila calendar day, preserving the server's ordering. */
  const days = useMemo(() => {
    const out: Array<{ key: string; label: string; items: ActivityFeedRow[] }> = [];
    for (const row of rows) {
      const d = new Date(row.occurred_at);
      const key = dateKey(d);
      const last = out[out.length - 1];
      if (last?.key === key) last.items.push(row);
      else out.push({ key, label: dayFmt.format(d), items: [row] });
    }
    return out;
  }, [rows]);

  const filtersActive = group !== null || role !== null || actorId !== '' || debounced !== '' || liveOnly;

  const clearFilters = () => {
    setGroup(null); setRole(null); setActorId(''); setSearch(''); setLiveOnly(false);
  };

  const chip = (active: boolean): React.CSSProperties => ({
    background: active ? PRIMARY : SURFACE_RAISED,
    border: `1px solid ${active ? PRIMARY : BORDER}`,
    color: active ? '#FFFFFF' : TEXT_SECOND,
  });

  return (
    <div className="p-6 space-y-5">
      <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2.5">
          <History size={22} style={{ color: PRIMARY }} />
          Activity log
        </h1>
        <p className="text-sm mt-1" style={{ color: TEXT_SECOND }}>
          Every change to a booking, payment, check-in, membership, account, plan or
          class — recorded by the database itself, from whichever app it came from.
        </p>
      </motion.div>

      {unavailable ? (
        <Card>
          <div className="py-12 text-center">
            <Archive size={38} className="mx-auto mb-3" style={{ color: TEXT_MUTED }} />
            <p className="text-sm text-white font-medium">The activity log is not available yet</p>
            <p className="text-xs mt-2 max-w-md mx-auto" style={{ color: TEXT_SECOND }}>
              Migration <span className="font-mono">0037_activity_log.sql</span> creates the
              table and its triggers. Run it in the Supabase SQL editor, then reload this page.
              Until then nothing is being recorded.
            </p>
          </div>
        </Card>
      ) : (
        <>
          <Card>
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <div
                  className="flex items-center gap-2 h-9 px-3 rounded-lg flex-1 min-w-[220px]"
                  style={{ background: SURFACE_RAISED, border: `1px solid ${BORDER}` }}
                >
                  <Search size={14} style={{ color: TEXT_MUTED }} />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search the log — a name, a class, an amount…"
                    className="flex-1 bg-transparent text-sm text-white outline-none placeholder:text-[var(--color-text-muted)]"
                  />
                  {search && (
                    <button onClick={() => setSearch('')} style={{ color: TEXT_MUTED }} aria-label="Clear search">
                      <X size={14} />
                    </button>
                  )}
                </div>

                <select
                  value={range}
                  onChange={(e) => setRange(e.target.value as RangeId)}
                  className="h-9 px-3 rounded-lg text-sm outline-none"
                  style={{ background: SURFACE_RAISED, border: `1px solid ${BORDER}`, color: TEXT_SECOND, colorScheme: 'dark' }}
                >
                  {RANGES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
                </select>

                <select
                  value={actorId}
                  onChange={(e) => setActorId(e.target.value)}
                  className="h-9 px-3 rounded-lg text-sm outline-none max-w-[190px]"
                  style={{ background: SURFACE_RAISED, border: `1px solid ${BORDER}`, color: TEXT_SECOND, colorScheme: 'dark' }}
                >
                  <option value="">Anyone</option>
                  {actors.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>

                {filtersActive && (
                  <button
                    onClick={clearFilters}
                    className="h-9 px-3 rounded-lg text-sm flex items-center gap-1.5"
                    style={{ background: SURFACE_RAISED, border: `1px solid ${BORDER}`, color: TEXT_SECOND }}
                  >
                    <X size={13} /> Clear
                  </button>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <Filter size={13} style={{ color: TEXT_MUTED }} />
                <button
                  onClick={() => setGroup(null)}
                  className="h-7 px-2.5 rounded-full text-xs font-medium transition-colors"
                  style={chip(group === null)}
                >
                  Everything
                </button>
                {GROUPS.map((g) => (
                  <button
                    key={g.id}
                    onClick={() => setGroup(group === g.id ? null : g.id)}
                    className="h-7 px-2.5 rounded-full text-xs font-medium flex items-center gap-1.5 transition-colors"
                    style={chip(group === g.id)}
                  >
                    <g.icon size={12} /> {g.label}
                  </button>
                ))}

                <span className="w-px h-5 mx-1" style={{ background: BORDER }} />

                {ROLE_FILTERS.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => setRole(role === r.id ? null : r.id)}
                    className="h-7 px-2.5 rounded-full text-xs font-medium transition-colors"
                    style={chip(role === r.id)}
                  >
                    {r.label}
                  </button>
                ))}

                <span className="w-px h-5 mx-1" style={{ background: BORDER }} />

                <button
                  onClick={() => setLiveOnly(!liveOnly)}
                  className="h-7 px-2.5 rounded-full text-xs font-medium transition-colors"
                  style={chip(liveOnly)}
                  title="Hide entries reconstructed from data that predates the log"
                >
                  Recorded live only
                </button>
              </div>
            </div>
          </Card>

          <Card>
            {loading ? (
              <div className="space-y-2 py-2">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="h-12 rounded-lg animate-pulse" style={{ background: SURFACE_RAISED }} />
                ))}
              </div>
            ) : rows.length === 0 ? (
              <div className="py-14 text-center">
                <History size={38} className="mx-auto mb-3" style={{ color: TEXT_MUTED }} />
                <p className="text-sm" style={{ color: TEXT_SECOND }}>
                  {filtersActive || range !== 'all'
                    ? 'Nothing recorded that matches these filters'
                    : 'Nothing recorded yet'}
                </p>
                {(filtersActive || range !== 'all') && (
                  <button
                    onClick={() => { clearFilters(); setRange('all'); }}
                    className="text-xs mt-2.5 font-medium"
                    style={{ color: PRIMARY }}
                  >
                    Show everything
                  </button>
                )}
              </div>
            ) : (
              <>
                <p className="text-xs mb-3" style={{ color: TEXT_MUTED }}>
                  {/* `total` is null only if Postgres declined to count. Say so
                      rather than printing the page size as if it were the total. */}
                  {total === null
                    ? `Showing ${rows.length}`
                    : `${total.toLocaleString()} ${total === 1 ? 'entry' : 'entries'}`}
                </p>

                <div className="space-y-5">
                  {days.map((day) => (
                    <div key={day.key}>
                      <p
                        className="text-xs font-semibold uppercase tracking-wide pb-2 mb-1 sticky top-16 z-10"
                        style={{ color: TEXT_MUTED, background: SURFACE, borderBottom: `1px solid ${BORDER}` }}
                      >
                        {day.label}
                      </p>

                      {day.items.map((row) => {
                        const href = activityHref(row);
                        const g = groupForAction(row.action);
                        const Icon = g ? GROUP_ICON[g] : History;
                        const notable = isNotable(row.action);
                        return (
                          <div
                            key={row.id}
                            onClick={() => href && navigate(href)}
                            role={href ? 'button' : undefined}
                            tabIndex={href ? 0 : undefined}
                            onKeyDown={(e) => { if (href && e.key === 'Enter') navigate(href); }}
                            className="flex items-start gap-3 py-2.5 group"
                            style={{
                              borderBottom: `1px solid ${BORDER}`,
                              cursor: href ? 'pointer' : 'default',
                            }}
                          >
                            <span
                              className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
                              style={{ background: notable ? SECONDARY_BG : PRIMARY_LIGHT }}
                            >
                              {notable
                                ? <AlertTriangle size={14} style={{ color: SECONDARY }} />
                                : <Icon size={14} style={{ color: PRIMARY }} />}
                            </span>

                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-white">{row.summary}</p>
                              <div className="flex items-center gap-2 mt-1 flex-wrap">
                                <span className="text-xs" style={{ color: TEXT_MUTED }}>
                                  {timeFmt.format(new Date(row.occurred_at))}
                                </span>
                                <span className="text-xs" style={{ color: TEXT_MUTED }}>·</span>
                                <span className="text-xs" style={{ color: TEXT_MUTED }}>
                                  {verbOf(row.action)}
                                </span>

                                {/* Actor. Rendered only when known — a
                                    reconstructed row often has none, and
                                    "System" would be a guess about who acted. */}
                                {row.actor_name ? (
                                  <span className="flex items-center gap-1.5">
                                    <span className="text-xs" style={{ color: TEXT_MUTED }}>·</span>
                                    <Avatar name={row.actor_name} photoUrl={row.actor_photo_url} size={16} />
                                    <span className="text-xs" style={{ color: TEXT_SECOND }}>
                                      {row.actor_name}
                                      {row.actor_role && (
                                        <span style={{ color: TEXT_MUTED }}>
                                          {' '}({row.actor_role === 'staff' ? 'front desk' : row.actor_role})
                                        </span>
                                      )}
                                    </span>
                                  </span>
                                ) : row.reconstructed ? null : (
                                  <>
                                    <span className="text-xs" style={{ color: TEXT_MUTED }}>·</span>
                                    <span className="text-xs" style={{ color: TEXT_MUTED }}>actor unknown</span>
                                  </>
                                )}

                                {row.reconstructed && (
                                  <span
                                    className="text-xs px-1.5 py-0.5 rounded"
                                    style={{ background: SURFACE_RAISED, color: TEXT_MUTED, border: `1px solid ${BORDER}` }}
                                    title="Reconstructed from timestamps that predate the log. The time is real; the actor was not recorded at the time."
                                  >
                                    reconstructed
                                  </span>
                                )}
                              </div>
                            </div>

                            {href && (
                              <ChevronRight
                                size={15}
                                className="flex-shrink-0 mt-2 opacity-0 group-hover:opacity-100 transition-opacity"
                                style={{ color: TEXT_MUTED }}
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>

                {total !== null && (
                  <Pagination
                    currentPage={page}
                    totalItems={total}
                    itemsPerPage={PAGE_SIZE}
                    onPageChange={setPage}
                  />
                )}
              </>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
