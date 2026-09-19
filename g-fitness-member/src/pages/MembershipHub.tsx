import Avatar from '../components/ui/Avatar';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowsClockwise, CaretRight, Check, ClockCounterClockwise, EnvelopeSimple, Gear, Gift, Key,
  ListChecks, Minus, SignOut, UserCircle, Warning,
} from '@phosphor-icons/react';
import { Page } from '../components/ui/page';
import { Chip, Eyebrow, InlineStat, NocButton, Panel, ProgressBar, SectionHead, StatusPill } from '../components/ui/noc';
import Disclosure from '../components/ui/Disclosure';
import Modal from '../components/ui/Modal';
import { SkeletonList } from '../components/ui/Skeleton';
import { getCurrentMemberId } from '../services/bookingService';
import {
  getMembershipHub, type ActivityRow, type MembershipHub as Hub,
} from '../services/membershipHubService';
import { membershipTerm } from '../utils/membershipTerm';
import { errorMessage } from '../utils/errorMessage';
import { localDateKey } from '../utils/dates';
import { useLiveData } from '../hooks/useLiveData';
import { useSetTabHeader } from '../components/layout/tabHeaderStore';
import { readCache, writeCache } from '../lib/pageCache';
import { logout } from '../utils/auth';

const CACHE_KEY = 'member:membership';

function peso(n: number): string {
  return `₱${n.toLocaleString('en-PH')}`;
}

/** 'YYYY-MM-DD' parsed as local parts — `new Date('YYYY-MM-DD')` is read as UTC. */
function localDate(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

const shortDate = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

type Filter = 'all' | 'points' | 'payments';

/**
 * One line of the statement. Identical entries on the same day fold into one —
 * five "Logged a workout +15" rows said less than "Logged a workout ×5 · +75".
 */
interface Line {
  key: string;
  at: string;
  title: string;
  sub: string | null;
  amount: string;
  tone: string;
  kind: ActivityRow['kind'];
}

function toLines(rows: ActivityRow[]): Line[] {
  const out: (Line & { base: string; count: number; points: number })[] = [];
  for (const a of rows) {
    const day = localDateKey(a.at);
    if (a.kind === 'earned') {
      const prev = out[out.length - 1];
      if (prev && prev.kind === 'earned' && localDateKey(prev.at) === day && prev.base === a.title) {
        prev.count += 1;
        prev.points += a.points;
        prev.title = `${a.title} ×${prev.count}`;
        prev.amount = `+${prev.points}`;
        continue;
      }
      out.push({ key: `e:${a.at}`, at: a.at, kind: a.kind, title: a.title, base: a.title, sub: 'Points earned',
        amount: `+${a.points}`, tone: 'var(--color-primary-300)', count: 1, points: a.points });
    } else if (a.kind === 'spent') {
      out.push({ key: `s:${a.at}`, at: a.at, kind: a.kind, title: `Redeemed ${a.title.toLowerCase()}`,
        sub: a.status === 'pending' ? 'Requested — waiting for the desk'
          : a.status === 'fulfilled' ? 'Collected at the desk' : 'Approved — collect at the desk',
        amount: `−${a.points}`, tone: 'var(--color-text-muted)', base: '', count: 1, points: 0 });
    } else if (a.kind === 'paid') {
      out.push({ key: `p:${a.at}`, at: a.at, kind: a.kind, title: `Payment · ${a.method}`, sub: 'Recorded at the desk',
        amount: peso(a.amount), tone: 'var(--color-text-primary)', base: '', count: 1, points: 0 });
    } else {
      out.push({ key: `m:${a.at}`, at: a.at, kind: a.kind, title: a.title, sub: a.note, amount: '',
        tone: 'var(--color-text-muted)', base: '', count: 1, points: 0 });
    }
  }
  return out;
}

/**
 * You — the account, as one statement (Nocturne redesign 2026-09-16; reworked
 * 2026-09-19).
 *
 *   Membership     plan, status, the term bar, Renew — amber in the last week
 *   This term      visit days, classes, 1-on-1s and workouts since it started,
 *                  and how often you came — the same four figures the admin
 *                  drawer's Membership tab shows
 *   Points         balance, and how far to the next reward
 *   Activity       one statement, same-day repeats folded, filterable
 *   Folded         what the plan includes, membership history, account
 *
 * Every figure is a row: the term bar is `start_date → expiry_date` (never the
 * plan's nominal length, which a freeze credit makes wrong), the balance is the
 * SQL function that already nets out pending requests, and a source that fails
 * is named rather than thinning the list silently. Frozen replaces the term bar,
 * because the countdown is untrue while frozen (0057).
 */
export default function MembershipHub() {
  const navigate = useNavigate();
  const cached = readCache<Hub>(CACHE_KEY);
  const [hub, setHub] = useState<Hub | null>(cached ?? null);
  const [loading, setLoading] = useState(cached === undefined);
  const [error, setError] = useState<string | null>(null);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [showAll, setShowAll] = useState(false);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const id = await getCurrentMemberId();
      if (!id) throw new Error('Your session could not be verified. Please sign in again.');
      setHub(writeCache(CACHE_KEY, await getMembershipHub(id)));
      setError(null);
    } catch (err) {
      // Named, never degraded to zeros: "you have no membership" and "this did
      // not load" are different sentences and only one of them is true.
      if (!quiet) setError(errorMessage(err, 'Could not load your membership.'));
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  const revisit = useRef(cached !== undefined);
  useEffect(() => { void load(revisit.current); }, [load]);
  useLiveData(() => load(true));

  const home = hub?.home ?? null;
  useSetTabHeader('you', undefined, home ? (home.planName ?? 'No membership') : undefined);

  if (loading && !hub) return <Page><SkeletonList /></Page>;

  if (!hub || !home) {
    return (
      <Page>
        <p style={{ fontSize: 13, lineHeight: 1.55, color: 'var(--color-secondary)' }}>
          {error ?? 'Could not load your membership.'}
        </p>
        <NocButton variant="ghost" onClick={() => void load()}>Try again</NocButton>
      </Page>
    );
  }

  const term = membershipTerm(home.daysLeft, home.neverExpires);
  const termTotal = home.startDate && home.expiryDate
    ? Math.round((localDate(home.expiryDate).getTime() - localDate(home.startDate).getTime()) / 86_400_000)
    : null;

  const status: { label: string; tone: 'structure' | 'action' | 'muted' } =
    !home.planName ? { label: 'None', tone: 'muted' }
    : home.frozen ? { label: 'Frozen', tone: 'muted' }
    : home.expired ? { label: 'Expired', tone: 'action' }
    : home.cancelled ? { label: 'Cancelled', tone: 'action' }
    : home.expiringSoon ? { label: 'Ending soon', tone: 'action' }
    : { label: 'Active', tone: 'structure' };

  // ── Points ──
  const rewards = (hub.rewards ?? []).filter((r) => r.stock !== 0);
  const balance = hub.points;
  const nextUp = balance == null ? null : rewards.find((r) => r.costPoints > balance) ?? null;
  const canGet = balance == null ? 0 : rewards.filter((r) => r.costPoints <= balance).length;

  // ── Activity ──
  const lines = toLines(hub.activity.filter((a) =>
    filter === 'all' ? true
      : filter === 'points' ? a.kind === 'earned' || a.kind === 'spent'
      : a.kind === 'paid'));
  const shown = showAll ? lines.slice(0, 40) : lines.slice(0, 6);

  const t = hub.term;
  const rate = t && t.elapsedDays > 0 ? t.visitDays / t.elapsedDays : null;

  const account: { label: string; icon: typeof Gear; to: string }[] = [
    { label: 'Profile', icon: UserCircle, to: '/member/profile' },
    { label: 'Settings', icon: Gear, to: '/member/settings' },
    { label: 'Change password', icon: Key, to: '/member/change-password' },
    { label: 'Change email', icon: EnvelopeSimple, to: '/member/change-email' },
  ];

  return (
    <Page>
      {error && <p style={{ fontSize: 12.5, color: 'var(--color-secondary)' }}>{error}</p>}

      {/* ── Identity ── */}
      <button onClick={() => navigate('/member/profile/edit')} className="flex items-center text-left noc-press-soft" style={{ gap: 13 }}>
        <Avatar name={home.fullName} photoUrl={home.photoUrl} size={48} />
        <span className="min-w-0 flex-1">
          <span className="block truncate" style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-text-primary)' }}>{home.fullName}</span>
          <span className="block" style={{ fontSize: 12, marginTop: 2, color: 'var(--color-text-muted)' }}>
            {home.memberSince
              ? `Member since ${new Date(home.memberSince).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
              : 'Edit your profile'}
          </span>
        </span>
        <CaretRight size={15} style={{ color: 'var(--color-text-muted)' }} aria-hidden />
      </button>

      {/* ── Membership ── */}
      <Panel glow={status.tone === 'action' ? 'action' : 'structure'}>
        <div className="flex items-center justify-between" style={{ gap: 10 }}>
          <Eyebrow tone={status.tone === 'action' ? 'action' : undefined}>Membership</Eyebrow>
          <StatusPill label={status.label} tone={status.tone} />
        </div>
        <p style={{ fontSize: 24, fontWeight: 700, marginTop: 8, letterSpacing: '-0.02em', color: 'var(--color-text-primary)' }}>
          {home.planName ?? 'No membership'}
        </p>

        {home.frozen ? (
          <p style={{ marginTop: 8, fontSize: 13, lineHeight: 1.55, color: 'var(--color-text-secondary)' }}>
            You cannot check in or book while it is frozen, and the days you have left are kept for you.
            Ask the front desk to start it again.
          </p>
        ) : term.kind === 'countdown' && termTotal != null && termTotal > 0 && home.daysLeft != null ? (
          <>
            <div className="flex items-baseline justify-between" style={{ marginTop: 10, gap: 10 }}>
              <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
                <span style={{ fontSize: 20, fontWeight: 700, color: 'var(--color-text-primary)' }}>{home.daysLeft}</span>
                {' '}of {termTotal} days left{home.cancelled ? ' · cancelled' : ''}
              </span>
              {home.expiryDate && (
                <span style={{ fontSize: 12.5, color: 'var(--color-text-muted)' }}>
                  {home.cancelled ? 'access until' : 'ends'} {shortDate(localDate(home.expiryDate))}
                </span>
              )}
            </div>
            <ProgressBar style={{ marginTop: 9 }} fraction={home.daysLeft / termTotal}
              tone={home.expiringSoon || home.cancelled ? 'action' : 'structure'} />
          </>
        ) : term.kind === 'unlimited' ? (
          <p style={{ marginTop: 6, fontSize: 13, color: 'var(--color-text-secondary)' }}>Does not expire</p>
        ) : home.expired && home.expiryDate ? (
          <p style={{ marginTop: 6, fontSize: 13, color: 'var(--color-secondary)' }}>
            Ended {shortDate(localDate(home.expiryDate))} — you cannot check in or book until you renew.
          </p>
        ) : null}

        {(home.expiringSoon || home.expired) && !home.frozen && (
          <p className="flex items-start" style={{ gap: 8, marginTop: 12, fontSize: 12.5, lineHeight: 1.5, color: 'var(--color-secondary)' }}>
            <Warning size={15} weight="fill" className="flex-none" style={{ marginTop: 1 }} aria-hidden />
            {home.expired ? 'Renew at the front desk — payment is in cash.'
              : `Only ${home.daysLeft} ${home.daysLeft === 1 ? 'day' : 'days'} left. Renew at the front desk before it ends — payment is in cash.`}
          </p>
        )}

        {!home.frozen && home.planName && (
          <div className="flex" style={{ gap: 9, marginTop: 14 }}>
            <NocButton variant={home.expiringSoon || home.expired ? 'fill' : 'action'} className="flex-1"
              icon={<ArrowsClockwise size={15} />} onClick={() => navigate('/member/renew-membership')}>
              {home.expired ? 'Renew membership' : 'Renew or change plan'}
            </NocButton>
          </div>
        )}
      </Panel>

      {/* ── This term so far ── */}
      {t && !home.frozen && (
        <section>
          <SectionHead title="This term so far" meta={`${t.elapsedDays} ${t.elapsedDays === 1 ? 'day' : 'days'} in`} />
          <div className="grid" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 10, marginTop: 12 }}>
            <InlineStat value={t.visitDays} label={t.visitDays === 1 ? 'visit day' : 'visit days'} />
            <InlineStat value={t.classes} label={t.classes === 1 ? 'class' : 'classes'} />
            <InlineStat value={t.sessions} label="1-on-1" />
            <InlineStat value={t.workouts} label={t.workouts === 1 ? 'workout' : 'workouts'} />
          </div>
          {rate != null && (
            <>
              <ProgressBar style={{ marginTop: 14 }} fraction={rate} />
              <p style={{ fontSize: 12, marginTop: 7, color: 'var(--color-text-secondary)' }}>
                You came in on {Math.round(rate * 100)}% of the days so far
                {t.visitDays > 0 ? ` — about ${Math.round((t.visitDays / t.elapsedDays) * 7 * 10) / 10} a week` : ''}.
              </p>
            </>
          )}
        </section>
      )}

      {/* ── Points ── */}
      <Panel onClick={() => navigate('/member/rewards')} ariaLabel="CORE points — open rewards">
        <div className="flex items-center justify-between" style={{ gap: 12 }}>
          <div>
            <Eyebrow>CORE points</Eyebrow>
            <p style={{ fontSize: 34, fontWeight: 700, lineHeight: 1.1, marginTop: 6, letterSpacing: '-0.03em', color: 'var(--color-text-primary)' }}>
              {balance ?? '—'}
            </p>
          </div>
          <span className="inline-flex items-center flex-none" style={{ gap: 6, fontSize: 13, fontWeight: 600, color: 'var(--color-secondary)' }}>
            <Gift size={16} aria-hidden /> Spend
          </span>
        </div>
        {balance == null ? (
          <p style={{ fontSize: 12, marginTop: 4, color: 'var(--color-text-muted)' }}>Your balance could not be read.</p>
        ) : nextUp ? (
          <>
            <ProgressBar style={{ marginTop: 12 }} fraction={balance / nextUp.costPoints} />
            <p style={{ fontSize: 12, marginTop: 7, color: 'var(--color-text-secondary)' }}>
              {nextUp.costPoints - balance} to go for {nextUp.name}
              {canGet > 0 ? ` · ${canGet} ${canGet === 1 ? 'reward' : 'rewards'} you can get now` : ''}
            </p>
          </>
        ) : rewards.length > 0 ? (
          <p style={{ fontSize: 12, marginTop: 6, color: 'var(--color-primary-300)' }}>
            Enough for every reward on the list.
          </p>
        ) : (
          <p style={{ fontSize: 12, marginTop: 6, color: 'var(--color-text-muted)' }}>
            The gym has no rewards listed right now.
          </p>
        )}
      </Panel>

      {/* ── Activity ── */}
      <section>
        <SectionHead title="Activity" />
        <div className="flex" style={{ gap: 8, marginTop: 10 }}>
          <Chip label="All" on={filter === 'all'} onClick={() => { setFilter('all'); setShowAll(false); }} />
          <Chip label="Points" on={filter === 'points'} onClick={() => { setFilter('points'); setShowAll(false); }} />
          <Chip label="Payments" on={filter === 'payments'} onClick={() => { setFilter('payments'); setShowAll(false); }} />
        </div>
        {lines.length === 0 ? (
          <p style={{ padding: '12px 0', fontSize: 13, color: 'var(--color-text-muted)' }}>
            {filter === 'payments' ? 'No payments recorded yet — they appear here once the desk records one.'
              : 'Nothing yet. Check-ins and workouts earn points, and payments at the desk appear here.'}
          </p>
        ) : (
          <div className="noc-rows" style={{ marginTop: 4 }}>
            {shown.map((l, i) => (
              <div key={`${l.key}:${i}`} className="flex items-center" style={{
                gap: 12, padding: '12px 0', borderBottom: i === shown.length - 1 ? 'none' : '1px solid var(--color-separator)',
              }}>
                <span className="flex-none" style={{ width: 44, fontSize: 12, color: 'var(--color-text-secondary)' }}>
                  {shortDate(new Date(l.at))}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block truncate" style={{ fontSize: 14.5, fontWeight: 600, color: 'var(--color-text-primary)' }}>{l.title}</span>
                  {l.sub && <span className="block truncate" style={{ fontSize: 12, marginTop: 2, color: 'var(--color-text-muted)' }}>{l.sub}</span>}
                </span>
                {l.amount && <span className="flex-none" style={{ fontSize: 14, fontWeight: 600, color: l.tone }}>{l.amount}</span>}
              </div>
            ))}
          </div>
        )}
        {lines.length > 6 && (
          <button onClick={() => setShowAll((v) => !v)} style={{ marginTop: 10, fontSize: 13, fontWeight: 600, color: 'var(--color-primary-300)' }}>
            {showAll ? 'Show less' : `Show ${Math.min(lines.length, 40) - 6} more`}
          </button>
        )}
        {hub.activityGaps.length > 0 && (
          <p style={{ marginTop: 8, fontSize: 12, color: 'var(--color-secondary)' }}>
            Could not load {hub.activityGaps.join(' or ')} — this list may be missing entries.
          </p>
        )}
        <div className="flex flex-wrap" style={{ gap: '12px 20px', marginTop: 14, fontSize: 13 }}>
          <button onClick={() => navigate('/member/payments')} style={{ color: 'var(--color-primary-300)' }}>All payments</button>
          <button onClick={() => navigate('/member/rewards')} style={{ color: 'var(--color-primary-300)' }}>How you earn points</button>
          <button onClick={() => navigate('/member/attendance-history')} style={{ color: 'var(--color-primary-300)' }}>Attendance</button>
        </div>
      </section>

      {/* ── Folded: the plan, its history, the account ── */}
      <div className="flex flex-col" style={{ gap: 10 }}>
        {home.access && (
          <Disclosure title={`What ${home.planName ?? 'your plan'} includes`} icon={<ListChecks size={17} />}
            meta={home.access.excluded.length ? `${home.access.excluded.length} not included` : 'Everything'}>
            {home.access.included.map((item) => (
              <p key={item} className="flex items-start" style={{
                gap: 10, padding: '10px 0', borderBottom: '1px solid var(--color-separator)', fontSize: 14, color: 'var(--color-text-primary)',
              }}>
                <Check size={15} className="flex-none" style={{ marginTop: 2, color: 'var(--color-primary-400)' }} />
                {item}
              </p>
            ))}
            {home.access.excluded.map((item) => (
              <p key={item} className="flex items-start" style={{
                gap: 10, padding: '10px 0', borderBottom: '1px solid var(--color-separator)', fontSize: 14, color: 'var(--color-text-muted)',
              }}>
                <Minus size={15} className="flex-none" style={{ marginTop: 2 }} />
                {item} — not on this plan
              </p>
            ))}
            {!home.access.isFullAccess && (
              <NocButton variant="action" className="w-full" style={{ marginTop: 12 }} onClick={() => navigate('/member/renew-membership')}>
                Compare plans
              </NocButton>
            )}
          </Disclosure>
        )}

        {hub.events.length > 0 && (
          <Disclosure title="Membership history" icon={<ClockCounterClockwise size={17} />} meta={String(hub.events.length)}>
            {hub.events.map((e, i) => (
              <div key={e.id} style={{ padding: '10px 0', borderBottom: i === hub.events.length - 1 ? 'none' : '1px solid var(--color-separator)' }}>
                <p style={{ fontSize: 14, color: 'var(--color-text-primary)' }}>
                  {e.kind === 'freeze' ? 'Membership frozen' : e.kind === 'unfreeze' ? 'Membership restarted' : 'Membership cancelled'}
                </p>
                <p style={{ fontSize: 12, marginTop: 2, color: 'var(--color-text-muted)' }}>
                  {new Date(e.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  {e.reason ? ` · ${e.reason}` : ''}
                </p>
              </div>
            ))}
          </Disclosure>
        )}

        <Disclosure title="Account" icon={<UserCircle size={17} />}>
          {account.map(({ label, icon: Icon, to }) => (
            <button key={to} onClick={() => navigate(to)} className="w-full flex items-center text-left noc-press-soft"
              style={{ gap: 12, padding: '12px 0', borderBottom: '1px solid var(--color-separator)', fontSize: 14, color: 'var(--color-text-primary)' }}>
              <Icon size={17} style={{ color: 'var(--color-primary-300)' }} aria-hidden />
              <span className="flex-1">{label}</span>
              <CaretRight size={14} style={{ color: 'var(--color-text-muted)' }} aria-hidden />
            </button>
          ))}
          <button onClick={() => setConfirmLogout(true)} className="w-full flex items-center text-left noc-press-soft"
            style={{ gap: 12, padding: '12px 0', fontSize: 14, color: 'var(--color-text-secondary)' }}>
            <SignOut size={17} aria-hidden /> Log out
          </button>
        </Disclosure>
      </div>

      <Modal
        isOpen={confirmLogout}
        onClose={() => setConfirmLogout(false)}
        title="Log out"
        subtitle="You will need your email and password to get back in."
        confirmLabel="Log out"
        cancelLabel="Stay signed in"
        onConfirm={async () => {
          // `logout()` clears push, the session, every per-user key and both
          // caches — the one sign-out path. Nothing to add here.
          await logout();
          navigate('/');
        }}
      >
        <span />
      </Modal>
    </Page>
  );
}
