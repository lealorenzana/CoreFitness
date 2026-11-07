import { useCallback, useEffect, useRef, useState } from 'react';
import { demoGyms, demoGymStep, demoRemoveStep, type DemoGym } from '../lib/platform';

/**
 * Demo gyms for a load test (0238; the evaluators asked, 2026-11-08): 50 gyms × (owner, desk, 3 coaches, 200
 * members) with six months of history, every account a real sign-in. Built and removed here, in the database's
 * own small steps (a request has 8 seconds), with a progress bar; pressing Create again resumes where it stopped.
 *
 * The shared password is chosen here — this app runs on the platform owner's machine only — and written into
 * the logins file and scripts/demo-data/DEMO-GYMS.md.
 */
export const DEMO_PASSWORD = 'CoreDemo-2026';
const GYMS = 50;
const STEPS = 6;
const ADMIN_APP = 'https://corefitness-admin.vercel.app';
const MEMBER_APP = 'https://corefitness-gym.vercel.app';

type Run = { kind: 'create' | 'remove'; done: number; total: number; line: string } | null;

export default function DemoGyms() {
  const [gyms, setGyms] = useState<DemoGym[] | null | 'missing'>(null);
  const [confirm, setConfirm] = useState<'create' | 'remove' | null>(null);
  const [typed, setTyped] = useState('');
  const [run, setRun] = useState<Run>(null);
  const [said, setSaid] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const stop = useRef(false);

  const load = useCallback(async () => {
    try { setGyms(await demoGyms()); }
    catch (e) { setGyms(/could not find the function|PGRST202|does not exist/i.test(String(e)) ? 'missing' : null); }
  }, []);
  useEffect(() => { void (async () => { await load(); })(); }, [load]);

  const list = Array.isArray(gyms) ? gyms : [];
  const complete = list.filter((g) => g.steps_done >= STEPS).length;
  const members = list.reduce((a, g) => a + g.members, 0);
  const busy = run !== null;

  const create = async () => {
    stop.current = false; setError(null); setSaid(null);
    const doneBefore = new Map(list.map((g) => [g.n, g.steps_done]));
    const total = GYMS * STEPS;
    let done = list.reduce((a, g) => a + Math.min(g.steps_done, STEPS), 0);
    setRun({ kind: 'create', done, total, line: 'Starting…' });
    try {
      for (let n = 1; n <= GYMS; n++) {
        for (let step = (doneBefore.get(n) ?? 0) + 1; step <= STEPS; step++) {
          if (stop.current) throw new Error('Stopped — press Create again to carry on where it stopped.');
          const line = await demoGymStep(n, step, DEMO_PASSWORD);
          done++;
          setRun({ kind: 'create', done, total, line });
        }
      }
      setSaid(`All ${GYMS} demo gyms are built: ${GYMS * 205} accounts. Download the logins below.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Building stopped.');
    } finally {
      setRun(null); await load();
    }
  };

  const remove = async () => {
    stop.current = false; setError(null); setSaid(null);
    const todo = [...list].sort((a, b) => a.n - b.n);
    const total = todo.length * 2;
    let done = 0;
    setRun({ kind: 'remove', done, total, line: 'Starting…' });
    try {
      for (const g of todo) {
        for (const step of [1, 2]) {
          if (stop.current) throw new Error('Stopped — press Remove again to finish.');
          const line = await demoRemoveStep(g.n, step);
          done++;
          setRun({ kind: 'remove', done, total, line });
        }
      }
      setSaid('Every demo gym, its people and their sign-ins are removed.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Removal stopped.');
    } finally {
      setRun(null); await load();
    }
  };

  // Every login of the gyms built so far: the five staff, then the members whose step has run.
  const download = () => {
    const rows = [['gym_no', 'gym', 'town', 'role', 'username', 'password', 'sign_in_at']];
    for (const g of list) {
      const t = String(g.n).padStart(2, '0');
      const add = (role: string, user: string, app: string) => rows.push([String(g.n), g.name, g.town, role, user, DEMO_PASSWORD, app]);
      add('Owner', `gym${t}.owner`, ADMIN_APP);
      add('Front desk', `gym${t}.desk`, ADMIN_APP);
      for (let c = 1; c <= 3; c++) add('Coach', `gym${t}.coach${c}`, `${MEMBER_APP} (Trainer)`);
      const built = Math.max(0, Math.min(g.steps_done, 5) - 1) * 50;
      for (let m = 1; m <= built; m++) add('Member', `gym${t}.m${String(m).padStart(3, '0')}`, MEMBER_APP);
    }
    const csv = rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url; a.download = 'core-fitness-demo-logins.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  if (gyms === 'missing') {
    return (
      <div className="card pf-card pf-12" data-demo-gyms>
        <div className="name">Demo gyms for a load test</div>
        <div className="meta">Paste migration 0238 (supabase/migrations/0238_demo_gyms.sql) first — then Create and Remove appear here.</div>
      </div>
    );
  }

  return (
    <div className="card pf-card pf-12" data-demo-gyms>
      <div className="name">Demo gyms for a load test</div>
      <div className="meta">
        {GYMS} made-up gyms in Philippine towns, each with an owner, a front desk, 3 coaches and 200 members — every one a
        real sign-in — and about six months of payments, check-ins, coaching and chats. Listed publicly with a Demo mark,
        never billed. {list.length === 0 ? 'None exist now.' : <><strong>{complete} of {GYMS}</strong> built · {members.toLocaleString()} members.</>}
      </div>
      {list.length > 0 && (
        <div className="meta" style={{ marginTop: 6 }}>
          Sign in by username — <code>gym07.owner</code>, <code>gym07.desk</code>, <code>gym07.coach1</code>, <code>gym07.m123</code> —
          with the shared password <code data-demo-password>{DEMO_PASSWORD}</code>.
        </div>
      )}

      {run && (
        <div style={{ marginTop: 12 }} data-demo-progress>
          <div style={{ height: 10, borderRadius: 6, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${Math.round((run.done / Math.max(1, run.total)) * 100)}%`, background: run.kind === 'create' ? '#7C3AED' : '#F59E0B', transition: 'width .3s' }} />
          </div>
          <div className="meta" style={{ marginTop: 6 }}>
            {run.kind === 'create' ? 'Building' : 'Removing'} — {run.done} of {run.total} steps · {run.line}
          </div>
          <button className="btn ghost" type="button" style={{ marginTop: 6 }} onClick={() => { stop.current = true; }}>Stop after this step</button>
        </div>
      )}
      {error && <div className="meta" style={{ marginTop: 8, color: 'var(--warn)' }} role="alert">{error}</div>}
      {said && <div className="meta" style={{ marginTop: 8 }}>{said}</div>}

      {!busy && !confirm && (
        <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {complete < GYMS && <button className="btn" type="button" onClick={() => { setConfirm('create'); setTyped(''); }}>
            {list.length ? 'Finish building the demo gyms' : 'Create demo gyms'}</button>}
          {list.length > 0 && <button className="btn" type="button" onClick={download} data-demo-download>Download logins (CSV)</button>}
          {list.length > 0 && <button className="btn ghost" type="button" onClick={() => { setConfirm('remove'); setTyped(''); }}>Remove demo gyms</button>}
        </div>
      )}

      {!busy && confirm && (
        <form className="fields" style={{ marginTop: 10 }} onSubmit={(e) => {
          e.preventDefault();
          const what = confirm; setConfirm(null);
          void (what === 'create' ? create() : remove());
        }}>
          <div className="meta">
            {confirm === 'create'
              ? `This adds ${GYMS} gyms and ${(GYMS * 205).toLocaleString()} accounts to the live database — about 250 MB of the free plan's 500 MB — in ${GYMS * STEPS} steps, roughly 5–10 minutes. Keep this tab open.`
              : <>This deletes every demo gym, its {members.toLocaleString()} members, staff, history and sign-ins. Only gyms marked Demo are touched. <strong style={{ color: 'var(--warn)' }}>There is no undo.</strong></>}
          </div>
          <label htmlFor="demo-confirm" style={{ marginTop: 8 }}>Type <strong>{confirm}</strong> to confirm</label>
          <input id="demo-confirm" autoFocus value={typed} autoComplete="off" onChange={(e) => setTyped(e.target.value)} />
          <div style={{ marginTop: 8 }}>
            <button className="btn" type="submit" disabled={typed.trim().toLowerCase() !== confirm}>
              {confirm === 'create' ? 'Create demo gyms' : 'Remove demo gyms'}
            </button>
            <button className="btn ghost" type="button" style={{ marginLeft: 8 }} onClick={() => setConfirm(null)}>Cancel</button>
          </div>
        </form>
      )}
    </div>
  );
}
