import Avatar from '../components/ui/Avatar';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Minus } from '@phosphor-icons/react';
import { Page } from '../components/ui/page';
import { Eyebrow, LineRow, NocButton, ProgressBar, SectionHead } from '../components/ui/noc';
import Modal from '../components/ui/Modal';
import { SkeletonList } from '../components/ui/Skeleton';
import { getCurrentMemberId } from '../services/bookingService';
import {
  getMembershipHub, type ActivityRow, type MembershipHub as Hub,
} from '../services/membershipHubService';
import { membershipTerm } from '../utils/membershipTerm';
import { errorMessage } from '../utils/errorMessage';
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

function activityLine(a: ActivityRow): { title: string; sub: string | null; amount: string; tone: string } {
  switch (a.kind) {
    case 'earned':
      return { title: a.title, sub: 'Points earned', amount: `+${a.points}`, tone: 'var(--color-primary-300)' };
    case 'spent':
      return {
        title: `Redeemed ${a.title.toLowerCase()}`,
        sub: a.status === 'pending' ? 'Requested — waiting for the desk'
          : a.status === 'fulfilled' ? 'Collected at the desk' : 'Approved — collect at the desk',
        amount: `−${a.points}`,
        tone: 'var(--color-text-muted)',
      };
    case 'paid':
      return { title: `Payment · ${a.method}`, sub: 'Recorded at the desk', amount: peso(a.amount), tone: 'var(--color-text-primary)' };
    case 'membership':
      return { title: a.title, sub: a.note, amount: '', tone: 'var(--color-text-muted)' };
  }
}

/**
 * You — the account, as one statement (Nocturne redesign, 2026-09-16).
 *
 * Membership, points and payments merge into one screen: who you are, the term
 * you are on, what you can spend, and what has moved. The four navigation tiles
 * are gone; their destinations are in the header rail.
 *
 * **The user asked (2026-09-16) for this screen to carry its content rather than
 * links to it**, so what the plan includes and the membership's history stay
 * here as sections — the prototype had shrunk both back to links.
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

  const rewards = hub.rewards ?? [];
  const balance = hub.points;
  const affordable = balance == null ? null
    : [...rewards].reverse().find((r) => r.costPoints <= balance && r.stock !== 0) ?? null;
  const nextUp = balance == null ? null
    : rewards.find((r) => r.costPoints > balance && r.stock !== 0) ?? null;

  const activity = hub.activity.slice(0, 8);

  return (
    <Page>
      {error && (
        <p style={{ fontSize: 12.5, color: 'var(--color-secondary)' }}>{error}</p>
      )}

      {/* ── Identity ── */}
      <button onClick={() => navigate('/member/profile/edit')} className="flex items-center text-left" style={{ gap: 13 }}>
        {/* The shared Avatar, so an uploaded photo shows. This was a hand-drawn
            initials disc that never looked at `photo_url` at all. */}
        <Avatar name={home.fullName} photoUrl={home.photoUrl} size={46} />
        <span className="min-w-0">
          <span className="block truncate" style={{ fontSize: 15, color: 'var(--color-text-primary)' }}>{home.fullName}</span>
          <span className="block" style={{ fontSize: 12, marginTop: 2, color: 'var(--color-text-muted)' }}>
            {home.memberSince
              ? `Member since ${new Date(home.memberSince).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
              : 'Edit your profile'}
          </span>
        </span>
      </button>

      {/* ── The term ── */}
      <section>
        <div className="flex items-baseline justify-between" style={{ gap: 12 }}>
          <span style={{ fontSize: 15, color: 'var(--color-text-primary)' }}>{home.planName ?? 'No membership'}</span>
          <span style={{ fontSize: 12.5, color: 'var(--color-text-muted)' }}>
            {home.frozen ? 'frozen'
              : term.kind === 'unlimited' ? 'no expiry'
              : home.expiryDate
                ? `${home.expired ? 'expired' : home.cancelled ? 'access until' : 'expires'} ${shortDate(localDate(home.expiryDate))}`
                : ''}
          </span>
        </div>

        {home.frozen ? (
          <p style={{ marginTop: 9, fontSize: 12.5, lineHeight: 1.55, color: 'var(--color-text-secondary)' }}>
            You cannot check in or book while it is frozen, and the days you have left are kept for you.
            Ask the front desk to start it again.
          </p>
        ) : term.kind === 'countdown' && termTotal != null && termTotal > 0 && home.daysLeft != null ? (
          <>
            <ProgressBar style={{ marginTop: 9 }} fraction={home.daysLeft / termTotal} />
            <div className="flex justify-between" style={{ marginTop: 7, fontSize: 12 }}>
              <span style={{ color: 'var(--color-text-secondary)' }}>
                {home.daysLeft === 0 ? 'Last day of this term' : `${home.daysLeft} of ${termTotal} days left`}
                {home.cancelled ? ' · cancelled' : ''}
              </span>
              <button onClick={() => navigate('/member/renew-membership')} style={{ color: 'var(--color-secondary)' }}>
                Renew
              </button>
            </div>
          </>
        ) : home.expired ? (
          <NocButton variant="fill" className="w-full" style={{ marginTop: 12 }}
            onClick={() => navigate('/member/renew-membership')}>
            Renew membership
          </NocButton>
        ) : null}
      </section>

      {/* ── Points ── */}
      <section className="flex items-end justify-between" style={{
        gap: 12, padding: '14px 0',
        borderTop: '1px solid rgba(233, 233, 237, 0.12)', borderBottom: '1px solid rgba(233, 233, 237, 0.12)',
      }}>
        <div>
          <p style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>CORE points</p>
          <p style={{ fontSize: 38, fontWeight: 500, lineHeight: 1.1, marginTop: 4, letterSpacing: '-0.03em', color: 'var(--color-text-primary)' }}>
            {balance ?? '—'}
          </p>
          {balance == null && (
            <p style={{ fontSize: 12, marginTop: 2, color: 'var(--color-text-muted)' }}>Your balance could not be read</p>
          )}
        </div>
        <div className="text-right min-w-0">
          {affordable && (
            <p className="truncate" style={{ fontSize: 12.5, color: 'var(--color-primary-300)' }}>
              {affordable.name} · {affordable.costPoints}
            </p>
          )}
          {nextUp && balance != null && (
            <p className="truncate" style={{ fontSize: 12, marginTop: 4, color: 'var(--color-text-secondary)' }}>
              {nextUp.name} · {nextUp.costPoints - balance} to go
            </p>
          )}
          <button onClick={() => navigate('/member/rewards')}
            style={{ fontSize: 12.5, marginTop: 7, color: 'var(--color-secondary)' }}>
            Spend points
          </button>
        </div>
      </section>

      {/* ── Activity ── */}
      <section>
        <SectionHead title="Activity" meta={balance != null ? `Balance ${balance}` : undefined} />
        {activity.length === 0 ? (
          <p style={{ padding: '12px 0', fontSize: 13, color: 'var(--color-text-muted)' }}>
            Nothing yet. Check-ins earn points, and payments at the desk appear here.
          </p>
        ) : (
          <div className="noc-rows" style={{ marginTop: 4 }}>
            {activity.map((a, i) => {
              const l = activityLine(a);
              return (
                <LineRow
                  key={`${a.kind}:${a.at}:${i}`}
                  gutterWidth={46}
                  gutter={<span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{shortDate(new Date(a.at))}</span>}
                  title={l.title}
                  meta={l.sub ?? undefined}
                  action={l.amount ? <span style={{ fontSize: 13.5, color: l.tone }}>{l.amount}</span> : undefined}
                  last={i === activity.length - 1}
                />
              );
            })}
          </div>
        )}
        {hub.activityGaps.length > 0 && (
          <p style={{ marginTop: 8, fontSize: 12, color: 'var(--color-secondary)' }}>
            Could not load {hub.activityGaps.join(' or ')} — this list may be missing entries.
          </p>
        )}
        <div className="flex flex-wrap" style={{ gap: '14px 20px', marginTop: 14, fontSize: 13 }}>
          <button onClick={() => navigate('/member/payments')} style={{ color: 'var(--color-primary-300)' }}>All payments</button>
          <button onClick={() => navigate('/member/rewards')} style={{ color: 'var(--color-primary-300)' }}>How you earn points</button>
          <button onClick={() => navigate('/member/attendance-history')} style={{ color: 'var(--color-primary-300)' }}>Attendance</button>
        </div>
      </section>

      {/* ── What the plan gets you — both halves ── */}
      {home.access && (
        <section>
          <SectionHead title={`What ${home.planName ?? 'your plan'} includes`} />
          <div style={{ marginTop: 6 }}>
            {home.access.included.map((item) => (
              <p key={item} className="flex items-start" style={{
                gap: 10, padding: '10px 0', borderBottom: '1px solid var(--color-separator)',
                fontSize: 14, color: 'var(--color-text-primary)',
              }}>
                <Check size={15} className="flex-none" style={{ marginTop: 2, color: 'var(--color-primary-400)' }} />
                {item}
              </p>
            ))}
            {home.access.excluded.map((item) => (
              <p key={item} className="flex items-start" style={{
                gap: 10, padding: '10px 0', borderBottom: '1px solid var(--color-separator)',
                fontSize: 14, color: 'var(--color-text-muted)',
              }}>
                <Minus size={15} className="flex-none" style={{ marginTop: 2 }} />
                {item} — not on this plan
              </p>
            ))}
          </div>
          {!home.access.isFullAccess && (
            <NocButton variant="action" className="w-full" style={{ marginTop: 14 }}
              onClick={() => navigate('/member/renew-membership')}>
              Compare plans
            </NocButton>
          )}
        </section>
      )}

      {/* ── What has happened to this membership (0057) ── */}
      {hub.events.length > 0 && (
        <section>
          <SectionHead title="Membership history" />
          <div style={{ marginTop: 4 }}>
            {hub.events.map((e, i) => (
              <LineRow
                key={e.id}
                title={e.kind === 'freeze' ? 'Membership frozen' : e.kind === 'unfreeze' ? 'Membership restarted' : 'Membership cancelled'}
                meta={`${new Date(e.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}${e.reason ? ` · ${e.reason}` : ''}`}
                last={i === hub.events.length - 1}
              />
            ))}
          </div>
        </section>
      )}

      {/* ── The account ── */}
      <section className="flex flex-col" style={{ gap: 12 }}>
        <Eyebrow mark>Account</Eyebrow>
        <div className="flex flex-wrap" style={{ gap: '14px 20px', fontSize: 13 }}>
          <button onClick={() => navigate('/member/profile')} style={{ color: 'var(--color-primary-300)' }}>Profile</button>
          <button onClick={() => navigate('/member/settings')} style={{ color: 'var(--color-primary-300)' }}>Settings</button>
          <button onClick={() => navigate('/member/change-password')} style={{ color: 'var(--color-primary-300)' }}>Change password</button>
          <button onClick={() => navigate('/member/change-email')} style={{ color: 'var(--color-primary-300)' }}>Change email</button>
          <button onClick={() => setConfirmLogout(true)} style={{ color: 'var(--color-text-secondary)' }}>Log out</button>
        </div>
      </section>

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
