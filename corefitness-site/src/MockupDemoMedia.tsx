import { useEffect, useRef, useState } from 'react';

const DEMOS = {
  checkin: { poster: 'member-qr.png', clip: 'demo-checkin' },
  payments: { poster: 'dashboard.png', clip: 'roles-desk' },
  coach: { poster: 'roles-coach.png', clip: 'roles-coach' },
  workout: { poster: 'workout-player.png', clip: 'demo-workout' },
  overview: { poster: 'dashboard.png', clip: 'roles-owner' },
  progress: { poster: 'member-progress.png', clip: 'demo-progress' },
  bookings: { poster: 'member-bookings.png', clip: 'demo-bookings' },
  assistant: { poster: 'member-assistant.png', clip: 'demo-assistant' },
  renewal: { poster: 'member-renewal.png', clip: 'demo-renewal' },
  member: { poster: 'member.png', clip: 'roles-member' },
} as const;
export type DemoName = keyof typeof DEMOS;

/** Motion videos over actual captures (design/role-videos): the real screen, its pieces rebuilt and animated.
 *  With onEnded the clip plays once and hands over, so a list of steps moves on with its video. */
export default function MockupDemoMedia({ name, label, onEnded }: { name: DemoName; label: string; onEnded?: () => void }) {
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
  const frame = useRef<HTMLDivElement>(null);
  const player = useRef<HTMLVideoElement>(null);
  const [visible, setVisible] = useState(false);
  const media = DEMOS[name];
  useEffect(() => {
    const preference = matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(preference.matches);
    preference.addEventListener('change', update);
    const observer = new IntersectionObserver(([entry])=>setVisible(entry.isIntersecting), {threshold:.15});
    if(frame.current) observer.observe(frame.current);
    return () => { observer.disconnect(); preference.removeEventListener('change', update); };
  }, []);
  useEffect(() => {
    if(paused || reduced || !visible) player.current?.pause();
    else void player.current?.play().catch(()=>{});
  }, [paused, reduced, visible, name]);
  return <div className={`v3-demo-media${paused || reduced || !visible ? ' is-paused' : ''}`} ref={frame}>
    <div className="v3-demo-screen" key={name}>
      {media.clip && !reduced ? <video ref={player} muted loop={!onEnded} onEnded={onEnded} playsInline preload="metadata" poster={`/mockup-art/${media.poster}`} aria-label={label}>
        <source src={`/mockup-art/${media.clip}.webm`} type="video/webm" />
        <source src={`/mockup-art/${media.clip}.mp4`} type="video/mp4" />
      </video> : <img src={`/mockup-art/${media.poster}`} alt={label} className="v3-capture-motion" />}
    </div>
    <div className="v3-demo-bar"><span>Core Fitness screens, animated · demo records</span><button type="button" disabled={reduced} aria-label={`${paused?'Play':'Pause'} ${label}`} aria-pressed={paused} onClick={()=>setPaused(!paused)}>{paused?'▶ Play':'Ⅱ Pause'}</button></div>
  </div>;
}
