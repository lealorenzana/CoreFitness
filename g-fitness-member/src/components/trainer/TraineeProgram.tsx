import { useCallback, useEffect, useState } from 'react';
import { NocButton } from '../ui/noc';
import { Select } from '../ui/Field';
import { toast } from '../ui/Toast';
import { errorMessage } from '../../utils/errorMessage';
import {
  assignProgram, listGymPrograms, programProgress, type ProgramSummary, type ProgressDay,
} from '../../lib/api/programs';

/**
 * A coach's view of their trainee's program (0122), and the way to set one.
 *
 * The database decides who may assign (`assign_program`: the owner, or this
 * trainee's own coach) and refuses a Premium program the member's plan does not
 * include — so the refusal is shown as the database words it, not second-guessed
 * here. The member is notified when it succeeds.
 *
 * Renders nothing when the gym has no published programs (or before 0122).
 */
export default function TraineeProgram({ memberId, firstName }: { memberId: string; firstName: string }) {
  const [programs, setPrograms] = useState<ProgramSummary[] | null>(null);
  const [progress, setProgress] = useState<ProgressDay[]>([]);
  const [pick, setPick] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [p, g] = await Promise.all([listGymPrograms(), programProgress(memberId)]);
    setPrograms(p);
    setProgress(g);
  }, [memberId]);

  useEffect(() => { void (async () => { await load(); })(); }, [load]);

  if (!programs || programs.length === 0) return null;
  const current = progress[0] ?? null;
  const done = progress.filter((d) => d.done).length;

  const assign = async () => {
    if (!pick) return;
    setBusy(true);
    try {
      await assignProgram(memberId, pick);
      toast.success(`${firstName} is on it now, and has been told.`);
      setPick('');
      await load();
    } catch (e) {
      toast.error(errorMessage(e, 'That program could not be assigned'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ marginTop: 14 }}>
      <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-primary-300)' }}>Program</p>
      <p style={{ fontSize: 13.5, marginTop: 4, color: 'var(--color-text-primary)' }}>
        {current
          ? `${current.programName} · ${done} of ${progress.length} days done`
          : `${firstName} is not following a program.`}
      </p>
      <div className="flex items-center" style={{ gap: 8, marginTop: 8 }}>
        <Select value={pick} onChange={(e) => setPick(e.target.value)} aria-label="Program to assign" className="flex-1 min-w-0">
          <option value="">{current ? 'Switch to another program…' : 'Choose a program…'}</option>
          {programs.filter((p) => p.id !== current?.programId).map((p) => (
            <option key={p.id} value={p.id}>{p.name}{p.premium ? ' (Premium)' : ''}</option>
          ))}
        </Select>
        <NocButton variant="action" className="flex-none" style={{ padding: '0 18px' }} disabled={busy || !pick} onClick={() => void assign()}>
          Assign
        </NocButton>
      </div>
    </div>
  );
}
