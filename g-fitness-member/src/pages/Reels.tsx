import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { FilmSlate } from '@phosphor-icons/react';
import ReelPlayer, { ReelFrame } from '../components/reels/ReelPlayer';
import { listReels, type Reel } from '../lib/api/reels';
import { useT } from '../lib/i18n';

type State = { kind: 'loading' } | { kind: 'failed'; message: string } | { kind: 'ready'; reels: Reel[] };

/**
 * Reels (0245) — the gym's short videos, full screen (`/member/reels`, and the
 * coach's `/trainer/reels/watch`). `?reel=<id>` opens at that reel. Immersive:
 * the shell drops the tab bar and the chat head (Layout's IMMERSIVE).
 *
 * A failed read says it failed and offers Retry; it never looks like a gym with
 * no reels.
 */
export default function Reels({ fallback = '/member/home' }: { fallback?: string }) {
  const t = useT();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const startId = params.get('reel');
  const [state, setState] = useState<State>({ kind: 'loading' });

  const load = useCallback(async () => {
    try {
      setState({ kind: 'ready', reels: await listReels() });
    } catch (e) {
      setState({ kind: 'failed', message: e instanceof Error ? e.message : '' });
    }
  }, []);
  useEffect(() => { void (async () => { await load(); })(); }, [load]);

  const back = () => (window.history.length > 1 ? navigate(-1) : navigate(fallback));

  if (state.kind === 'ready' && state.reels.length > 0) {
    return <ReelPlayer reels={state.reels} startId={startId} onBack={back} />;
  }

  return (
    <ReelFrame onBack={back}>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center" style={{ padding: '0 28px', gap: 10 }}>
        {state.kind === 'loading' ? (
          <p role="status" style={{ fontSize: 14, color: 'rgb(255 255 255 / 0.75)' }}>{t('Loading reels…')}</p>
        ) : state.kind === 'failed' ? (
          <>
            <p role="alert" style={{ fontSize: 16, fontWeight: 700 }}>{t('Reels did not load')}</p>
            <p style={{ fontSize: 13, color: 'rgb(255 255 255 / 0.75)' }}>
              {state.message || t('Check your connection and try again.')}
            </p>
            <button type="button" className="noc-press on-fill" onClick={() => { setState({ kind: 'loading' }); void load(); }}
              style={{ marginTop: 6, height: 44, padding: '0 22px', borderRadius: 'var(--radius-btn, 10px)', fontSize: 14, fontWeight: 700,
                background: 'var(--color-secondary)', color: 'var(--color-bg)' }}>
              {t('Retry')}
            </button>
          </>
        ) : (
          <>
            <FilmSlate size={36} style={{ color: 'rgb(255 255 255 / 0.7)' }} aria-hidden />
            <p data-reels-empty style={{ fontSize: 15, fontWeight: 600 }}>{t('Your gym has not posted any reels yet')}</p>
          </>
        )}
      </div>
    </ReelFrame>
  );
}
