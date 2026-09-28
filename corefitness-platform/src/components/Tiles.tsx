import { ChevronRight, type LucideIcon } from 'lucide-react';

export interface Tile {
  icon: LucideIcon;
  value: string;
  label: string;
  /** Amber: the figure that means "someone is waiting on you". */
  act?: boolean;
  /** A figure you can act on is a button; one you can only read is not. */
  onClick?: () => void;
  on?: boolean;
}

/** The admin dashboard's stat tiles — the bento row every screen opens with. */
export default function Tiles({ items }: { items: Tile[] }) {
  return (
    <div className="tiles" style={{ gridTemplateColumns: `repeat(${Math.min(items.length, 6)}, minmax(0, 1fr))` }}>
      {items.map((t) => {
        const Icon = t.icon;
        const body = (
          <>
            <span className="tile-icon"><Icon size={19} /></span>
            <span className="tile-text">
              <span className="tile-value">{t.value}</span>
              <span className="tile-label">{t.label}</span>
            </span>
            {t.onClick && <ChevronRight size={16} className="tile-chev" />}
          </>
        );
        const cls = `tile${t.act ? ' act' : ''}${t.on ? ' on' : ''}${t.onClick ? '' : ' still'}`;
        return t.onClick
          ? <button key={t.label} type="button" className={cls} onClick={t.onClick}>{body}</button>
          : <div key={t.label} className={cls}>{body}</div>;
      })}
    </div>
  );
}
