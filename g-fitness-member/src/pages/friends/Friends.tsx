import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { DotsThreeVertical, UserPlus } from '@phosphor-icons/react';
import { Page, PageTitle } from '../../components/ui/page';
import { NocButton, SectionHead, TextTabs } from '../../components/ui/noc';
import { SkeletonList } from '../../components/ui/Skeleton';
import Avatar from '../../components/ui/Avatar';
import WinCard from '../../components/friends/WinCard';
import { toast } from '../../components/ui/Toast';
import { useFriendsOn } from '../../hooks/useFriendsOn';
import {
  friendWins, myFriendRequests, myFriends, removeFriend, respondRequest, type Friend, type FriendRequest, type Win,
} from '../../lib/api/friends';

type Tab = 'wins' | 'friends' | 'requests';

/**
 * Friends (wave 3, 0217; mock-up approved): your friends' and squad's wins to
 * cheer, your friends, and requests. Only when the gym runs Friends — the
 * owner's switch, off until they turn it on.
 */
export default function Friends() {
  const navigate = useNavigate();
  const on = useFriendsOn();
  const [params, setParams] = useSearchParams();
  const tab: Tab = (['wins', 'friends', 'requests'] as Tab[]).includes(params.get('tab') as Tab) ? (params.get('tab') as Tab) : 'wins';
  const [wins, setWins] = useState<Win[] | null>(null);
  const [friends, setFriends] = useState<Friend[] | null>(null);
  const [requests, setRequests] = useState<FriendRequest[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [w, f, r] = await Promise.all([friendWins(), myFriends(), myFriendRequests()]);
      setWins(w); setFriends(f); setRequests(r); setFailed(false);
    } catch {
      setFailed(true); setWins([]); setFriends([]); setRequests([]);
    }
  }, []);
  useEffect(() => { if (on) void (async () => { await load(); })(); }, [on, load]);

  const incoming = (requests ?? []).filter((r) => r.direction === 'in');
  const outgoing = (requests ?? []).filter((r) => r.direction === 'out');

  const act = async (key: string, fn: () => Promise<void>, ok: string) => {
    setBusy(key);
    try { await fn(); toast.success(ok); await load(); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'That did not work.'); }
    finally { setBusy(null); setConfirm(null); }
  };

  const title = <PageTitle back fallback="/member/home" title="Friends" />;
  if (on === null) return <Page>{title}<SkeletonList /></Page>;
  if (!on) {
    return (
      <Page>
        {title}
        <p style={{ fontSize: 13.5, lineHeight: 1.6, color: 'var(--color-text-muted)' }} data-friends-off>
          Friends are not switched on at your gym. The gym decides whether to run them.
        </p>
      </Page>
    );
  }

  return (
    <Page>
      {title}
      <TextTabs<Tab> label="Friends" active={tab} onChange={(t) => setParams({ tab: t }, { replace: true })}
        tabs={[{ id: 'wins', label: 'Wins' }, { id: 'friends', label: 'Your friends' },
          { id: 'requests', label: incoming.length ? `Requests · ${incoming.length}` : 'Requests' }]} />
      {failed && <p style={{ fontSize: 12.5, color: 'var(--color-secondary)' }}>Friends could not be loaded just now — this is a connection problem, not an empty list.</p>}
      {wins == null ? <SkeletonList /> : tab === 'wins' ? (
        wins.length === 0 ? (
          <div className="flex flex-col" style={{ gap: 12 }}>
            <p style={{ fontSize: 13.5, lineHeight: 1.6, color: 'var(--color-text-muted)' }}>
              No wins from your friends or squad in the last 30 days. Records, streaks, badges, targets and challenges show here.
            </p>
            <NocButton variant="action" icon={<UserPlus size={16} />} onClick={() => navigate('/member/friends/add')}>Add a friend</NocButton>
          </div>
        ) : (
          <section className="flex flex-col" style={{ gap: 10 }} data-wins>
            {wins.map((w, i) => <WinCard key={`${w.kind}:${w.ref}`} win={w} style={{ ['--i' as string]: i }} />)}
          </section>
        )
      ) : tab === 'friends' ? (
        <div className="flex flex-col" style={{ gap: 6 }}>
          <NocButton variant="fill" icon={<UserPlus size={16} />} onClick={() => navigate('/member/friends/add')}>Add a friend</NocButton>
          {(friends ?? []).length === 0 ? (
            <p style={{ fontSize: 13.5, marginTop: 8, color: 'var(--color-text-muted)' }}>No friends yet. Add someone you train with.</p>
          ) : (friends ?? []).map((f) => (
            <div key={f.id} className="flex items-center" data-friend-row style={{ gap: 12, padding: '12px 0', borderBottom: '1px solid var(--color-separator)' }}>
              <Avatar name={`${f.firstName} ${f.lastName}`} photoUrl={f.photoUrl} size={42} />
              <span className="min-w-0 flex-1">
                <span className="block truncate" style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text-primary)' }}>{f.firstName} {f.lastName}</span>
                <span className="block" style={{ fontSize: 12.5, color: 'var(--color-text-muted)' }}>
                  {f.streakWeeks > 0 ? `${f.streakWeeks}-week streak` : 'No streak right now'}{f.inSquad ? ' · your squad' : ''}
                </span>
              </span>
              {confirm === f.id ? (
                <button type="button" disabled={busy === f.id} onClick={() => void act(f.id, () => removeFriend(f.id), `${f.firstName} is no longer your friend.`)}
                  style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-secondary)' }}>Tap again to remove</button>
              ) : (
                <button type="button" onClick={() => setConfirm(f.id)} aria-label={`Remove ${f.firstName}`} style={{ color: 'var(--color-text-muted)', padding: 6 }}>
                  <DotsThreeVertical size={20} weight="bold" />
                </button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col" style={{ gap: 4 }} data-requests>
          <SectionHead title="For you" meta={incoming.length ? String(incoming.length) : undefined} />
          {incoming.length === 0 ? <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Nothing waiting.</p> : incoming.map((r) => (
            <div key={r.requestId} className="flex items-center" style={{ gap: 10, padding: '12px 0', borderBottom: '1px solid var(--color-separator)' }}>
              <Avatar name={`${r.firstName} ${r.lastName}`} photoUrl={r.photoUrl} size={42} />
              <span className="min-w-0 flex-1">
                <span className="block truncate" style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text-primary)' }}>{r.firstName} {r.lastName}</span>
                <span className="block" style={{ fontSize: 12.5, color: 'var(--color-text-muted)' }}>
                  {r.reason === 'squad' ? 'In your squad' : r.reason === 'invited' ? 'You invited each other' : 'At your gym'}
                </span>
              </span>
              <NocButton variant="action" style={{ minWidth: 84, flex: 'none' }} disabled={busy === r.requestId} onClick={() => void act(r.requestId, () => respondRequest(r.requestId, true), `You and ${r.firstName} are friends now.`)}>Accept</NocButton>
              <button type="button" disabled={busy === r.requestId} aria-label={`Decline ${r.firstName}`}
                onClick={() => void act(r.requestId, () => respondRequest(r.requestId, false), 'Declined.')}
                style={{ fontSize: 13, color: 'var(--color-text-secondary)', padding: '0 6px' }}>Decline</button>
            </div>
          ))}
          <SectionHead title="You sent" meta={outgoing.length ? String(outgoing.length) : undefined} />
          {outgoing.length === 0 ? <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>None waiting.</p> : outgoing.map((r) => (
            <div key={r.requestId} className="flex items-center" style={{ gap: 10, padding: '12px 0', borderBottom: '1px solid var(--color-separator)' }}>
              <Avatar name={`${r.firstName} ${r.lastName}`} photoUrl={r.photoUrl} size={42} />
              <span className="min-w-0 flex-1">
                <span className="block truncate" style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text-primary)' }}>{r.firstName} {r.lastName}</span>
                <span className="block" style={{ fontSize: 12.5, color: 'var(--color-text-muted)' }}>Waiting for them</span>
              </span>
              <button type="button" disabled={busy === r.requestId} onClick={() => void act(r.requestId, () => removeFriend(r.id), 'Request taken back.')}
                style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>Cancel</button>
            </div>
          ))}
        </div>
      )}
    </Page>
  );
}
