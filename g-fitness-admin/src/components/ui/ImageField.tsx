import { useRef, useState } from 'react';
import { ImagePlus, Trash2, Loader2, Link2, AlertTriangle } from 'lucide-react';
import { uploadMedia, removeMedia, mediaPathFromUrl, type MediaKind } from '../../lib/api/media';

/**
 * Pick a picture for an event, challenge, announcement or resource.
 *
 * ## Why this replaces a text box
 *
 * The Add Resource form asked for `/resource-previews/example.jpeg` — a path
 * into a folder inside the app's source tree. The only way for the gym to get a
 * picture into that folder is for a developer to commit one and redeploy, so in
 * practice the field could only ever be left blank. It looked like a feature
 * and was a instruction to phone someone.
 *
 * Now the file goes to storage (0065) and the field holds the URL that comes
 * back. The paste-a-URL option is kept for a picture that already lives
 * somewhere — and it is what makes the nine `/resource-previews/...` paths
 * seeded by 0061 still editable rather than mysteriously unrepresentable.
 *
 * ## What it does not do
 *
 * It does not invent a picture. Blank stays blank, and every screen that reads
 * one of these columns draws its own fallback rather than a stand-in photo.
 */
interface ImageFieldProps {
  value: string;
  onChange: (next: string) => void;
  kind: MediaKind;
  label?: string;
  hint?: string;
  /** Roughly how the picture will be cropped where it is shown. */
  aspect?: number;
}

export default function ImageField({
  value, onChange, kind, label = 'Picture', hint, aspect = 16 / 9,
}: ImageFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showUrl, setShowUrl] = useState(false);
  /** Set when the <img> fails, so a dead link says so instead of showing a gap. */
  const [broken, setBroken] = useState(false);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const url = await uploadMedia(file, kind);
      // Replace, not accumulate: tidy the file this field previously owned. It
      // never throws, so a failure here cannot block the new picture.
      if (mediaPathFromUrl(value)) await removeMedia(value);
      setBroken(false);
      onChange(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not upload that image.');
    } finally {
      setBusy(false);
      // Clear the input so re-picking the *same* file still fires onChange.
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const clear = async () => {
    const previous = value;
    onChange('');
    setBroken(false);
    if (mediaPathFromUrl(previous)) await removeMedia(previous);
  };

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 mb-1">
        <span className="text-[10px] font-semibold uppercase" style={{ color: 'var(--color-text-muted)' }}>
          {label} <span className="font-normal normal-case">· optional</span>
        </span>
        <button type="button" onClick={() => setShowUrl((v) => !v)}
          className="text-[10px] font-semibold flex items-center gap-1"
          style={{ color: 'var(--color-text-muted)' }}
          data-tip="Paste a web address instead of uploading a file">
          <Link2 size={10} /> {showUrl ? 'Hide link box' : 'Use a link'}
        </button>
      </div>

      {value && !broken ? (
        <div className="relative rounded-xl overflow-hidden"
          style={{ border: '1px solid var(--color-border)', background: 'var(--color-bg)' }}>
          <img
            src={value}
            alt=""
            onError={() => setBroken(true)}
            className="w-full object-cover block"
            style={{ aspectRatio: String(aspect) }}
          />
          <div className="absolute top-2 right-2 flex gap-1.5">
            <button type="button" onClick={() => inputRef.current?.click()} disabled={busy}
              className="px-2 h-7 rounded-lg text-[10px] font-semibold backdrop-blur-sm"
              style={{ background: 'rgba(0,0,0,0.6)', color: '#fff' }}
              data-tip="Choose a different picture">
              Replace
            </button>
            <button type="button" onClick={clear} disabled={busy}
              className="w-7 h-7 rounded-lg flex items-center justify-center backdrop-blur-sm"
              style={{ background: 'rgba(0,0,0,0.6)', color: 'var(--color-secondary)' }}
              data-tip="Remove this picture">
              <Trash2 size={12} />
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="w-full rounded-xl flex flex-col items-center justify-center gap-1.5 py-6 transition-colors"
          style={{
            background: 'var(--color-bg)',
            border: `1px dashed ${broken ? 'var(--color-secondary)' : 'var(--color-border)'}`,
            cursor: busy ? 'wait' : 'pointer',
          }}
          title="Upload a JPEG, PNG or WebP — it is resized automatically"
        >
          {busy ? (
            <>
              <Loader2 size={18} className="animate-spin" style={{ color: 'var(--color-primary)' }} />
              <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>Uploading…</span>
            </>
          ) : broken ? (
            <>
              <AlertTriangle size={18} style={{ color: 'var(--color-secondary)' }} />
              <span className="text-[11px]" style={{ color: 'var(--color-secondary)' }}>
                That link does not load a picture
              </span>
              <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
                Click to upload one instead
              </span>
            </>
          ) : (
            <>
              <ImagePlus size={18} style={{ color: 'var(--color-text-muted)' }} />
              <span className="text-[11px] font-semibold text-white">Add a picture</span>
              <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
                JPEG, PNG or WebP — resized for you
              </span>
            </>
          )}
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => void pick(e.target.files?.[0])}
      />

      {showUrl && (
        <input
          value={value}
          onChange={(e) => { setBroken(false); onChange(e.target.value); }}
          placeholder="https://… or /resource-previews/example.jpeg"
          className="w-full h-9 px-3 rounded-lg text-xs text-white mt-2"
          style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}
        />
      )}

      {error && (
        <p className="text-[10px] mt-1.5 flex items-start gap-1" style={{ color: 'var(--color-secondary)' }}>
          <AlertTriangle size={10} className="mt-0.5 flex-shrink-0" /> {error}
        </p>
      )}
      {hint && !error && (
        <p className="text-[10px] mt-1.5" style={{ color: 'var(--color-text-muted)' }}>{hint}</p>
      )}
    </div>
  );
}
