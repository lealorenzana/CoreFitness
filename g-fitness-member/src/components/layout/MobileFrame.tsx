import type { ReactNode } from 'react';
import PhoneChassis from './PhoneChassis';

interface MobileFrameProps {
  children: ReactNode;
}

/** Stand-alone phone frame for unauthenticated routes (login, terms, privacy). */
export default function MobileFrame({ children }: MobileFrameProps) {
  return (
    <PhoneChassis>
      <div
        className="relative flex-1 overflow-y-auto scrollbar-hide"
        style={{ backgroundColor: 'var(--color-bg)' }}
      >
        {children}
      </div>
    </PhoneChassis>
  );
}
