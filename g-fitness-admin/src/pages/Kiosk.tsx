import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import jsQR from 'jsqr';
import { Camera, CheckCircle2, LogOut, QrCode, AlertTriangle } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { listMembers, type MemberWithProfile } from '../lib/api/members';
import { getGymSettings } from '../lib/api/settings';
import { performCheckIn, resolveCheckInCode } from '../services/checkInService';
import { todayKey } from '../utils/dates';

type Flash = { kind: 'ok' | 'error'; title: string; detail: string } | null;

/** How long the same code is ignored after a scan — a phone held up for three seconds is one visit. */
const SAME_CODE_COOLDOWN_MS = 8000;
const FLASH_MS = 4200;
/** Hold Exit this long. A tap from a member waiting in line must not unlock the desk. */
const EXIT_HOLD_MS = 1500;

/**
 * Self-service check-in (2026-09-19): a full-screen page for a PC or tablet by
 * the door. The camera stays on; a member holds up the QR from their phone (or
 * types their six-character code) and is checked in with no one at the desk.
 *
 * It is the desk's own check-in, not a second one: the code is resolved and the
 * rules applied by `services/checkInService.ts`, the same functions the
 * Attendance page calls, and the row is written under the signed-in staff
 * account exactly as at the counter (RLS allows staff inserts only — a member
 * can never self-report a visit).
 *
 * What a queue can see: the first name and "checked in". Never the points
 * balance or the membership detail — the screen faces the room.
 *
 * Scanning runs on a timer, not requestAnimationFrame: rAF stops on a page that
 * is not compositing (CLAUDE.md), and a kiosk that silently stops scanning is
 * the one failure it must not have.
 */
export default function Kiosk() {
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const busyRef = useRef(false);
  const lastRef = useRef<{ code: string; at: number }>({ code: '', at: 0 });
  const membersRef = useRef<MemberWithProfile[]>([]);
  const todayRef = useRef<Set<string>>(new Set());
  /** A ref, not state: the camera effect depends on submit, and a state change here would restart the stream. */
  const adminRef = useRef<string | null>(null);
  const [gymName, setGymName] = useState('');
  const [camError, setCamError] = useState('');
  const [flash, setFlash] = useState<Flash>(null);
  const [code, setCode] = useState('');
  const [count, setCount] = useState(0);
  const [now, setNow] = useState(() => new Date());
  const [holding, setHolding] = useState(false);
  const holdTimer = useRef<number | null>(null);

  const refreshToday = useCallback(async () => {
    const start = new Date(`${todayKey()}T00:00:00+08:00`).toISOString();
    const { data } = await supabase.from('attendance').select('member_id').gte('check_in_time', start);
    todayRef.current = new Set((data ?? []).map((r) => r.member_id as string));
    setCount(todayRef.current.size);
  }, []);

  // Session, roster, settings, today's visits — and a refresh every minute so a
  // check-in made at the desk meanwhile still counts as "already in".
  useEffect(() => {
    let alive = true;
    void (async () => {
      const [{ data: { user } }, members, settings] = await Promise.all([
        supabase.auth.getUser(),
        listMembers().catch(() => [] as MemberWithProfile[]),
        getGymSettings().catch(() => null),
      ]);
      if (!alive) return;
      adminRef.current = user?.id ?? null;
      membersRef.current = members;
      setGymName(settings?.gym_name ?? '');
      await refreshToday();
    })();
    const t = window.setInterval(() => { void refreshToday(); setNow(new Date()); }, 60_000);
    const c = window.setInterval(() => setNow(new Date()), 1000);
    return () => { alive = false; window.clearInterval(t); window.clearInterval(c); };
  }, [refreshToday]);

  const show = useCallback((f: Flash) => {
    setFlash(f);
    window.setTimeout(() => setFlash((cur) => (cur === f ? null : cur)), FLASH_MS);
  }, []);

  const submit = useCallback(async (raw: string) => {
    const value = raw.trim();
    if (!value || busyRef.current) return;
    const at = Date.now();
    if (lastRef.current.code === value && at - lastRef.current.at < SAME_CODE_COOLDOWN_MS) return;
    lastRef.current = { code: value, at };
    busyRef.current = true;
    try {
      const found = await resolveCheckInCode(value, membersRef.current);
      if ('error' in found) {
        show({ kind: 'error', title: 'That code did not work', detail: found.error });
        return;
      }
      const res = await performCheckIn(found.member, found.method, {
        alreadyInToday: todayRef.current.has(found.member.profile.id),
        adminId: adminRef.current,
        where: 'kiosk',
      });
      const first = found.member.profile.first_name;
      if (res.ok) {
        todayRef.current.add(found.member.profile.id);
        setCount(todayRef.current.size);
        show({ kind: 'ok', title: `Welcome, ${first}!`, detail: 'You are checked in. Have a great session.' });
      } else if (res.reason === 'duplicate') {
        show({ kind: 'ok', title: `You're already in, ${first}`, detail: 'Today\'s visit is already on record.' });
      } else if (res.reason === 'membership') {
        // Not the reason itself — "your membership has expired" is not for the
        // whole queue to read. The desk can tell them privately.
        show({ kind: 'error', title: `${first}, please see the front desk`, detail: 'Your membership needs attention before you can check in.' });
      } else {
        show({ kind: 'error', title: 'Check-in did not go through', detail: res.message });
      }
    } finally {
      busyRef.current = false;
      setCode('');
    }
  }, [show]);

  // The camera: the first one, at 1280x720 (the desk scanner's reasons apply).
  useEffect(() => {
    let cancelled = false;
    let stream: MediaStream | null = null;
    let timer: number | null = null;
    void (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 } } });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        const v = videoRef.current;
        if (!v) return;
        v.srcObject = stream;
        await v.play();
        const canvas = canvasRef.current ?? document.createElement('canvas');
        canvasRef.current = canvas;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        timer = window.setInterval(() => {
          if (busyRef.current || !ctx || v.readyState !== v.HAVE_ENOUGH_DATA) return;
          canvas.width = v.videoWidth;
          canvas.height = v.videoHeight;
          ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
          // The whole frame, never a crop, and both polarities — see QRScanner.
          const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const found = jsQR(frame.data, frame.width, frame.height, { inversionAttempts: 'attemptBoth' });
          if (found?.data) void submit(found.data);
        }, 220);
      } catch {
        if (!cancelled) setCamError('No camera is available. Members can still type their six-character code below.');
      }
    })();
    return () => {
      cancelled = true;
      if (timer != null) window.clearInterval(timer);
      stream?.getTracks().forEach((t) => { try { t.stop(); } catch { /* ended */ } });
    };
  }, [submit]);

  const startHold = () => {
    setHolding(true);
    holdTimer.current = window.setTimeout(() => navigate('/attendance'), EXIT_HOLD_MS);
  };
  const endHold = () => {
    setHolding(false);
    if (holdTimer.current != null) window.clearTimeout(holdTimer.current);
  };

  const time = now.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Manila' });
  const date = now.toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'Asia/Manila' });

  return (
    <div className="fixed inset-0 flex flex-col lg:flex-row overflow-hidden select-none"
      style={{ background: 'radial-gradient(120% 90% at 100% 0%, rgba(124,58,237,0.25) 0%, transparent 60%), var(--color-bg)' }}>
      {/* The camera */}
      <div className="relative flex-1 min-h-0 flex items-center justify-center p-6">
        <div className="relative w-full max-w-3xl aspect-video rounded-3xl overflow-hidden"
          style={{ background: '#000', border: '1px solid var(--color-border)', boxShadow: '0 30px 80px -30px rgba(124,58,237,0.6)' }}>
          <video ref={videoRef} muted playsInline className="w-full h-full object-cover" style={{ transform: 'scaleX(-1)' }} />
          {/* A frame to aim at — decoration only; the whole picture is read. */}
          {!camError && <div aria-hidden className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-1/3 aspect-square rounded-2xl" style={{ border: '3px solid rgba(196,181,253,0.85)', boxShadow: '0 0 0 9999px rgba(0,0,0,0.25)' }} />
          </div>}
          {camError && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center px-8">
              <Camera size={40} style={{ color: 'var(--color-text-muted)' }} />
              <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>{camError}</p>
            </div>
          )}
        </div>
      </div>

      {/* The instructions */}
      <div className="w-full lg:w-[420px] flex flex-col justify-between p-8 gap-6"
        style={{ borderLeft: '1px solid var(--color-border)', background: 'rgba(8,8,14,0.6)' }}>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: 'var(--color-text-muted)' }}>{gymName || 'Check-in'}</p>
          <p className="text-6xl font-bold text-white tabular-nums mt-3">{time}</p>
          <p className="text-sm mt-1" style={{ color: 'var(--color-text-secondary)' }}>{date}</p>
        </div>

        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <QrCode size={26} className="flex-shrink-0 mt-1" style={{ color: '#c4b5fd' }} />
            <div>
              <p className="text-xl font-semibold text-white">Check yourself in</p>
              <p className="text-sm mt-1" style={{ color: 'var(--color-text-secondary)' }}>
                Open the app, tap your check-in, and hold the QR code up to the camera.
              </p>
            </div>
          </div>
          <form onSubmit={(e) => { e.preventDefault(); void submit(code); }} className="flex gap-2">
            <input value={code} onChange={(e) => setCode(e.target.value.slice(0, 64))}
              placeholder="Or type your 6-character code" aria-label="Check-in code"
              className={`flex-1 min-w-0 h-14 rounded-xl px-4 font-semibold text-white outline-none ${code ? 'text-lg tracking-[0.2em] uppercase' : 'text-sm'}`}
              style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }} />
            <button type="submit" className="h-14 px-5 rounded-xl text-sm font-bold"
              style={{ background: 'var(--color-secondary)', color: '#08080E' }}>Go</button>
          </form>
        </div>

        <div className="flex items-end justify-between">
          <div>
            <p className="text-4xl font-bold text-white tabular-nums">{count}</p>
            <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>checked in today</p>
          </div>
          <button onPointerDown={startHold} onPointerUp={endHold} onPointerLeave={endHold}
            className="flex items-center gap-2 h-10 px-4 rounded-full text-xs font-semibold transition-colors"
            style={{
              border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)',
              background: holding ? 'rgba(124,58,237,0.3)' : 'transparent',
            }}
            title="Hold to leave kiosk mode">
            <LogOut size={14} /> {holding ? 'Keep holding…' : 'Hold to exit'}
          </button>
        </div>
      </div>

      {/* The answer, big enough to read from the door */}
      {flash && (
        <div role="status" aria-live="assertive" className="absolute inset-0 flex items-center justify-center p-8"
          style={{ background: 'rgba(8,8,14,0.78)', backdropFilter: 'blur(10px)' }}
          onClick={() => setFlash(null)}>
          <div className="text-center max-w-xl">
            {flash.kind === 'ok'
              ? <CheckCircle2 size={96} className="mx-auto" style={{ color: '#a78bfa' }} />
              : <AlertTriangle size={96} className="mx-auto" style={{ color: 'var(--color-secondary)' }} />}
            <p className="text-5xl font-bold text-white mt-6">{flash.title}</p>
            <p className="text-lg mt-3" style={{ color: 'var(--color-text-secondary)' }}>{flash.detail}</p>
          </div>
        </div>
      )}
    </div>
  );
}
