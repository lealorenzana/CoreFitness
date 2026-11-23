/** The redesign kit's colours (rd.tsx), apart so components-only files stay Fast Refresh friendly. */
export type Tone = 'violet' | 'amber' | 'green' | 'red' | 'blue' | 'gray';

export const TONE: Record<Tone, { fg: string; bg: string; line: string; dot: string }> = {
  // Text shades and the grey fill go through variables so light mode (light.css, 0234) can deepen them.
  // The gym's own colour, never a fixed violet (Design V2).
  violet: { fg: 'var(--tone-violet-fg, #C4B5FD)', bg: 'color-mix(in srgb, var(--color-primary) 16%, transparent)', line: 'color-mix(in srgb, var(--color-primary) 45%, transparent)', dot: 'var(--color-primary)' },
  amber:  { fg: 'var(--tone-amber-fg, #FBBF24)', bg: 'rgba(245, 158, 11, 0.13)', line: 'rgba(245, 158, 11, 0.45)', dot: '#F59E0B' },
  green:  { fg: 'var(--tone-green-fg, #4ADE80)', bg: 'rgba(34, 197, 94, 0.12)',  line: 'rgba(34, 197, 94, 0.38)',  dot: '#22C55E' },
  red:    { fg: 'var(--tone-red-fg, #F87171)', bg: 'rgba(239, 68, 68, 0.12)',  line: 'rgba(239, 68, 68, 0.38)',  dot: '#EF4444' },
  blue:   { fg: 'var(--tone-blue-fg, #93C5FD)', bg: 'rgba(59, 130, 246, 0.13)', line: 'rgba(59, 130, 246, 0.4)',  dot: '#3B82F6' },
  gray:   { fg: 'var(--tone-gray-fg, #D1D5DB)', bg: 'var(--tone-gray-bg, rgba(255, 255, 255, 0.06))', line: 'var(--tone-gray-line, rgba(255, 255, 255, 0.12))', dot: '#6B7280' },
};

/** Attendance's three views, one tab row on each (Today · Walk-ins · History). */
export const ATTENDANCE_TABS = [
  { label: 'Today', to: '/attendance' },
  { label: 'Walk-ins', to: '/attendance/walk-ins' },
  { label: 'History', to: '/attendance-history' },
];

/** The kit's text input (rd.tsx RdField wraps it). */
export const RD_INPUT = 'w-full h-11 px-3.5 rounded-xl text-[14.5px] text-white outline-none focus:ring-2 focus:ring-[color:color-mix(in_srgb,var(--color-primary)_40%,transparent)]';
export const RD_INPUT_STYLE = { background: 'var(--rd-input-bg, rgba(255,255,255,0.03))', border: '1px solid var(--rd-input-line, rgba(255,255,255,0.1))' } as const;
