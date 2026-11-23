import { useEffect, useRef, useState } from 'react';
import Icon, { type IconName } from './Icon';
import './mockup-roles.css';

interface Role { icon: IconName; who: string; where: string; does: string[] }
const MEDIA = [
  { name: 'owner', poster: 'dashboard.png', mobile: false, caption: 'Your gym, at a glance.' },
  { name: 'desk', poster: 'roles-desk.png', mobile: false, caption: 'The desk keeps moving.' },
  { name: 'coach', poster: 'roles-coach.png', mobile: true, caption: 'A place for every trainee.' },
  { name: 'member', poster: 'member.png', mobile: true, caption: 'Their gym, in their pocket.' },
];

/** Review-only replacement for the original four-role grid. Uses captured product UI, never generated UI. */
export default function MockupRoles({ roles, hidden, title }: { roles: Role[]; hidden: boolean; title?: string }) {
  const [selected, setSelected] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [visible, setVisible] = useState(false);
  const section = useRef<HTMLElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const media = MEDIA[selected];
  const role = roles[selected];
  const still = paused || reduced;

  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(preference.matches);
    preference.addEventListener('change', update);
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: .12 });
    if (section.current) observer.observe(section.current);
    return () => { preference.removeEventListener('change', update); observer.disconnect(); };
  }, []);

  useEffect(() => {
    const player = video.current;
    if (!player) return;
    if (still || !visible) player.pause();
    else void player.play().catch(() => { /* Poster remains visible when autoplay is unavailable. */ });
  }, [selected, still, visible]);

  return (
    <section className={`v2-roles${still || !visible ? ' is-paused' : ''}`} id="people" aria-labelledby="roles-h" hidden={hidden || undefined} ref={section}>
      <div className="v2-role-stars" aria-hidden="true">{Array.from({ length: 22 }, (_, i) => <i key={i} style={{ left: `${(i * 43 + 7) % 98}%`, top: `${(i * 31 + 11) % 96}%`, opacity: .13 + i % 3 * .05 }} />)}</div>
      <div className="v2-role-shell" data-reveal>
        <div className="v2-role-mascot" aria-hidden="true"><div className="v2-lifting-sprite" /></div>
        <div className="v2-role-panel">
          <div className="v2-role-media">
            <div className="v2-role-orbit orbit-plate" aria-hidden="true" />
            <span className="v2-role-media-title">{media.caption}</span>
            <div className={`v2-role-device ${media.mobile ? 'is-phone' : 'is-desktop'}`} key={media.name}>
              <div className="v2-role-device-bar" aria-hidden="true"><i /><i /><i /><span>CORE FITNESS</span></div>
              {reduced ? <img src={`/mockup-art/${media.poster}`} alt={`Actual Core Fitness ${role.who.toLowerCase()} interface with demo records`} /> :
                <video ref={video} poster={`/mockup-art/${media.poster}`} muted loop playsInline preload="metadata" aria-label={`Animated presentation of the actual Core Fitness ${role.who.toLowerCase()} interface capture`}>
                  <source src={`/mockup-art/roles-${media.name}.webm`} type="video/webm" />
                  <source src={`/mockup-art/roles-${media.name}.mp4`} type="video/mp4" />
                </video>}
            </div>
            <span className="v2-role-media-note">Actual Core Fitness UI · demo records</span>
            <button type="button" className="v2-role-pause" onClick={() => setPaused(!paused)} aria-pressed={paused} disabled={reduced} aria-label={paused ? 'Play section animations' : 'Pause section animations'}>
              <span aria-hidden="true">{still ? '▶' : 'Ⅱ'}</span> {still ? 'Play' : 'Pause'}
            </button>
          </div>
          <div className="v2-role-copy">
            <h2 id="roles-h">{title || <>FOUR PEOPLE.<br />ONE SYSTEM.<br />EVERY DAY.</>}</h2>
            <p className="v2-role-intro">The owner, the desk, the coaches and the members. Their own screens. One connected gym.</p>
            <div className="v2-role-tabs" role="tablist" aria-label="Explore the four gym roles">
              {roles.map((item, i) => <button type="button" role="tab" key={item.who} id={`role-tab-${i}`} aria-selected={selected === i} aria-controls="role-details" tabIndex={selected === i ? 0 : -1}
                onClick={() => setSelected(i)} onKeyDown={(event) => {
                  let next = i;
                  if (event.key === 'ArrowRight') next = (i + 1) % roles.length;
                  else if (event.key === 'ArrowLeft') next = (i + roles.length - 1) % roles.length;
                  else if (event.key === 'Home') next = 0;
                  else if (event.key === 'End') next = roles.length - 1;
                  else return;
                  event.preventDefault(); setSelected(next);
                  document.getElementById(`role-tab-${next}`)?.focus();
                }}><Icon name={item.icon} />{['Owner', 'Front desk', 'Coaches', 'Members'][i]}</button>)}
            </div>
            <div className="v2-role-details" id="role-details" role="tabpanel" aria-labelledby={`role-tab-${selected}`} key={selected}>
              <h3>{role.who}</h3>
              <p>{role.where}</p>
              <ul>{role.does.map(item => <li key={item}>{item}</li>)}</ul>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
