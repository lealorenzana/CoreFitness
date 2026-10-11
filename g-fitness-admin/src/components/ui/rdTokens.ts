/** The redesign kit's colours (rd.tsx), apart so components-only files stay Fast Refresh friendly. */
export type Tone = 'violet' | 'amber' | 'green' | 'red' | 'blue' | 'gray';

export const TONE: Record<Tone, { fg: string; bg: string; line: string; dot: string }> = {
  violet: { fg: '#C4B5FD', bg: 'rgba(124, 58, 237, 0.16)', line: 'rgba(139, 92, 246, 0.45)', dot: '#8B5CF6' },
  amber:  { fg: '#FBBF24', bg: 'rgba(245, 158, 11, 0.13)', line: 'rgba(245, 158, 11, 0.45)', dot: '#F59E0B' },
  green:  { fg: '#4ADE80', bg: 'rgba(34, 197, 94, 0.12)',  line: 'rgba(34, 197, 94, 0.38)',  dot: '#22C55E' },
  red:    { fg: '#F87171', bg: 'rgba(239, 68, 68, 0.12)',  line: 'rgba(239, 68, 68, 0.38)',  dot: '#EF4444' },
  blue:   { fg: '#93C5FD', bg: 'rgba(59, 130, 246, 0.13)', line: 'rgba(59, 130, 246, 0.4)',  dot: '#3B82F6' },
  gray:   { fg: '#D1D5DB', bg: 'rgba(255, 255, 255, 0.06)', line: 'rgba(255, 255, 255, 0.12)', dot: '#6B7280' },
};

/** Attendance's three views, one tab row on each (Today · Walk-ins · History). */
export const ATTENDANCE_TABS = [
  { label: 'Today', to: '/attendance' },
  { label: 'Walk-ins', to: '/attendance/walk-ins' },
  { label: 'History', to: '/attendance-history' },
];
