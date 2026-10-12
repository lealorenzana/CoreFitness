import { useRef, useState } from 'react';
import { ImagePlus, RefreshCw, Trash2 } from 'lucide-react';
import { uploadContentPhoto } from '../../lib/api/exerciseMedia';

/**
 * A photo for something the gym offers (a reward, a shop product): drop or pick
 * a JPEG/PNG/WebP, it is shrunk and uploaded into one of the gym's counted photo
 * slots (`reserve_gym_photo`, media/gyms/<gym id>/content/…). The URL that comes
 * back is the only kind the database accepts (0197's trigger for rewards).
 */
export default function PhotoPicker({ value, onChange, label = 'Photo', aspect = '4 / 3', onBusy }: {
  value: string | null; onChange: (url: string | null) => void; label?: string; aspect?: string;
  onBusy?: (busy: boolean) => void;
}) {
  const file = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [over, setOver] = useState(false);

  const take = async (f: File | undefined) => {
    if (!f) return;
    setBusy(true); onBusy?.(true); setError(null);
    try { onChange(await uploadContentPhoto(f)); }
    catch (e) { setError(e instanceof Error ? e.message : 'The photo could not be added.'); }
    finally { setBusy(false); onBusy?.(false); if (file.current) file.current.value = ''; }
  };

  return (
    <div data-photo-picker>
      <span className="block text-[13px] font-medium mb-1.5" style={{ color: 'var(--color-text-secondary)' }}>{label}</span>
      <div
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); void take(e.dataTransfer.files?.[0]); }}
        className="relative w-full rounded-2xl overflow-hidden"
        style={{ aspectRatio: aspect, border: `1.5px ${value ? 'solid' : 'dashed'} ${over ? 'rgba(167,139,250,0.9)' : 'rgba(255,255,255,0.14)'}`,
          background: over ? 'rgba(124,58,237,0.12)' : 'rgba(255,255,255,0.02)' }}>
        {value ? (
          <>
            <img src={value} alt="" className="absolute inset-0 w-full h-full object-cover" />
            <div className="absolute inset-x-0 bottom-0 flex gap-2 p-2.5 justify-end" style={{ background: 'linear-gradient(transparent, rgba(0,0,0,0.65))' }}>
              <button type="button" onClick={() => file.current?.click()} disabled={busy}
                className="h-8 px-3 rounded-lg text-[12.5px] font-semibold inline-flex items-center gap-1.5 text-white" style={{ background: 'rgba(0,0,0,0.55)', border: '1px solid rgba(255,255,255,0.2)' }}>
                <RefreshCw size={13} /> {busy ? 'Uploading…' : 'Change'}
              </button>
              <button type="button" onClick={() => onChange(null)} disabled={busy} aria-label="Remove the photo"
                className="h-8 w-8 rounded-lg grid place-items-center text-white" style={{ background: 'rgba(0,0,0,0.55)', border: '1px solid rgba(255,255,255,0.2)' }}>
                <Trash2 size={13} />
              </button>
            </div>
          </>
        ) : (
          <button type="button" onClick={() => file.current?.click()} disabled={busy} aria-label={`Add a ${label.toLowerCase()}`}
            className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center px-4">
            <ImagePlus size={28} style={{ color: '#C4B5FD' }} />
            <span className="text-[14px] font-semibold text-white">{busy ? 'Uploading…' : 'Add a photo'}</span>
            <span className="text-[12px]" style={{ color: 'var(--color-text-muted)' }}>Drop it here or click — JPEG, PNG or WebP</span>
          </button>
        )}
      </div>
      <input ref={file} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => void take(e.target.files?.[0])} />
      {error && <p className="text-[12.5px] mt-1.5" style={{ color: '#FBBF24' }}>{error}</p>}
    </div>
  );
}
