/**
 * The bottom of a figures column (owner, 2026-11-28: "there should be no dead space"): one breakdown that fills
 * what is left, label, a bar against the largest and the count. Only numbers the page already read; an empty list
 * says so. A long list scrolls inside, never the page.
 */
export default function FigBreakdown({ title, rows, empty, onPick }: {
  title: string;
  rows: { key: string; label: string; value: number; sub?: string }[];
  empty: string;
  onPick?: (key: string) => void;
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <section className="fb" aria-label={title} data-fig-breakdown>
      <h3>{title}</h3>
      {rows.length === 0 ? <p className="fb-empty">{empty}</p> : (
        <ul>
          {rows.map((r) => {
            const body = (
              <>
                <span className="fb-l"><span>{r.label}</span><b>{r.value}</b></span>
                <i className="fb-bar"><i style={{ width: `${(r.value / max) * 100}%` }} /></i>
                {r.sub && <small>{r.sub}</small>}
              </>
            );
            return <li key={r.key}>{onPick ? <button type="button" onClick={() => onPick(r.key)}>{body}</button> : <div>{body}</div>}</li>;
          })}
        </ul>
      )}
    </section>
  );
}
