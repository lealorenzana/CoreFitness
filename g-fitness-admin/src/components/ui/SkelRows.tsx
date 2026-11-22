/** Grey shapes while something loads, instead of the word "Loading…"; the words stay for screen readers. */
export default function SkelRows({ label = 'Loading', rows = 3 }: { label?: string; rows?: number }) {
  return (
    <div className="cf-skel-rows" role="status" aria-label={label}>
      {Array.from({ length: rows }, (_, i) => <span key={i} className="cf-skel" style={{ width: `${[100, 84, 62, 92, 70][i % 5]}%` }} />)}
    </div>
  );
}
