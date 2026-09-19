import type { ActivityRow } from '../services/membershipHubService';
import { localDateKey } from './dates';

function peso(n: number): string {
  return `₱${n.toLocaleString('en-PH')}`;
}

export type Filter = 'all' | 'points' | 'payments';

/**
 * One line of the statement. Identical entries on the same day fold into one —
 * five "Logged a workout +15" rows said less than "Logged a workout ×5 · +75".
 */
export interface Line {
  key: string;
  at: string;
  title: string;
  sub: string | null;
  amount: string;
  tone: string;
  kind: ActivityRow['kind'];
}

export function toLines(rows: ActivityRow[]): Line[] {
  const out: (Line & { base: string; count: number; points: number })[] = [];
  for (const a of rows) {
    const day = localDateKey(a.at);
    if (a.kind === 'earned') {
      const prev = out[out.length - 1];
      if (prev && prev.kind === 'earned' && localDateKey(prev.at) === day && prev.base === a.title) {
        prev.count += 1;
        prev.points += a.points;
        prev.title = `${a.title} ×${prev.count}`;
        prev.amount = `+${prev.points}`;
        continue;
      }
      out.push({ key: `e:${a.at}`, at: a.at, kind: a.kind, title: a.title, base: a.title, sub: 'Points earned',
        amount: `+${a.points}`, tone: 'var(--color-primary-300)', count: 1, points: a.points });
    } else if (a.kind === 'spent') {
      out.push({ key: `s:${a.at}`, at: a.at, kind: a.kind, title: `Redeemed ${a.title.toLowerCase()}`,
        sub: a.status === 'pending' ? 'Requested — waiting for the desk'
          : a.status === 'fulfilled' ? 'Collected at the desk' : 'Approved — collect at the desk',
        amount: `−${a.points}`, tone: 'var(--color-text-muted)', base: '', count: 1, points: 0 });
    } else if (a.kind === 'paid') {
      out.push({ key: `p:${a.at}`, at: a.at, kind: a.kind, title: `Payment · ${a.method}`, sub: 'Recorded at the desk',
        amount: peso(a.amount), tone: 'var(--color-text-primary)', base: '', count: 1, points: 0 });
    } else {
      out.push({ key: `m:${a.at}`, at: a.at, kind: a.kind, title: a.title, sub: a.note, amount: '',
        tone: 'var(--color-text-muted)', base: '', count: 1, points: 0 });
    }
  }
  return out;
}


/** The filter chips' rule, shared by the preview and the full page. */
export function matchesFilter(a: ActivityRow, filter: Filter): boolean {
  return filter === 'all' ? true
    : filter === 'points' ? a.kind === 'earned' || a.kind === 'spent'
    : a.kind === 'paid';
}
