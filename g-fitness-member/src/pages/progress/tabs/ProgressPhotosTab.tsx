import { useEffect, useRef, useState } from 'react';
import { Camera, Trash2 } from 'lucide-react';
import { progressService, type ProgressPhoto } from '../../../services/progressService';
import { useMemberId } from '../hooks/useMemberId';
import { Skeleton } from '../../../components/ui/Skeleton';
import EmptyState from '../../../components/ui/EmptyState';
import ErrorState from '../../../components/ui/ErrorState';

export default function ProgressPhotosTab() {
  const memberId = useMemberId();
  const [photos, setPhotos]   = useState<ProgressPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(false);
  const [sliderPos, setSliderPos] = useState(50);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const load = async () => {
    setLoading(true); setError(false);
    try { setPhotos(await progressService.getProgressPhotos(memberId)); }
    catch { setError(true); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [memberId]);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      await progressService.addProgressPhoto(memberId, reader.result as string, 'Front');
      load();
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this photo?')) return;
    await progressService.deleteProgressPhoto(memberId, id);
    load();
  };

  if (loading) return (
    <div className="space-y-3">
      <Skeleton className="h-48" />
      <Skeleton className="h-32" />
    </div>
  );
  if (error) return <ErrorState onRetry={load} />;

  const oldest = photos[0];
  const latest = photos[photos.length - 1];

  return (
    <div className="space-y-4">
      <button onClick={() => fileRef.current?.click()}
        className="w-full py-3 rounded-xl font-semibold text-black flex items-center justify-center gap-2"
        style={{ background: 'var(--color-secondary)' }}>
        <Camera size={18} /> Upload New Photo
      </button>
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />

      {/* Comparison slider */}
      {oldest && latest && oldest.id !== latest.id && (
        <div className="rounded-2xl p-4" style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}>
          <h3 className="text-white font-semibold text-sm mb-2">Then vs Now</h3>
          <div className="relative w-full overflow-hidden rounded-xl" style={{ aspectRatio: '3 / 4', background: 'var(--color-bg)' }}>
            <img src={latest.url} alt="latest"
              className="absolute inset-0 w-full h-full object-cover"
              style={{ objectFit: 'cover' }} />
            <div
              className="absolute top-0 bottom-0 left-0 overflow-hidden"
              style={{ width: `${sliderPos}%` }}>
              <img src={oldest.url} alt="oldest"
                className="w-full h-full object-cover"
                style={{ objectFit: 'cover', minWidth: '100%' }} />
            </div>
            <div className="absolute top-0 bottom-0" style={{ left: `${sliderPos}%`, transform: 'translateX(-50%)' }}>
              <div className="w-0.5 h-full" style={{ background: 'var(--color-secondary)' }} />
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-6 h-6 rounded-full flex items-center justify-center"
                style={{ background: 'var(--color-secondary)' }}>
                <span className="text-[10px] text-black font-bold">↔</span>
              </div>
            </div>
            <div className="absolute top-2 left-2 px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ background: 'rgba(0,0,0,0.6)', color: '#fff' }}>
              {new Date(oldest.date).toLocaleDateString()}
            </div>
            <div className="absolute top-2 right-2 px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ background: 'rgba(0,0,0,0.6)', color: 'var(--color-secondary)' }}>
              {new Date(latest.date).toLocaleDateString()}
            </div>
          </div>
          <input type="range" min={0} max={100} value={sliderPos}
            onChange={e => setSliderPos(Number(e.target.value))}
            className="w-full mt-3 accent-yellow-400" />
        </div>
      )}

      {/* Timeline */}
      <div>
        <h4 className="text-white font-semibold mb-2 px-1">Timeline</h4>
        {photos.length === 0 ? (
          <EmptyState icon={Camera} title="No photos yet"
            message="Upload progress shots and watch your transformation."
            cta={{ label: 'Upload Photo', onClick: () => fileRef.current?.click() }} />
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {photos.map(p => (
              <div key={p.id} className="relative rounded-xl overflow-hidden"
                style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)', aspectRatio: '3 / 4' }}>
                <img src={p.url} alt={p.label} className="w-full h-full object-cover" />
                <div className="absolute bottom-0 left-0 right-0 px-1.5 py-1"
                  style={{ background: 'rgba(0,0,0,0.75)' }}>
                  <p className="text-[10px] font-bold text-white">{new Date(p.date).toLocaleDateString()}</p>
                </div>
                <button onClick={() => handleDelete(p.id)}
                  className="absolute top-1 right-1 p-1 rounded-md"
                  style={{ background: 'rgba(0,0,0,0.6)', color: 'var(--color-secondary)' }}>
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
