import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { GymApp } from '../../lib/gymApp';
import GymMark from '../ui/GymMark';

// Memory only: one welcome per app launch, including navigation and gym changes.
// Claim it when it starts so leaving Today during the fade cannot replay it.
let welcomeShown = false;

export default function GymWelcome({ gym }: { gym: GymApp | null }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!gym || welcomeShown) return;
    let timer: ReturnType<typeof setTimeout>;
    const show = () => {
      if (document.getElementById('boot')) {
        timer = setTimeout(show, 100);
        return;
      }
      if (welcomeShown) return;
      welcomeShown = true;
      setVisible(true);
      timer = setTimeout(() => { setVisible(false); }, 2800);
    };
    timer = setTimeout(show, 50);
    return () => clearTimeout(timer);
  }, [gym]);
  const root = document.getElementById('modal-root');
  if (!visible || !gym || !root) return null;
  return createPortal(<div className="today-gym-welcome" role="status" aria-live="polite">
    <div className="today-gym-welcome-content">
      <GymMark name={gym.gymName} logoUrl={gym.logoUrl} size={88} />
      <h2>{gym.shortName?.trim() || gym.gymName}</h2>
      {gym.welcomeMessage && <p>{gym.welcomeMessage}</p>}
    </div>
  </div>, root);
}
