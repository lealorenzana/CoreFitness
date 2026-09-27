import { useEffect, useState } from 'react';
import { traineePhotos, type ProgressPhoto } from '../../lib/api/photos';

/**
 * A trainee's progress photos (0132), for their coach — only when the trainee
 * shares their album. The database decides (may_see_progress_photo); a private
 * album comes back empty and this renders nothing. The gym's desk has no such
 * view: photos are the member's and their coach's alone.
 */
export default function TraineePhotos({ memberId, firstName }: { memberId: string; firstName: string }) {
  const [photos, setPhotos] = useState<ProgressPhoto[]>([]);
  useEffect(() => {
    let alive = true;
    void (async () => { const p = await traineePhotos(memberId); if (alive) setPhotos(p); })();
    return () => { alive = false; };
  }, [memberId]);

  if (photos.length === 0) return null;
  const first = photos[photos.length - 1];
  const last = photos[0];
  const d = (s: string) => new Date(`${s}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return (
    <div style={{ marginTop: 14 }}>
      <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-primary-300)' }}>
        Progress photos · {firstName} shares {photos.length}
      </p>
      <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 8, marginTop: 6 }}>
        {(photos.length > 1 ? [first, last] : [last]).map((p) => (
          <figure key={p.id}>
            {p.url && <img src={p.url} alt={`${p.pose}, ${d(p.takenOn)}`} loading="lazy"
              style={{ width: '100%', aspectRatio: '3 / 4', objectFit: 'cover', borderRadius: 10 }} />}
            <figcaption style={{ fontSize: 12, marginTop: 2, color: 'var(--color-text-muted)' }}>
              {p === first && photos.length > 1 ? 'First' : 'Latest'} · {d(p.takenOn)}{p.note ? ` · ${p.note}` : ''}
            </figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}
