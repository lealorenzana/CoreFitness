import { useEffect, useState } from 'react';
import { Check, FileSignature } from 'lucide-react';
import { acceptGymTerms, myGymTerms, SITE, versionLabel, type MyGymTerms } from '../lib/api/gymTerms';

/**
 * Core Fitness's documents for gyms, once the platform has put a version in
 * effect (0152), until one of this gym's owners agrees to it. Owners only —
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
        <p className="text-white">Agreed for your gym — the version of {versionLabel(published)}. Thank you.</p>
      </div>
    );
  }

  const agree = async () => {
    setState('saving'); setError(null);
    try { await acceptGymTerms(published); setState('done'); }
    catch (e) { setState('idle'); setError(e instanceof Error ? e.message : 'It could not be saved. Try again.'); }
  };
  const doc = (hash: string, label: string) => (
    <a href={`${SITE}/#legal/${hash}`} target="_blank" rel="noopener noreferrer" className="underline" style={{ color: 'var(--color-text-primary)' }}>{label}</a>
  );

  return (
    <div className="mx-4 mt-4 flex items-start gap-2.5 rounded-lg border px-3.5 py-3 text-sm" role="region" aria-label="Terms for gyms"
      style={{ borderColor: 'var(--color-secondary)', background: 'var(--color-secondary-light)' }}>
      <FileSignature size={16} className="mt-0.5 flex-none" style={{ color: 'var(--color-secondary)' }} />
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-white">Core Fitness's terms for gyms are in effect{' '}
          <span className="font-normal text-xs ml-2" style={{ color: 'var(--color-text-muted)' }}>version of {versionLabel(published)}</span></p>
        <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
          Read the {doc('terms', 'Terms of Service for gyms')}, the {doc('dpa', 'Data Processing Agreement')} and
          the {doc('privacy', 'Privacy Policy')}, then agree for your gym. One owner agreeing covers the gym.
          {t.accepted_version && ` Your gym agreed to the version of ${versionLabel(t.accepted_version)}; this one replaces it.`}
        </p>
        {error && <p className="text-xs mt-1" style={{ color: 'var(--color-secondary)' }}>{error}</p>}
      </div>
      <button type="button" onClick={() => void agree()} disabled={state === 'saving'}
        className="flex-none rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-60"
        style={{ background: 'var(--color-secondary)', color: '#1a1205' }}>
        {state === 'saving' ? 'Saving…' : 'I agree for my gym'}
      </button>
    </div>
  );
}
