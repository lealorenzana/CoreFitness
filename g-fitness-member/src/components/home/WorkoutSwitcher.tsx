import { useRef, useState, type ReactNode } from 'react';
import ProgramNext from '../workout/ProgramNext';

export default function WorkoutSwitcher({ children, programs }: { children: ReactNode; programs: boolean }) {
  const rail = useRef<HTMLDivElement>(null);
  const [available, setAvailable] = useState(false);
  const [active, setActive] = useState(0);
  const select = (index: number) => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    rail.current?.scrollTo({ left: index * rail.current.clientWidth, behavior: reduced ? 'instant' : 'smooth' });
  };
  return <div className="today-workout-switcher">
    {available && <div className="today-workout-switcher-tabs" role="group" aria-label="Choose your workout">
      <button type="button" aria-pressed={active === 0} onClick={() => select(0)}>Your workout</button>
      <button type="button" aria-pressed={active === 1} onClick={() => select(1)}>Your program</button>
    </div>}
    <div className="today-workout-switcher-rail" ref={rail} onScroll={event => {
      const el = event.currentTarget;
      setActive(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)));
    }}>
      <div className="today-workout-slide" aria-label="Your workout">{children}</div>
      {programs && <div className="today-workout-slide" style={{ display: available ? undefined : 'none' }} aria-label="Your program">
        <ProgramNext onAvailable={setAvailable} />
      </div>}
    </div>
    {available && <div className="today-workout-pagination" aria-hidden="true"><i data-active={active === 0} /><i data-active={active === 1} /></div>}
  </div>;
}
