import { useEffect, useState } from 'react';
import { Check, FileSignature } from 'lucide-react';
import { acceptGymTerms, myGymTerms, SITE, versionLabel, type MyGymTerms } from '../lib/api/gymTerms';

/**
 * Core Fitness's documents for gyms, once the platform has put a version in
 * effect (0156), until one of this gym's owners agrees to it. Owners only —
 * `my_gym_terms()` answers nothing for the desk. Not dismissible: it is the
 * gym's agreement to the service it runs on, so it stays until it is given;
 * but it never blocks a screen — the gym keeps working while the owner reads.
 */
export default function GymTermsBanner() {
  const [t, setT] = useState<MyGymTerms | null>(null);
  const [state, setState] = useState<'idle' | 'saving' | 'done'>('idle');
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    void (async () => { const r = await myGymTerms(); if (alive) setT(r); })();
    return () => { alive = false; };
  }, []);

  if (!t?.published || (t.accepted_version === t.published && state !== 'done')) return null;
  const published = t.published;

  if (state === 'done') {
    return (
      <div className="mx-4 mt-4 flex items-center gap-2.5 rounded-lg border px-3.5 py-2.5 text-sm" role="status"
        style={{ borderColor: 'var(--color-primary)', background: 'var(--color-primary-light)' }}>
        <Check size={16} style={{ color: 'var(--color-primary)' }} />
        <p style={{ color: 'var(--color-text-primary)' }}>Agreed for your gym: the version of {versionLabel(published)}. Thank you.</p>
      </div>
    );
  }

  const agree = async () => {
    setState('saving'); setError(null);
    try { await acceptGymTerms(published); setState('done'); }
    catch (e) { setState('idle'); setError(e instanceof Error ? e.message : 'It could not be saved. Try again.'); }
  };
  const doc = (hash: string, label: string) => (
    <a href={`${SITE}/#legal/${hash}`} target="_blank" rel="noopener noreferrer" className="underline" style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>{label}</a>
  );

  // One slim line (owner, 2026-11-27): it says what, links all three documents and asks once. It wraps on a narrow
  // window rather than cutting the legal words off. Plain button: each page keeps its one amber action.
  return (
    <div className="mx-4 mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1 rounded-lg border px-3 py-1.5 text-xs" role="region" aria-label="Terms for gyms"
      data-gym-terms style={{ borderColor: 'var(--a-border, rgb(var(--hair-rgb, 255 255 255) / 0.1))', borderLeft: '2px solid var(--color-secondary)', background: 'var(--a-surface, transparent)' }}>
      <FileSignature size={14} className="flex-none" style={{ color: 'var(--color-text-muted)' }} />
      <b style={{ color: 'var(--color-text-primary)' }}>Core Fitness's terms for gyms</b>
      <span style={{ color: 'var(--color-text-secondary)' }} className="min-w-0 flex-1">
        version of {versionLabel(published)} · Read the {doc('terms', 'Terms of Service for gyms')}, the {doc('dpa', 'Data Processing Agreement')} and
        the {doc('privacy', 'Privacy Policy')}. One owner agreeing covers the gym.
        {t.accepted_version && ` Your gym agreed to the version of ${versionLabel(t.accepted_version)}; this one replaces it.`}
        {error && <span style={{ color: 'var(--color-secondary)' }}> {error}</span>}
      </span>
      <button type="button" onClick={() => void agree()} disabled={state === 'saving'}
        className="flex-none rounded-md border px-2.5 py-1 text-xs font-semibold disabled:opacity-60"
        style={{ borderColor: 'rgb(var(--hair-rgb, 255 255 255) / 0.18)', color: 'var(--color-text-primary)' }}>
        {state === 'saving' ? 'Saving…' : 'I agree for my gym'}
      </button>
    </div>
  );
}
