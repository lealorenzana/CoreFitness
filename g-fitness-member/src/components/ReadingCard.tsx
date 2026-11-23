import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eyebrow, NocButton, Panel, StatusPill } from './ui/noc';
import { addToReading } from '../lib/api/progress';
import { getCurrentMemberId } from '../services/bookingService';
import { addDays, todayKey } from '../utils/dates';
import { readingLines, type Reading } from '../data/memberAssistant';
import { errorMessage } from '../utils/errorMessage';
import { useT } from '../lib/i18n';

/**
 * A body reading the assistant read out of a message (the rules' `readingFrom`, or the coach's
 * propose_reading), waiting for the member's Save. Nothing is written until they tap it; Save goes
 * through the same writer as You → Progress → Body, so the trainer and the desk see it where they
 * already see readings.
 */
export default function ReadingCard({ reading }: { reading: Reading }) {
  const t = useT();
  const navigate = useNavigate();
  const [state, setState] = useState<'pending' | 'busy' | 'saved' | 'queued' | 'discarded'>('pending');
  const [error, setError] = useState<string | null>(null);
  const day = reading.measuredOn === 'yesterday' ? addDays(todayKey(), -1) : todayKey();

  const save = async () => {
    setState('busy'); setError(null);
    try {
      const id = await getCurrentMemberId();
      if (!id) throw new Error('Sign in again to save this.');
      const saved = await addToReading(id, day, reading.values);
      setState(saved.queued ? 'queued' : 'saved');
    } catch (err) {
      setError(errorMessage(err, 'This reading was not saved. Try again.'));
      setState('pending');
    }
  };

  return (
    <div className="w-full" data-reading-card>
      <Panel filled style={{ border: '1px solid var(--color-hairline)', padding: 14 }}>
        <Eyebrow mark>{t('A body reading')}</Eyebrow>
        <div style={{ marginTop: 8, fontSize: 14.5, fontWeight: 600, lineHeight: 1.5, color: 'var(--color-text-primary)' }}>
          {readingLines(reading).map((l) => <p key={l}>{l}</p>)}
        </div>
        <p style={{ marginTop: 4, fontSize: 12.5, color: 'var(--color-text-secondary)' }}>
          {reading.measuredOn === 'yesterday' ? t('Yesterday') : t('Today')}
        </p>
        {error && <p role="alert" style={{ marginTop: 8, fontSize: 12.5, color: 'var(--color-secondary)' }}>{error}</p>}
        {(state === 'pending' || state === 'busy') && (
          <div className="flex" style={{ gap: 10, marginTop: 12 }}>
            <NocButton variant="fill" className="flex-1" disabled={state === 'busy'} style={{ height: 42 }} onClick={() => void save()}>
              {t('Save')}
            </NocButton>
            <NocButton variant="ghost" className="flex-1" disabled={state === 'busy'} style={{ height: 42 }} onClick={() => setState('discarded')}>
              {t('Discard')}
            </NocButton>
          </div>
        )}
        {(state === 'saved' || state === 'queued') && (
          <div className="flex items-center justify-between" style={{ gap: 10, marginTop: 12 }}>
            <StatusPill label={state === 'saved' ? t('Saved') : t('Saves when you are back online')} />
            <NocButton variant="ghost" style={{ height: 38, padding: '0 16px' }} onClick={() => navigate('/member/body')}>
              {t('See Body')}
            </NocButton>
          </div>
        )}
        {state === 'discarded' && (
          <div style={{ marginTop: 12 }}><StatusPill label={t('Not saved')} tone="muted" /></div>
        )}
      </Panel>
    </div>
  );
}
