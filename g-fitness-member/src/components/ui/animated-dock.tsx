import { useRef } from 'react';
import { NavLink } from 'react-router-dom';
import {
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  type MotionValue,
} from 'framer-motion';
import type { LucideIcon } from 'lucide-react';
import { cn } from '../../lib/utils';

export interface DockNavItem {
  path: string;
  label: string;
  icon: LucideIcon;
}

export interface AnimatedDockProps {
  className?: string;
  items: DockNavItem[];
}

export function AnimatedDock({ className, items }: AnimatedDockProps) {
  const mouseX = useMotionValue(Infinity);

  const handlePointer = (clientX: number) => {
    mouseX.set(clientX);
  };

  return (
    <motion.div
      onMouseMove={(e) => handlePointer(e.pageX)}
      onMouseLeave={() => mouseX.set(Infinity)}
      onTouchMove={(e) => {
        const touch = e.touches[0];
        if (touch) handlePointer(touch.pageX);
      }}
      onTouchEnd={() => mouseX.set(Infinity)}
      className={cn(
        'grid w-full grid-cols-5 h-[4.25rem] items-end rounded-2xl px-0 pb-2 pt-1',
        'bg-gray-900/95 border border-orange-500/25 shadow-[0_-4px_24px_rgba(0,0,0,0.5)] backdrop-blur-md',
        className
      )}
    >
      {items.map((item) => (
        <DockItem key={item.path} mouseX={mouseX} path={item.path} label={item.label} Icon={item.icon} />
      ))}
    </motion.div>
  );
}

interface DockItemProps {
  mouseX: MotionValue<number>;
  path: string;
  label: string;
  Icon: LucideIcon;
}

function DockItem({ mouseX, path, label, Icon }: DockItemProps) {
  const ref = useRef<HTMLDivElement>(null);

  const distance = useTransform(mouseX, (val) => {
    const bounds = ref.current?.getBoundingClientRect() ?? { x: 0, width: 0 };
    return val - bounds.x - bounds.width / 2;
  });

  const iconScale = useTransform(distance, [-80, 0, 80], [1, 1.28, 1]);
  const iconSpring = useSpring(iconScale, { mass: 0.1, stiffness: 150, damping: 12 });

  return (
    <div ref={ref} className="flex w-full flex-col items-center justify-end min-w-0">
      <NavLink
        to={path}
        className="flex flex-col items-center justify-center w-full gap-0.5"
        aria-label={label}
      >
        {({ isActive }) => (
          <>
            <motion.div
              className={cn(
                'aspect-square w-11 h-11 shrink-0 rounded-full flex items-center justify-center transition-colors',
              )}
              style={{
                scale: iconSpring,
                ...(isActive
                  ? { background: 'var(--color-secondary)', color: '#000' }
                  : { background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)', color: 'var(--color-text-muted)' }),
              }}
            >
              <Icon size={20} strokeWidth={isActive ? 2.5 : 2} />
            </motion.div>
            <span
              className={cn(
                'text-[9px] font-medium text-center w-full truncate transition-colors',
                isActive ? 'text-yellow' : 'text-gray-500'
              )}
            >
              {label}
            </span>
          </>
        )}
      </NavLink>
    </div>
  );
}

export default AnimatedDock;
