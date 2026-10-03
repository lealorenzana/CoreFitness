import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FlaskConical } from 'lucide-react';
import { demoSummary, type DemoSummary } from '../lib/platform';

/**
 * Every figure on Overview and Growth is read live from the gyms' own tables —
 * members, check-ins, payments — so while scripts/demo-data is in the
 * database, those figures include its 150 seeded people. Said here, where the
 * numbers are, rather than only at the bottom of Platform (0117).
 */
export default function DemoNotice() {
  const [d, setD] = useState<DemoSummary | null>(null);
  useEffect(() => {
    let alive = true;
    void demoSummary().then((x) => { if (alive) setD(x); }, () => undefined);
    return () => { alive = false; };
  }, []);
  if (!d || d.people === 0) return null;
  return (
    <p className="card notice" style={{ display: 'flex', gap: 10, alignItems: 'center', margin: '0 0 16px', gridColumn: '1 / -1' }}>
      <FlaskConical size={16} style={{ color: 'var(--warn)', flex: 'none' }} />
      <span className="grow" style={{ fontSize: 13 }}>
        These numbers are real reads of every gym's data — and that data still includes the demo seed: {d.people.toLocaleString('en-PH')} seeded
        people, {d.attendance.toLocaleString('en-PH')} check-ins and {d.payments.toLocaleString('en-PH')} payments that never happened.
      </span>
      <Link className="btn ghost" to="/platform">Remove it</Link>
    </p>
  );
}
