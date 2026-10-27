import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { CrownSimple, FlagCheckered, Fire, HandsClapping, Target, type Icon } from '@phosphor-icons/react';
import GlassSheet from '../ui/GlassSheet';
import { NocButton } from '../ui/noc';
import { TextArea } from '../ui/Field';
import { toast } from '../ui/Toast';
import { sendMessageTo } from '../../lib/api/chat';
import { markWinSeen, unseenTraineeWins, type TraineeWin } from '../../lib/api/coachMoments';
import { buzz, play, reducedMotion } from '../../lib/moments';
import { errorMessage } from '../../utils/errorMessage';

const ICON: Record<TraineeWin['kind'], Icon> = { record: CrownSimple, streak: Fire, target: Target, challenge: FlagCheckered };
const PHRASES = ['Proud of you', 'Keep it going', 'Let’s go heavier next time'];

/** A first draft for the coach to change: what happened, in their trainee's own numbers. */
function draft(w: TraineeWin): string {
  const did = w.title.startsWith(`${w.firstName} `) ? w.title.slice(w.firstName.length + 1) : w.title;
  const what = w.kind === 'record' ? w.message.split(' — ')[0] : w.message;
  return `You ${did}${what ? ` — ${what}` : ''}. Great work, ${w.firstName}!`;
}

/**
 * A trainee's win, as a small card at the top of the coach's hub (0218; the
 * mock-up's "small card when it happens"). Never full screen: it is someone
 * else's moment. **Send congrats** opens a short message — written for the
 * coach, theirs to change — that goes to their 1-on-1 chat with the trainee
 * (queued if there is no signal). **Later** leaves it in the bell, read.
 *
 * The wins themselves are written by 0218's triggers, and only what the
 * member lets coaches see. Read when the hub opens and when the app comes
 * back to the front; there is no live feed to wait on.
 */
export default function TraineeWinCard() {
  const [wins, setWins] = useState<TraineeWin[]>([]);
  const [shown, setShown] = useState(false);
  const [sheet, setSheet] = useState<TraineeWin | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const still = reducedMotion();
  const win = wins[0] ?? null;

  const read = useCallback(async () => {
    const w = await unseenTraineeWins();
    setWins((cur) => (cur.length ? cur : w));
  }, []);
  useEffect(() => {
    void (async () => { await read(); })();
    const back = () => { if (document.visibilityState === 'visible') void read(); };
    document.addEventListener('visibilitychange', back);
    return () => document.removeEventListener('visibilitychange', back);
  }, [read]);

  // Slide in a beat after the screen settles, with a pop.
  useEffect(() => {
    if (!win || sheet) return;
    const t = window.setTimeout(() => { setShown(true); play('pop'); buzz(25); }, still ? 0 : 700);
    return () => clearTimeout(t);
  }, [win, sheet, still]);

  const done = (w: TraineeWin) => {
    void markWinSeen(w.id);
    setShown(false);
    window.setTimeout(() => setWins((cur) => cur.filter((x) => x.id !== w.id)), still ? 0 : 450);
  };

  const send = async () => {
    if (!sheet || !text.trim()) return;
    setBusy(true);
    try {
      const r = await sendMessageTo(sheet.memberId, sheet.firstName, text);
      toast.success(r === 'queued' ? `Saved — it goes to ${sheet.firstName} when you are back online.` : `Sent to ${sheet.firstName}.`);
      done(sheet);
      setSheet(null);
    } catch (e) {
      toast.error(errorMessage(e, 'That message did not go'));
    } finally {
      setBusy(false);
    }
  };

  const root = typeof document !== 'undefined' ? document.getElementById('phone-overlay-root') : null;
  const WinIcon = win ? ICON[win.kind] ?? CrownSimple : CrownSimple;
  return (
    <>
      {root && createPortal(
        // The always-mounted wrapper owns pointer-events (CLAUDE.md: the overlay root is none).
        <div className="absolute inset-x-0 top-0" style={{ zIndex: 230, pointerEvents: 'none' }}>
          {win && (
            <div className={`tw-card${shown ? ' on' : ''}${still ? ' mo-still' : ''}`} role="status" data-win-card={win.kind}
              style={{ pointerEvents: shown ? 'auto' : 'none' }}>
              <div className="flex items-center" style={{ gap: 10 }}>
                <span className="tw-medal"><WinIcon size={19} weight="fill" /></span>
                <span className="min-w-0 flex-1">
                  <b className="block truncate" style={{ fontSize: 14.5, color: 'var(--color-text-primary)' }}>{win.title}</b>
                  {win.message && <span className="block truncate" style={{ fontSize: 12.5, color: 'var(--color-text-secondary)' }}>{win.message}</span>}
                </span>
              </div>
              <div className="flex justify-end" style={{ gap: 8, marginTop: 10 }}>
                <NocButton variant="ghost" onClick={() => done(win)}>Later</NocButton>
                <NocButton variant="action" icon={<HandsClapping size={16} weight="fill" />}
                  onClick={() => { setText(draft(win)); setShown(false); setSheet(win); }}>Send congrats</NocButton>
              </div>
            </div>
          )}
        </div>,
        root,
      )}
      <GlassSheet open={sheet !== null} onClose={() => setSheet(null)} title={sheet ? `Congrats to ${sheet.firstName}` : ''}
        subtitle="Goes to your 1-on-1 chat. Change it if you like."
        footer={<NocButton variant="action" className="w-full" disabled={busy || !text.trim()} onClick={() => void send()}>
          {sheet ? `Send to ${sheet.firstName}` : 'Send'}</NocButton>}>
        <div className="flex flex-col" style={{ gap: 10 }}>
          <TextArea value={text} rows={3} aria-label="Your message" onChange={(e) => setText(e.target.value.slice(0, 500))} />
          <div className="flex flex-wrap" style={{ gap: 6 }}>
            {PHRASES.map((p) => (
              <button key={p} type="button" className="noc-press" onClick={() => setText((t) => `${t.trim()} ${p}.`.trim())}
                style={{ padding: '6px 11px', borderRadius: 999, fontSize: 12.5, border: '1px solid var(--color-hairline)', color: 'var(--color-text-secondary)' }}>
                {p}
              </button>
            ))}
          </div>
        </div>
      </GlassSheet>
    </>
  );
}
