import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eyebrow, Panel } from '../ui/noc';
import { reviewQueue } from '../../lib/api/rooms';

/**
 * Trainer Home: classwork turned in and waiting for a comment (0129), across
 * every room. Nothing at all when nothing is waiting.
 */
export default function ReviewNudge() {
  const navigate = useNavigate();
  const [n, setN] = useState(0);
  useEffect(() => {
    let alive = true;
    void (async () => { const q = await reviewQueue(); if (alive) setN(q.length); })();
    return () => { alive = false; };
  }, []);
  if (n === 0) return null;
  return (
    <Panel glow="action" onClick={() => navigate('/trainer/rooms')}>
      <Eyebrow tone="action">Classwork</Eyebrow>
      <p style={{ fontSize: 14, marginTop: 6, color: 'var(--color-text-secondary)' }}>
        <span style={{ fontSize: 22, fontWeight: 700, color: 'var(--color-text-primary)' }}>{n}</span>
        {' '}turned in, waiting for your comment
      </p>
    </Panel>
  );
}
