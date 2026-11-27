import { useState } from 'react';
import { CaretDown, CaretRight, DownloadSimple } from '@phosphor-icons/react';
import GlassSheet from '../ui/GlassSheet';
import { NocButton } from '../ui/noc';
import type { MemberDataExport } from '../../lib/memberDataExport';

/** What each part of the file is, in the member's words. A table missing here shows its own name. */
const LABEL: Record<string, string> = {
  profiles: 'Your profile', member_profiles: 'Member details', memberships: 'Memberships', membership_events: 'Membership changes',
  payments: 'Payments', renewal_requests: 'Renewal requests', attendance: 'Visits', bookings: 'Class bookings', pt_sessions: '1-on-1 sessions',
  gym_plans: 'Plans from your coach', workout_routines: 'Routines', workout_logs: 'Workouts', body_measurements: 'Body measurements',
  point_ledger: 'Points', reward_redemptions: 'Rewards claimed', saved_resources: 'Saved exercises', trainer_feedback: 'Notes from your coach',
  trainer_ratings: 'Your coach ratings', member_share_prefs: 'What coaches may see', ai_coach_profiles: 'Assistant setup', ai_usage_days: 'Assistant use',
  ai_meal_guides: 'Meal guides', ai_proposals: 'Assistant suggestions', notification_prefs: 'Notification settings', notifications: 'Notifications',
};
const SHOWN = 20;
const show = (v: unknown) => (v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v));

/**
 * Your data, before it is downloaded (owner, 2026-11-27): every part of the file with how many records it holds,
 * open one to see them, untick what you do not want, then Download. The file is the same JSON the desk can give.
 */
export default function MyDataReview({ exp, onClose, onDownload }: {
  exp: MemberDataExport | null; onClose: () => void; onDownload: (exp: MemberDataExport) => void;
}) {
  const [off, setOff] = useState<Set<string>>(new Set());
  const [openKey, setOpenKey] = useState<string | null>(null);
  const tables = exp ? Object.keys(exp.data) : [];
  const withRows = tables.filter((t) => (exp?.data[t]?.length ?? 0) > 0);
  const empty = tables.length - withRows.length;
  const chosen = withRows.filter((t) => !off.has(t));
  const records = chosen.reduce((n, t) => n + (exp?.data[t]?.length ?? 0), 0);
  const flip = (t: string) => setOff((s) => { const n = new Set(s); if (n.has(t)) n.delete(t); else n.add(t); return n; });

  const download = () => {
    if (!exp) return;
    onDownload({ ...exp, data: Object.fromEntries(tables.filter((t) => !off.has(t)).map((t) => [t, exp.data[t]])) });
  };

  return (
    <GlassSheet open={!!exp} onClose={onClose} title="Your data" subtitle={`${withRows.length} parts hold records${empty ? `, ${empty} are empty` : ''}`}
      footer={(
        <NocButton variant="action" className="w-full" disabled={chosen.length === 0} icon={<DownloadSimple size={16} />} onClick={download}>
          Download {records.toLocaleString('en-PH')} record{records === 1 ? '' : 's'}
        </NocButton>
      )}>
      <div data-my-data-review>
        {withRows.map((t) => {
          const rows = exp!.data[t] as Record<string, unknown>[];
          const isOpen = openKey === t;
          return (
            <div key={t} style={{ borderBottom: '1px solid rgb(var(--hair-rgb, 255 255 255) / 0.08)' }} data-my-data-part={t}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0' }}>
                <input type="checkbox" checked={!off.has(t)} onChange={() => flip(t)} aria-label={`Include ${LABEL[t] ?? t}`}
                  style={{ width: 18, height: 18, accentColor: 'var(--color-primary)', flex: 'none' }} />
                <button type="button" onClick={() => setOpenKey(isOpen ? null : t)} aria-expanded={isOpen}
                  style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 8, textAlign: 'left', opacity: off.has(t) ? 0.5 : 1 }}>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)' }}>{LABEL[t] ?? t}</span>
                  <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{rows.length}</span>
                  {isOpen ? <CaretDown size={14} /> : <CaretRight size={14} />}
                </button>
              </div>
              {isOpen && (
                <div style={{ paddingBottom: 12, display: 'grid', gap: 8 }}>
                  {rows.slice(0, SHOWN).map((r, i) => (
                    <div key={i} style={{ fontSize: 12, lineHeight: 1.5, padding: '8px 10px', borderRadius: 10, background: 'rgb(var(--hair-rgb, 255 255 255) / 0.04)', overflowWrap: 'anywhere' }}>
                      {Object.entries(r).filter(([, v]) => v !== null && v !== '').slice(0, 8).map(([k, v]) => (
                        <div key={k}><span style={{ color: 'var(--color-text-secondary)' }}>{k.replace(/_/g, ' ')}: </span>{show(v).slice(0, 120)}</div>
                      ))}
                    </div>
                  ))}
                  {rows.length > SHOWN && <p style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>The first {SHOWN} are shown; all {rows.length} go in the file.</p>}
                </div>
              )}
            </div>
          );
        })}
        {exp && Object.keys(exp.unavailable).length > 0 && (
          <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 12 }}>
            {Object.keys(exp.unavailable).length} part{Object.keys(exp.unavailable).length === 1 ? '' : 's'} could not be read; the file lists them.
          </p>
        )}
      </div>
    </GlassSheet>
  );
}
