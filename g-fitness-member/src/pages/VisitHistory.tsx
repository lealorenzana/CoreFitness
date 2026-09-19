import { useEffect, useMemo, useState } from 'react';
import { Page, PageTitle } from '../components/ui/page';
import { LineRow } from '../components/ui/noc';
import { SkeletonList } from '../components/ui/Skeleton';
import { getCurrentMemberId } from '../services/bookingService';
import { listMemberAttendance } from '../lib/api/attendance';
import type { AttendanceRow } from '../types/db';
import { errorMessage } from '../utils/errorMessage';

/**
 * Every check-in, by month (2026-09-19). Attendance shows the latest five and
 * "See all"; this is "all". Newest first, each with the time, what was trained
 * (0018, when recorded) and how it was recorded.
 */
export default function VisitHistory() {
  const [rows, setRows] = useState<AttendanceRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const id = await getCurrentMemberId();
        if (!id) throw new Error('Your session could not be verified.');
        const r = await listMemberAttendance(id);
        if (alive) setRows(r);
      } catch (err) {
        if (alive) setError(errorMessage(err, 'Could not load your visits.'));
      }
    })();
    return () => { alive = false; };
  }, []);

  const months = useMemo(() => {
    const sorted = [...(rows ?? [])].sort((a, b) => b.check_in_time.localeCompare(a.check_in_time));
    const out: [string, AttendanceRow[]][] = [];
    for (const r of sorted) {
      const label = new Date(r.check_in_time).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      const last = out[out.length - 1];
      if (last && last[0] === label) last[1].push(r);
      else out.push([label, [r]]);
    }
    return out;
  }, [rows]);

  return (
    <Page>
      <PageTitle back fallback="/member/attendance-history" title="All visits"
        subtitle={rows ? `${rows.length} ${rows.length === 1 ? 'check-in' : 'check-ins'} in all` : 'Every check-in'} />
      {error ? (
        <p style={{ fontSize: 13, color: 'var(--color-secondary)' }}>{error}</p>
      ) : rows == null ? (
        <SkeletonList />
      ) : rows.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>No check-ins yet — they appear here once you scan in at the desk.</p>
      ) : (
        months.map(([label, list]) => (
          <section key={label}>
            <h2 style={{ fontSize: 'var(--text-title)', fontWeight: 700, color: 'var(--color-text-primary)' }}>
              {label}<span style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-muted)' }}> · {list.length}</span>
            </h2>
            <div style={{ marginTop: 4 }}>
              {list.map((r, i) => {
                const at = new Date(r.check_in_time);
                return (
                  <LineRow key={r.id} gutterWidth={56}
                    gutter={at.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' })}
                    title={r.activity ?? 'Gym floor'}
                    meta={`${at.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} · ${r.method === 'qr' ? 'QR code' : 'Recorded by the desk'}`}
                    last={i === list.length - 1} />
                );
              })}
            </div>
          </section>
        ))
      )}
    </Page>
  );
}
