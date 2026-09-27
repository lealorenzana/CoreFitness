import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import { showToast } from '../utils/toast';
import {
  saveWinbackRule, winbackResults, winbackRules, winbackSweep, type WinbackKey, type WinbackResult, type WinbackRule,
} from '../lib/api/retention';

const MUTED = 'var(--color-text-muted)';
const FIELD = { background: 'var(--color-surface-high)', border: '1px solid var(--color-border)' };
const WHEN: Record<WinbackKey, string> = {
  no_visit_14: 'To a member whose last visit was 14–30 days ago',
  no_visit_30: 'To a paying member with no visit in 30+ days',
  lapsed: 'To someone whose membership ended in the last 14 days and did not renew',
};

/**
 * Reports → Retention → Win-back messages (0130). Three messages the app can
 * send by itself, each switched off until the owner turns it on and each
 * reworded freely. A member gets a given one at most once a month. The desk
 * reads this page; only the owner changes it (RLS, and the save says so).
 */
export default function WinbackMessages() {
  const navigate = useNavigate();
  const [rules, setRules] = useState<WinbackRule[] | null>(null);
  const [results, setResults] = useState<WinbackResult[]>([]);
  const [edits, setEdits] = useState<Record<string, { title: string; message: string }>>({});
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    await winbackSweep(); // also gives a newer gym its three messages
    const [r, res] = await Promise.all([winbackRules(), winbackResults()]);
    setRules(r); setResults(res);
  }, []);
  useEffect(() => { void (async () => { await load(); })(); }, [load]);

  const save = async (key: WinbackKey, patch: { title?: string; message?: string; isActive?: boolean }, ok: string) => {
    setBusy(true);
    try { await saveWinbackRule(key, patch); showToast(ok, 'success'); setEdits((e) => { const n = { ...e }; delete n[key]; return n; }); await load(); }
    catch (e) { showToast(e instanceof Error ? e.message : 'That could not be saved', 'error'); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-4 max-w-3xl">
      <button onClick={() => navigate('/retention')} className="flex items-center gap-1 text-xs" style={{ color: MUTED }}>
        <ArrowLeft size={12} /> Retention
      </button>
      <div>
        <h1 className="text-2xl font-bold text-white">Win-back messages</h1>
        <p className="text-xs mt-1" style={{ color: MUTED }}>
          Sent by the app to members drifting away — each at most once a month, only while it is on. The 7-, 3- and 1-day
          "membership ending" reminders are separate and always sent.
        </p>
      </div>
      {rules === null && <p className="text-xs" style={{ color: MUTED }}>Loading…</p>}
      {rules?.length === 0 && <p className="text-xs" style={{ color: MUTED }}>Win-back messages are not switched on yet — paste migration 0130.</p>}
      {rules?.map((r) => {
        const e = edits[r.key] ?? { title: r.title, message: r.message };
        const res = results.find((x) => x.ruleKey === r.key);
        const changed = e.title !== r.title || e.message !== r.message;
        return (
          <Card key={r.key} className="!p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] uppercase font-semibold" style={{ color: 'var(--color-primary)' }}>{WHEN[r.key]}</p>
                <p className="text-[10px] mt-0.5" style={{ color: MUTED }}>
                  {res ? `Last 30 days: sent to ${res.sent}, ${res.cameBack} came back within two weeks` : 'Not sent in the last 30 days'}
                </p>
              </div>
              <label className="flex items-center gap-2 text-xs text-white cursor-pointer">
                <input type="checkbox" checked={r.isActive} disabled={busy} aria-label={`Send "${r.title}" automatically`}
                  onChange={() => void save(r.key, { isActive: !r.isActive }, r.isActive ? `"${r.title}" is off` : `"${r.title}" is on`)} />
                {r.isActive ? 'On' : 'Off'}
              </label>
            </div>
            <input value={e.title} maxLength={80} aria-label={`Title of ${r.key}`}
              onChange={(ev) => setEdits({ ...edits, [r.key]: { ...e, title: ev.target.value } })}
              className="w-full h-9 px-3 rounded-lg text-xs text-white mt-3" style={FIELD} />
            <textarea value={e.message} rows={2} maxLength={300} aria-label={`Text of ${r.key}`}
              onChange={(ev) => setEdits({ ...edits, [r.key]: { ...e, message: ev.target.value } })}
              className="w-full px-3 py-2 rounded-lg text-xs text-white mt-2" style={FIELD} />
            {changed && (
              <Button size="sm" variant="secondary" disabled={busy || !e.title.trim() || !e.message.trim()}
                onClick={() => void save(r.key, { title: e.title, message: e.message }, 'Wording saved')}>
                Save wording
              </Button>
            )}
          </Card>
        );
      })}
    </div>
  );
}
