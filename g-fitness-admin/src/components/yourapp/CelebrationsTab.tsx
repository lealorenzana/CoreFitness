import { useEffect, useState } from 'react';
import { Check, HandHeart, PartyPopper, Smartphone, Volume2 } from 'lucide-react';
import { getCelebrations, setCelebrations, type Celebrations } from '../../lib/api/celebrations';
import { showToast } from '../../utils/toast';

/**
 * Your app → Celebrations (0216). The member app gives a moment to checking
 * in, finishing a workout, a new badge, a higher earned level, a target
 * reached and a challenge finished — full screen, with a sound. The owner can
 * turn those down to a small card, and turn their sound off, for the whole
 * gym. The phone beside the switches shows which one members get.
 */
export default function CelebrationsTab() {
  const [c, setC] = useState<Celebrations | null | undefined>(undefined);
  const [busy, setBusy] = useState<keyof Celebrations | null>(null);

  useEffect(() => { void (async () => setC(await getCelebrations()))(); }, []);

  const flip = async (k: keyof Celebrations) => {
    if (!c || c[k] === null) return;
    setBusy(k);
    try {
      await setCelebrations({ [k]: !c[k] });
      setC({ ...c, [k]: !c[k] });
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'That was not saved', 'error');
    } finally {
      setBusy(null);
    }
  };

  const rows: [keyof Celebrations, string, string, typeof PartyPopper][] = [
    ['celebrations', 'Celebrations', 'Off: each moment is a small card at the top of the screen instead of the full screen.', PartyPopper],
    ['sounds', 'Sounds', 'Off: no chime for anyone at your gym. Members can also turn their own off.', Volume2],
    // 0217: off until you switch it on. Off, there are no friends, wins or cheers at your gym.
    ...(c && c.friends !== null ? [['friends', 'Friends & cheers',
      'Members add each other as friends, see each other’s wins and cheer them on. Off: none of it at your gym. You see counts only; coaches see a trainee’s cheers.',
      HandHeart] as [keyof Celebrations, string, string, typeof PartyPopper]] : []),
  ];

  return (
    <div className="a-grid" style={{ gridTemplateColumns: 'minmax(0, 1fr) 380px', flex: 1 }} data-celebrations-tab>
      <div className="a-card a-scroll">
        <div className="a-ct"><h3><PartyPopper size={16} />Celebrations</h3><small>how loudly the app tells members what they did</small></div>
        {c === undefined ? <p className="a-sub">Loading…</p>
          : c === null ? <p className="a-sub">These switches arrive with the next database update (0216). Until then members get every moment, with sound.</p>
          : rows.map(([k, label, note, Icon]) => (
            <div key={k} className="a-setting" data-celebration-switch={k}>
              <span className="a-ic"><Icon size={15} /></span>
              <div className="t"><b>{label}</b><small>{note}</small></div>
              <button type="button" className={`a-toggle ${c[k] ? '' : 'off'}`} disabled={busy === k} onClick={() => void flip(k)}
                aria-pressed={c[k] === true} aria-label={c[k] ? `Switch off ${label}` : `Switch on ${label}`} />
            </div>
          ))}
        <p className="a-sub" style={{ marginTop: 14 }}>
          Every moment shows only what really happened: the points it paid, the member's streak and earned level. Nothing is counted
          differently when these are off.
        </p>
      </div>

      <div className="a-stage">
        <div className="cap"><Smartphone size={13} />{c?.celebrations === false ? 'What members see · a small card' : 'What members see · the full moment'}</div>
        <div className="a-phone">
          <div className="scr" style={c?.celebrations === false ? undefined : { alignItems: 'center', textAlign: 'center', justifyContent: 'center' }}>
            {c?.celebrations === false ? (
              <div className="a-phcard flex items-center gap-2.5" style={{ borderColor: 'var(--a-p300)' }}>
                <Check size={18} style={{ color: 'var(--a-p300)' }} />
                <span><b>You're in, Ana</b><br /><span className="a-sub">3 of 4 days this week · +10 points</span></span>
              </div>
            ) : (
              <>
                <span style={{ width: 64, height: 64, borderRadius: 999, display: 'grid', placeItems: 'center', background: 'var(--a-p)', color: '#fff' }}>
                  <Check size={32} />
                </span>
                <span className="a-sub" style={{ letterSpacing: '.14em', textTransform: 'uppercase', fontSize: 10, marginTop: 10 }}>Checked in</span>
                <b style={{ fontSize: 20 }}>You're in, Ana</b>
                <span className="a-sub">3 of 4 days this week</span>
                <span className="a-sub" style={{ marginTop: 6 }}>+10 points{c?.sounds === false ? '' : ' · with a chime'}</span>
              </>
            )}
          </div>
        </div>
        <span className="a-sub" style={{ position: 'absolute', bottom: 10, fontSize: 10 }}>Sample screen, in your colours</span>
      </div>
    </div>
  );
}
