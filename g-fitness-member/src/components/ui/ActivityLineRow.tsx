import type { Line } from '../../utils/activityLines';

const shortDate = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

/** One line of the account statement — the You tab's preview and the Account activity page. */
export default function ActivityLineRow({ l, last }: { l: Line; last: boolean }) {
  return (
    <div className="flex items-center" style={{
      gap: 12, padding: '12px 0', borderBottom: last ? 'none' : '1px solid var(--color-separator)',
    }}>
      <span className="flex-none" style={{ width: 44, fontSize: 12, color: 'var(--color-text-secondary)' }}>
        {shortDate(new Date(l.at))}
      </span>
      <span className="flex-1 min-w-0">
        <span className="block truncate" style={{ fontSize: 14.5, fontWeight: 600, color: 'var(--color-text-primary)' }}>{l.title}</span>
        {l.sub && <span className="block truncate" style={{ fontSize: 12, marginTop: 2, color: 'var(--color-text-muted)' }}>{l.sub}</span>}
      </span>
      {l.amount && <span className="flex-none" style={{ fontSize: 14, fontWeight: 600, color: l.tone }}>{l.amount}</span>}
    </div>
  );
}
