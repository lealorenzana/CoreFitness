import { useEffect, useRef, useState } from 'react';
import GlassSheet from '../ui/GlassSheet';
import { NocButton } from '../ui/noc';
import { TextInput } from '../ui/Field';
import { decodeQrFrame } from '../../lib/qrDecode';
import { codeFromQr, sendRequestByCode } from '../../lib/api/friends';
import { toast } from '../ui/Toast';

/**
 * Scan a friend's code (0217) — the QR on their Friend code screen, never the
 * check-in code. The whole frame, zxing first then jsQR (lib/qrDecode.ts, the
 * kiosk's own rule: never a crop). A camera that cannot read it is not a dead
 * end: the seven letters under their QR can be typed instead.
 */
export default function FriendScanner({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone?: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [camera, setCamera] = useState<'starting' | 'on' | 'off'>('starting');
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const done = useRef(false);

  const send = async (code: string) => {
    if (busy || done.current) return;
    setBusy(true);
    try {
      const r = await sendRequestByCode(code);
      done.current = true;
      toast.success(r.state === 'friends' ? `You and ${r.name} are friends now.` : `Request sent to ${r.name}.`);
      onDone?.();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'That code did not work.');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    done.current = false;
    let stream: MediaStream | null = null;
    let timer = 0;
    let alive = true;
    void (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
        if (!alive || !video.current) return;
        video.current.srcObject = stream;
        await video.current.play().catch(() => undefined);
        setCamera('on');
        const canvas = document.createElement('canvas');
        const look = async () => {
          const v = video.current;
          if (!alive || !v || done.current) return;
          if (v.videoWidth > 0) {
            canvas.width = v.videoWidth; canvas.height = v.videoHeight;
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            if (ctx) {
              ctx.drawImage(v, 0, 0);
              const text = await decodeQrFrame(ctx.getImageData(0, 0, canvas.width, canvas.height)).catch(() => null);
              const code = text ? codeFromQr(text) : null;
              if (code) { void send(code); return; }
            }
          }
          timer = window.setTimeout(() => void look(), 250);
        };
        void look();
      } catch {
        if (alive) setCamera('off');
      }
    })();
    return () => { alive = false; clearTimeout(timer); stream?.getTracks().forEach((t) => t.stop()); setCamera('starting'); };
    // `send` reads state through refs; restarting the camera on every keystroke would flicker.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <GlassSheet open={open} onClose={onClose} title="Scan a friend code">
      <div style={{ padding: '0 var(--gutter) 18px' }} data-friend-scanner>
        <div className="relative overflow-hidden" style={{ borderRadius: 18, aspectRatio: '1 / 1', background: 'var(--color-surface-raised)' }}>
          <video ref={video} playsInline muted className="w-full h-full object-cover" aria-label="Camera" />
          {camera !== 'on' && (
            <p className="absolute inset-0 grid place-items-center text-center" style={{ padding: 20, fontSize: 13, color: 'var(--color-text-secondary)' }}>
              {camera === 'off' ? 'The camera is not available. Type their code below.' : 'Starting the camera…'}
            </p>
          )}
        </div>
        <p style={{ fontSize: 12.5, marginTop: 10, color: 'var(--color-text-muted)' }}>
          Point it at the QR on your friend's Friend code screen. It is not the check-in code.
        </p>
        <form className="flex" style={{ gap: 8, marginTop: 12 }} onSubmit={(e) => { e.preventDefault(); if (typed.trim()) void send(typed.trim()); }}>
          <TextInput value={typed} onChange={(e) => setTyped(e.target.value.toUpperCase())} placeholder="Or type their 7-letter code"
            aria-label="Friend code" maxLength={7} autoCapitalize="characters" />
          <NocButton variant="action" type="submit" disabled={busy || typed.trim().length < 7}>Add</NocButton>
        </form>
      </div>
    </GlassSheet>
  );
}
