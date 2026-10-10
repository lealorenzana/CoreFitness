import { useCallback, useEffect, useState } from 'react';
import { CheckCircle, Copy } from '@phosphor-icons/react';
import { Page, PageTitle } from '../components/ui/page';
import { LineRow, NocButton, Panel, ProgressBar, SectionHead, StatusPill } from '../components/ui/noc';
import { Field, TextInput } from '../components/ui/Field';
import { SkeletonList } from '../components/ui/Skeleton';
import { toast } from '../components/ui/Toast';
import GymGoalStrip from '../components/workout/GymGoalStrip';
import SquadStreakPanel from '../components/streak/SquadStreakPanel';
import { mySquadStreak, squadStreaks, type SquadStreak } from '../lib/api/streak';
import { errorMessage } from '../utils/errorMessage';
import {
  createSquad, joinSquad, leaveSquad, mySquad, settleSquadsAndGoals, squadBoard,
  type MySquad, type SquadBoardRow,
} from '../lib/api/squads';

/**
 * Your squad (0124): two to five friends, one weekly target, counted in
 * training days — a check-in or a logged workout on a day. When the squad's
 * days reach the target, everyone in it gets the gym's squad points, once.
 *
 * A squad is joined only with its code, which only its members see. The board
 * below ranks squads by name; nobody outside a squad sees who is in it.
 *
 * Each member's days are shown to the squad on purpose: that is the point of a
 * squad. Anyone who would rather not be counted in front of friends simply
 * does not join one.
 */
export default function Squad() {
  const [squad, setSquad] = useState<MySquad | null | undefined>(undefined);
  const [live, setLive] = useState(true);
  const [board, setBoard] = useState<SquadBoardRow[]>([]);
  // The squad streak (0153); null before it is pasted, and the plain week panel stays.
  const [sqStreak, setSqStreak] = useState<SquadStreak | null>(null);
  const [streaks, setStreaks] = useState<Map<string, number>>(new Map());
  const [name, setName] = useState('');
  const [target, setTarget] = useState('10');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    await settleSquadsAndGoals();
    const [s, b, ss, st] = await Promise.all([mySquad(), squadBoard(), mySquadStreak(), squadStreaks()]);
    setLive(s !== undefined);
    setSquad(s === undefined ? null : s);
    setBoard(b);
    setSqStreak(ss);
    setStreaks(st);
  }, []);

  useEffect(() => { void (async () => { await load(); })(); }, [load]);

  const run = async (fn: () => Promise<void>, ok: string) => {
    setBusy(true);
    try { await fn(); toast.success(ok); await load(); }
    catch (e) { toast.error(errorMessage(e, 'That did not work')); }
    finally { setBusy(false); }
  };

  if (squad === undefined) return <Page><PageTitle back title="Team" /><SkeletonList /></Page>;
  if (!live) {
    return (
      <Page>
        <PageTitle back title="Team" />
        <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Teams are not switched on at your gym yet.</p>
      </Page>
    );
  }

  const copy = async () => {
    if (!squad) return;
    try { await navigator.clipboard.writeText(squad.code); toast.success('Code copied — send it to your friends.'); }
    catch { toast.info(`Your team code is ${squad.code}`); }
  };

  return (
    <Page>
      <PageTitle back fallback="/member/challenges" title={squad ? squad.name : 'Team'}
        subtitle={squad ? 'Train together — hit the target, everyone gets the points' : 'Two to five friends, one weekly target'} />

      {squad ? (
        <>
          {sqStreak ? <SquadStreakPanel s={sqStreak} /> : <Panel>
            <p className="tabular-nums" style={{ fontSize: 30, fontWeight: 800, lineHeight: 1, color: 'var(--color-text-primary)' }}>
              {squad.days}<span style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text-muted)' }}> / {squad.target} days this week</span>
            </p>
            <ProgressBar style={{ marginTop: 12 }} fraction={Math.min(1, squad.days / Math.max(1, squad.target))} />
            <p style={{ fontSize: 12.5, marginTop: 8, color: squad.days >= squad.target ? 'var(--color-primary-300)' : 'var(--color-text-secondary)' }}>
              {squad.days >= squad.target
                ? 'Target reached this week — the team points are yours.'
                : `${squad.target - squad.days} more between you by Sunday.`}
            </p>
          </Panel>}

          <section>
            <SectionHead title="This week" meta={`${squad.members.length} of 5`} />
            {squad.members.map((m, i) => (
              <LineRow key={m.memberId} title={`${m.firstName}${m.isMe ? ' (you)' : ''}`} last={i === squad.members.length - 1}
                meta={m.days === 0 ? 'Not in yet this week' : `${m.days} day${m.days === 1 ? '' : 's'}`}
                action={m.days > 0 ? <CheckCircle size={20} weight="fill" aria-label="Trained this week" style={{ color: 'var(--color-primary-300)' }} /> : undefined} />
            ))}
          </section>

          {squad.members.length < 5 && (
            <Panel onClick={() => void copy()} ariaLabel="Copy the team code">
              <p style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Invite a friend with this code</p>
              <p className="flex items-center tabular-nums" style={{ gap: 10, marginTop: 4, fontSize: 24, fontWeight: 800, letterSpacing: '0.2em', color: 'var(--color-text-primary)' }}>
                {squad.code} <Copy size={18} aria-hidden style={{ color: 'var(--color-secondary)' }} />
              </p>
            </Panel>
          )}

          <NocButton variant="ghost" className="w-full" disabled={busy}
            onClick={() => void run(leaveSquad, 'You left the team.')}>
            Leave the squad
          </NocButton>
        </>
      ) : (
        <>
          <section>
            <SectionHead title="Join a friend's team" />
            <Field label="Team code" hint="Six letters — ask whoever started it.">
              <TextInput value={code} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 6))}
                placeholder="ABCDEF" aria-label="Team code" style={{ letterSpacing: '0.2em' }} />
            </Field>
            <NocButton variant="action" className="w-full" disabled={busy || code.length !== 6}
              onClick={() => void run(() => joinSquad(code), 'You are in. Say hi to your team.')}>
              Join
            </NocButton>
          </section>

          <section>
            <SectionHead title="Or start one" />
            <Field label="Team name">
              <TextInput value={name} onChange={(e) => setName(e.target.value)} maxLength={30} placeholder="e.g. Iron Barkada" aria-label="Team name" />
            </Field>
            <Field label="Weekly target (training days between you)" hint="Three friends training three days each is 9.">
              <TextInput value={target} inputMode="numeric" aria-label="Weekly target"
                onChange={(e) => setTarget(e.target.value.replace(/[^0-9]/g, '').slice(0, 2))} />
            </Field>
            <NocButton variant="structure" className="w-full"
              disabled={busy || name.trim().length < 2 || !(Number(target) >= 1 && Number(target) <= 35)}
              onClick={() => void run(() => createSquad(name, Number(target)), 'Team started. Share your code.')}>
              Start a squad
            </NocButton>
          </section>
        </>
      )}

      <GymGoalStrip />

      <section>
        <SectionHead title="Teams this week" />
        {board.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>No teams yet. Be the first.</p>
        ) : board.map((b, i) => (
          <LineRow key={i} gutter={`#${i + 1}`} gutterWidth={36} title={`${b.name}${b.isMine ? ' (yours)' : ''}`}
            meta={`${b.members} member${b.members === 1 ? '' : 's'} · ${b.days} / ${b.target} days${(streaks.get(b.name) ?? 0) > 0 ? ` · 🔥 ${streaks.get(b.name)}-week streak` : ''}`}
            action={b.reached ? <StatusPill label="Target hit" tone="structure" /> : undefined}
            last={i === board.length - 1} />
        ))}
      </section>
    </Page>
  );
}
