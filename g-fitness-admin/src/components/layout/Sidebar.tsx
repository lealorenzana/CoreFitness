import { NavLink } from 'react-router-dom';
import { useBranding } from '../../hooks/useBranding';
import AccountMenu from './AccountMenu';
import { useRail, type ShownSection } from './rail';

/** The rail's width; Layout keeps the page clear of it. */
export const RAIL_W = 76;

/**
 * The admin rail (Design V2, mock-up B, owner's pick 2026-11-22): the gym's mark, one row per section
 * with a word under every icon, Gym and Help at the foot, and your account on your photo. A section
 * opens its first page; its other pages are tabs in the header (Header.tsx). Which sections show is
 * the menu's own rule (owner-only, switched-off parts, a narrowed desk account) via `useRail`.
 */
export default function Sidebar() {
  const brand = useBranding();
  const { sections, current } = useRail();
  const item = (s: ShownSection) => (
    <NavLink key={s.key} to={s.leaves[0].path} className="rail-item" data-active={current?.key === s.key}
      data-rail={s.key} data-tip={s.leaves.map((l) => l.label).join(' · ')} aria-current={current?.key === s.key ? 'page' : undefined}>
      <s.icon size={18} strokeWidth={1.75} />
      <span>{s.label}</span>
    </NavLink>
  );
  return (
    <aside className="rail h-screen fixed left-0 top-0 z-40" style={{ width: RAIL_W }} data-sidebar-panel>
      {/* The gym's own mark (0067): its logo, else its initials on its colour. */}
      <span className="rail-mark" data-tip={brand.name}>
        {brand.logoUrl
          ? <img src={brand.logoUrl} alt="" />
          : <span className="on-fill">{brand.initials}</span>}
      </span>
      <nav className="rail-nav" aria-label="Main menu">
        {sections.filter((s) => !s.foot).map(item)}
      </nav>
      <div className="rail-foot">
        {sections.filter((s) => s.foot).map(item)}
        <AccountMenu compact />
      </div>
    </aside>
  );
}
