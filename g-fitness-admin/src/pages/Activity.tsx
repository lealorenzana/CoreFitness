import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  History, Calendar, CreditCard, CheckSquare, IdCard, Users,
  CalendarDays, X, ChevronRight, AlertTriangle, Archive,
  ShoppingBag, Dumbbell, Trophy, BadgeCheck,
} from 'lucide-react';
import Avatar from '../components/ui/Avatar';
import {
  RdHeader, RdCard, RdSelect, RdButton, SearchField, TableFooter, EmptyBlock, FitBody, IconTile,
} from '../components/ui/rd';
import { TONE } from '../components/ui/rdTokens';
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
 *
 * 2026-10-12: the kit's look — the filters in a rail, the entries in a box that
 * pages by what fits, the pager pinned under it.
 */

const SURFACE        = 'var(--color-surface)';
const LINE           = 'rgba(255,255,255,0.06)';
const TEXT_SECOND    = 'var(--color-text-secondary)';
const TEXT_MUTED     = 'var(--color-text-muted)';

/**
 * Entries per page when nothing has been measured yet. The real size comes
 * from the height the list is given — see `measureList`.
 */
const FALLBACK_PAGE_SIZE = 12;
/** One entry's height before any has rendered: two lines and its padding. */
const FALLBACK_ROW_PX = 60;
/**
 * A day heading plus the gap above the next day, before one has rendered.
 * Every page has at least one heading, so its room is always kept; a page
 * that crosses into a second day scrolls a few pixels inside the list rather
 * than every page giving up a row it usually does not need.
 */
const FALLBACK_HEADING_PX = 32;

const GROUPS: Array<{ id: ActivityGroup; label: string; icon: typeof Calendar }> = [
  { id: 'bookings',    label: 'Bookings',    icon: Calendar },
  { id: 'payments',    label: 'Payments',    icon: CreditCard },
  { id: 'attendance',  label: 'Check-ins',   icon: CheckSquare },
  { id: 'memberships', label: 'Memberships', icon: IdCard },
  { id: 'accounts',    label: 'Accounts',    icon: Users },
  { id: 'schedule',    label: 'Schedule',    icon: CalendarDays },
  { id: 'shop',        label: 'Shop',        icon: ShoppingBag },
  { id: 'coaching',    label: 'Coaching',    icon: Dumbbell },
  { id: 'engagement',  label: 'Rewards & streaks', icon: Trophy },
  { id: 'team',        label: 'Team & settings', icon: BadgeCheck },
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
  return /\.(cancelled|deleted|undone|rejected|suspended|archived|amended|price_changed|role_changed|sale_voided|stock_damage|request_declined|refund|change_undone)$/.test(action);
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
  const [rawPage, setPage] = useState(1);

  /**
   * As many entries per page as the list's box has room for, so the pager sits
   * at the bottom of the window instead of forty entries further down the page.
   * The box's height comes from the page layout (it is `flex-1 min-h-0`), never
   * from the entries, so this cannot chase itself. A ResizeObserver on a ref
   * callback rather than an effect: nothing sets state during a render, and
   * React 19 calls the returned cleanup.
   */
  const [fit, setFit] = useState<{ box: number; row: number; heading: number } | null>(null);
  const measureList = useCallback((box: HTMLDivElement | null) => {
    if (!box) return;
    const measure = () => {
      const heights = [...box.querySelectorAll('[data-activity-row]')]
        .map((r) => r.getBoundingClientRect().height)
        .filter((h) => h > 0)
        .sort((a, b) => a - b);
      // The median entry: one with a wrapped summary stands taller, and
      // dividing by it would lose rows on every screen. While the skeleton is
      // showing there are no entries to measure, so the last measurement
      // stands — falling back to the estimate there would change the page
      // size, refetch, show the skeleton again, and go round for ever.
      const measured = heights.length ? Math.round(heights[Math.floor(heights.length / 2)]) : null;
      const head = box.querySelector('[data-activity-day]');
      // The heading's own height plus its bottom margin. The page's first day
      // has no gap above it; a second day's 16px gap is the overflow case.
      const measuredHeading = head ? Math.round(head.getBoundingClientRect().height + 4) : null;
      const h = Math.round(box.clientHeight);
      setFit((prev) => {
        const row = measured ?? prev?.row ?? FALLBACK_ROW_PX;
        const heading = measuredHeading ?? prev?.heading ?? FALLBACK_HEADING_PX;
        return prev && prev.box === h && prev.row === row && prev.heading === heading
          ? prev : { box: h, row, heading };
      });
    };
    const observer = new ResizeObserver(measure);
    const watch = () => {
      observer.disconnect();
      observer.observe(box);
      if (box.firstElementChild) observer.observe(box.firstElementChild);
    };
    // The box's child is swapped — skeleton, entries, empty state — without the
    // box itself changing size, so a resize alone would never re-measure the
    // entries. Observing a new element reports it once, which measures.
    const swaps = new MutationObserver(watch);
    swaps.observe(box, { childList: true });
    watch();
    return () => { swaps.disconnect(); observer.disconnect(); };
  }, []);
  const pageSize = fit
    ? Math.max(5, Math.floor((fit.box - fit.heading) / fit.row))
    : FALLBACK_PAGE_SIZE;
  // Clamped during render, never corrected in an effect: a taller window can
  // shrink the page count under whatever page is open.
  const page = total === null ? rawPage : Math.min(rawPage, Math.max(1, Math.ceil(total / pageSize)));

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
      limit: pageSize,
      offset: (page - 1) * pageSize,
    };
  }, [group, range, role, actorId, debounced, liveOnly, page, pageSize]);

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

  /**
   * Grouped by Manila calendar day, preserving the server's ordering.
   *
   * A day's win-back sends are ONE line (2026-10-10). The sweep messages
   * everyone it applies to at once, and a line per member made the log read
   * as if the gym were messaging the same people every day — it was 64
   * different members, once each.
   */
  const days = useMemo(() => {
    const out: Array<{ key: string; label: string; items: ActivityFeedRow[]; winback: ActivityFeedRow[] }> = [];
    for (const row of rows) {
      const d = new Date(row.occurred_at);
      const key = dateKey(d);
      let last = out[out.length - 1];
      if (last?.key !== key) { last = { key, label: dayFmt.format(d), items: [], winback: [] }; out.push(last); }
      if (row.action === 'winback.sent') last.winback.push(row); else last.items.push(row);
    }
    return out;
  }, [rows]);
  const [openWinback, setOpenWinback] = useState<string | null>(null);

  const filtersActive = group !== null || role !== null || actorId !== '' || debounced !== '' || liveOnly;

  const clearFilters = () => {
    setGroup(null); setRole(null); setActorId(''); setSearch(''); setLiveOnly(false);
  };

  /** One rail filter: a full-width row, violet when on. */
  const railBtn = (on: boolean): React.CSSProperties => ({
    background: on ? TONE.violet.bg : 'transparent',
    border: `1px solid ${on ? TONE.violet.line : 'transparent'}`,
    color: on ? '#EDE9FE' : TEXT_SECOND,
  });

  const rail = (
    <RdCard className="p-3" data-activity-filters>
      <p className="text-[12.5px] font-semibold px-2 pt-1 pb-2" style={{ color: TEXT_MUTED }}>What happened</p>
      <div className="flex flex-col gap-0.5">
        <button type="button" onClick={() => setGroup(null)} className="h-9 px-2.5 rounded-lg text-[13.5px] font-medium flex items-center gap-2.5 text-left" style={railBtn(group === null)}>
          <History size={15} /> Everything
        </button>
        {GROUPS.map((g) => (
          <button key={g.id} type="button" onClick={() => setGroup(group === g.id ? null : g.id)}
            className="h-9 px-2.5 rounded-lg text-[13.5px] font-medium flex items-center gap-2.5 text-left" style={railBtn(group === g.id)}>
            <g.icon size={15} /> {g.label}
          </button>
        ))}
      </div>
      <p className="text-[12.5px] font-semibold px-2 pt-4 pb-2" style={{ color: TEXT_MUTED }}>Who did it</p>
      <div className="flex flex-col gap-0.5">
        {ROLE_FILTERS.map((r) => (
          <button key={r.id} type="button" onClick={() => setRole(role === r.id ? null : r.id)}
            className="h-9 px-2.5 rounded-lg text-[13.5px] font-medium text-left" style={railBtn(role === r.id)}>
            {r.label}
          </button>
        ))}
      </div>
      <div className="mt-3 pt-3" style={{ borderTop: `1px solid ${LINE}` }}>
        <button type="button" onClick={() => setLiveOnly(!liveOnly)} aria-pressed={liveOnly}
          className="w-full h-9 px-2.5 rounded-lg text-[13.5px] font-medium text-left" style={railBtn(liveOnly)}
          data-tip="Hide entries reconstructed from data that predates the log">
          Recorded live only
        </button>
      </div>
    </RdCard>
  );

  // The filters ride in the rail; the entries take the rest and page by what fits.
  return (
    <div className="rd-fit" data-activity>
      <RdHeader title="Activity log"
        subtitle="Every change to a booking, payment, check-in, membership, account, plan or class — recorded by the database itself." />

      {unavailable ? (
        <RdCard className="rd-fit-fill">
          <EmptyBlock icon={Archive} title="The activity log is not available yet"
            body={<>Migration <span className="font-mono">0037_activity_log.sql</span> creates the table and its triggers. Run it in the Supabase SQL editor, then reload. Until then nothing is being recorded.</>} />
        </RdCard>
      ) : (
        <FitBody rail={rail}>
          <RdCard className="flex flex-col min-h-0 overflow-hidden rd-fit-fill" data-activity-list>
            <div className="flex flex-wrap items-center gap-2.5 px-4 py-3" style={{ borderBottom: `1px solid ${LINE}` }}>
              <div className="flex-1 min-w-[220px]">
                <SearchField value={search} onChange={setSearch} placeholder="Search the log — a name, a class, an amount" label="Search the log" />
              </div>
              <RdSelect label="When" value={range} onChange={(v) => setRange(v as RangeId)} className="w-[160px]">
                {RANGES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
              </RdSelect>
              <RdSelect label="Who" value={actorId} onChange={setActorId} className="w-[190px]">
                <option value="">Anyone</option>
                {actors.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </RdSelect>
              {filtersActive && <RdButton size="sm" variant="ghost" icon={X} onClick={clearFilters}>Clear</RdButton>}
            </div>

            {/* Measured by `measureList`. Always mounted — loading, empty or full — so the page
                size is known before the first fetch lands. */}
            <div ref={measureList} className="flex-1 min-h-0 overflow-y-auto px-4" style={{ scrollbarWidth: 'thin' }}>
            {loading ? (
              <div className="space-y-2 py-3">
                {Array.from({ length: Math.min(pageSize, 10) }).map((_, i) => (
                  <div key={i} className="h-12 rounded-lg animate-pulse" style={{ background: 'rgba(255,255,255,0.04)' }} />
                ))}
              </div>
            ) : rows.length === 0 ? (
              <EmptyBlock compact icon={History}
                title={filtersActive || range !== 'all' ? 'Nothing recorded that matches these filters' : 'Nothing recorded yet'}
                action={(filtersActive || range !== 'all')
                  ? <RdButton size="sm" variant="soft" onClick={() => { clearFilters(); setRange('all'); }}>Show everything</RdButton>
                  : undefined} />
            ) : (
                <div className="space-y-3 pb-2">
                  {days.map((day) => (
                    <div key={day.key}>
                      <p data-activity-day className="text-[12.5px] font-semibold py-2 sticky top-0 z-10"
                        style={{ color: TEXT_SECOND, background: SURFACE, borderBottom: `1px solid ${LINE}` }}>
                        {day.label}
                      </p>

                      {day.winback.length > 0 && (
                        <div data-winback-group className="py-2.5" style={{ borderBottom: `1px solid ${LINE}` }}>
                          <button type="button" className="flex items-start gap-3 w-full text-left"
                            onClick={() => setOpenWinback(openWinback === day.key ? null : day.key)} aria-expanded={openWinback === day.key}>
                            <IconTile icon={History} size={32} />
                            <span className="flex-1 min-w-0">
                              <span className="block text-[14px] text-white">
                                Win-back messages sent to {day.winback.length} {day.winback.length === 1 ? 'member' : 'members'}
                              </span>
                              <span className="block text-[12px] mt-0.5" style={{ color: TEXT_MUTED }}>
                                Automatic, at most one a member a month — {openWinback === day.key ? 'hide who' : 'show who'}
                              </span>
                            </span>
                          </button>
                          {openWinback === day.key && (
                            <ul className="mt-2 ml-11 space-y-1">
                              {day.winback.map((w) => (
                                <li key={w.id} className="text-[12.5px]" style={{ color: TEXT_SECOND }}>{w.summary}</li>
                              ))}
                            </ul>
                          )}
                        </div>
                      )}
                      {day.items.map((row) => {
                        const href = activityHref(row);
                        const g = groupForAction(row.action);
                        const Icon = g ? GROUP_ICON[g] : History;
                        const notable = isNotable(row.action);
                        return (
                          <div
                            key={row.id}
                            data-activity-row
                            onClick={() => href && navigate(href)}
                            role={href ? 'button' : undefined}
                            tabIndex={href ? 0 : undefined}
                            onKeyDown={(e) => { if (href && e.key === 'Enter') navigate(href); }}
                            className="flex items-center gap-3 py-2.5 px-1 -mx-1 rounded-lg group transition-colors hover:bg-white/[0.02]"
                            style={{ borderBottom: `1px solid rgba(255,255,255,0.04)`, cursor: href ? 'pointer' : 'default' }}
                          >
                            <IconTile icon={notable ? AlertTriangle : Icon} tone={notable ? 'amber' : 'violet'} size={32} />
                            <div className="flex-1 min-w-0">
                              <p className="text-[14px] text-white truncate">{row.summary}</p>
                              <div className="flex items-center gap-2 mt-0.5 flex-wrap text-[12px]" style={{ color: TEXT_MUTED }}>
                                <span className="tabular-nums">{timeFmt.format(new Date(row.occurred_at))}</span>
                                <span>—</span>
                                <span>{verbOf(row.action)}</span>
                                {/* Actor, only when known — "System" would be a guess about who acted. */}
                                {row.actor_name ? (
                                  <span className="flex items-center gap-1.5">
                                    <span>—</span>
                                    <Avatar name={row.actor_name} photoUrl={row.actor_photo_url} size={16} />
                                    <span style={{ color: TEXT_SECOND }}>
                                      {row.actor_name}
                                      {row.actor_role && <span style={{ color: TEXT_MUTED }}> ({row.actor_role === 'staff' ? 'front desk' : row.actor_role})</span>}
                                    </span>
                                  </span>
                                ) : row.reconstructed ? null : <><span>—</span><span>actor unknown</span></>}
                                {row.reconstructed && (
                                  <span className="px-1.5 rounded" style={{ border: `1px solid ${LINE}` }}
                                    data-tip="Reconstructed from timestamps that predate the log. The time is real; the actor was not recorded at the time.">
                                    reconstructed
                                  </span>
                                )}
                              </div>
                            </div>
                            {href && <ChevronRight size={16} className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: TEXT_MUTED }} />}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
            )}
            </div>

            {/* The pager, outside the scrolling list, so it is always on screen. `total` is null
                only if Postgres declined to count — then the page says how many it shows. */}
            {!loading && total !== null && total > 0 ? (
              <div style={{ borderTop: `1px solid ${LINE}` }}>
                <TableFooter page={page} perPage={pageSize} total={total} noun={total === 1 ? 'entry' : 'entries'} onPage={setPage} />
              </div>
            ) : !loading && total === null && rows.length > 0 ? (
              <p className="text-[13px] px-4 py-3" style={{ color: TEXT_MUTED, borderTop: `1px solid ${LINE}` }}>Showing {rows.length}</p>
            ) : null}
          </RdCard>
        </FitBody>
      )}
    </div>
  );
}
