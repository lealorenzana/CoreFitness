import { useEffect, useState } from 'react';
import { traineeCheers } from '../../lib/api/friends';

/**
 * Who has been cheering a trainee on lately (0217), for their coach — an
 * engagement signal beside the streak. The last two weeks, newest first.
 * Nothing when there are none, the gym has Friends off, or they are not
 * this coach's trainee (trainee_cheers() refuses).
 */
export default function TraineeCheers({ memberId, firstName }: { memberId: string; firstName: string }) {
  const [rows, setRows] = useState<{ from: string; title: string; at: string }[]>([]);
  useEffect(() => {
    let alive = true;
    void (async () => { const r = await traineeCheers(memberId); if (alive) setRows(r); })();
    return () => { alive = false; };
  }, [memberId]);
  if (rows.length === 0) return null;
  const people = [...new Set(rows.map((r) => r.from))];
  return (
    <div style={{ marginTop: 14 }} data-trainee-cheers>
      <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-primary-300)' }}>Cheers this fortnight</p>
      <p style={{ fontSize: 13.5, marginTop: 4, color: 'var(--color-text-primary)' }}>
        {people.length} {people.length === 1 ? 'friend' : 'friends'} cheered {firstName} on · {rows.length} {rows.length === 1 ? 'cheer' : 'cheers'}
      </p>
      <p style={{ fontSize: 12, marginTop: 2, color: 'var(--color-text-muted)' }}>
        Latest: {rows[0].from} — {rows[0].title}
      </p>
    </div>
  );
}
