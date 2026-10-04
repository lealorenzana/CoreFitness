import { useCallback, useEffect, useState } from 'react';
import Button from './ui/Button';
import { showToast } from '../utils/toast';
import { listHouseRules, publishHouseRules, type HouseRulesVersion } from '../lib/api/houseRules';

const MUTED = 'var(--color-text-muted)';
const stamp = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

/**
 * Settings → House rules (0153): the gym's own rules, shown to members inside
 * the Terms (section 6) and agreed to version by version.
 *
 * Like the waiver, published words cannot be changed — members agreed to what
 * was on screen. Saving here always publishes the *next* version, which asks
 * every member to agree again, so the screen says so before the button does it.
 * Publishing an empty box withdraws the rules (a version with none). Nothing
 * waits for these: unlike the waiver, house rules never gate booking.
 */
export default function HouseRulesTab() {
  const [versions, setVersions] = useState<HouseRulesVersion[] | null | undefined>(undefined);
  const [body, setBody] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const v = await listHouseRules();
    setVersions(v);
    setBody(v?.[0]?.body ?? '');
  }, []);
  useEffect(() => { void (async () => { await load(); })(); }, [load]);

  if (versions === undefined) return <p className="text-xs" style={{ color: MUTED }}>Loading…</p>;
  if (versions === null) {
    return <p className="text-xs" style={{ color: MUTED }}>House rules need migration 0153_house_rules.sql, which is not pasted yet.</p>;
  }

  const current = versions[0] ?? null;
  const changed = body.trim() !== (current?.body ?? '');
  const withdrawing = !!current && current.body !== '' && body.trim() === '';

  const publish = async () => {
    setBusy(true);
    try {
      const v = await publishHouseRules(body);
      showToast(withdrawing ? `House rules withdrawn (version ${v}).` : `Version ${v} published. Members are asked to agree to it.`, 'success');
      setConfirming(false);
      await load();
    } catch (e) { showToast(e instanceof Error ? e.message : 'That did not work', 'error'); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-sm font-bold text-white">House rules</h2>
        <p className="text-[11px] mt-1" style={{ color: MUTED }}>
          {current && current.body
            ? `Version ${current.version} is in force, published ${stamp(current.published_at)}. ${current.agreed} member${current.agreed === 1 ? '' : 's'} agreed to it.`
            : current ? `No house rules in force — version ${current.version} withdrew them.`
            : 'None yet. Members see only the standard rules in the Terms until you publish your own.'}
        </p>
      </div>

      <div className="space-y-2">
        <p className="text-[11px]" style={{ color: MUTED }}>
          Your gym's own rules — towels, chalk, time limits at peak hours. Members read them in the Terms and agree to each version.
          Published words cannot be changed; publishing again makes the next version and asks every member to agree to it.
        </p>
        <textarea
          className="w-full rounded-lg border px-3 py-2 text-sm"
          style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text-primary)', minHeight: 200 }}
          value={body} maxLength={4000} onChange={(e) => { setBody(e.target.value); setConfirming(false); }}
          placeholder={'Bring a towel and wipe equipment after use.\nNo chalk on the lifting platform.\n90 minutes per visit between 5 and 8 PM.'}
          aria-label="House rules" />
        <p className="text-[10px]" style={{ color: MUTED }}>{body.length} / 4000</p>
        {!confirming ? (
          <Button size="sm" disabled={busy || !changed || (!current && !body.trim())} onClick={() => setConfirming(true)}>
            {withdrawing ? 'Withdraw house rules' : current ? `Publish version ${current.version + 1}` : 'Publish house rules'}
          </Button>
        ) : (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-xs"
            style={{ borderColor: 'var(--color-secondary)', background: 'var(--color-secondary-light)', color: 'var(--color-text-secondary)' }}>
            <span className="flex-1 min-w-[200px]">
              {withdrawing
                ? 'Members will no longer be shown house rules. Agreements already given are kept.'
                : 'Every member will be asked to agree to these words. They cannot be edited after this — a change is a new version.'}
            </span>
            <Button size="sm" disabled={busy} onClick={() => void publish()}>{busy ? 'Publishing…' : withdrawing ? 'Withdraw' : 'Publish'}</Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => setConfirming(false)}>Cancel</Button>
          </div>
        )}
      </div>

      {versions.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-white mb-2">Every version</h3>
          <div className="space-y-2">
            {versions.map((v) => (
              <details key={v.id} className="rounded-lg border px-3 py-2" style={{ borderColor: 'var(--color-border)' }}>
                <summary className="cursor-pointer text-xs text-white">
                  Version {v.version} · {stamp(v.published_at)}{v.published_by ? ` · ${v.published_by}` : ''} ·{' '}
                  <span style={{ color: MUTED }}>{v.body ? `${v.agreed} agreed` : 'withdrew the rules'}</span>
                </summary>
                {v.body && <p className="mt-2 text-xs whitespace-pre-wrap" style={{ color: 'var(--color-text-secondary)' }}>{v.body}</p>}
              </details>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
