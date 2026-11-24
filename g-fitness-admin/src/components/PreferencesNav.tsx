import { useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowUpRight, Search, X, type LucideIcon } from 'lucide-react';

export type PreferenceItem = {
  id: string;
  label: string;
  icon: LucideIcon;
  group: string;
  words?: string[];
  href?: string;
};

/** Shared navigation for the two owner settings pages. Search narrows the
 * categories; switching categories keeps mounted forms and their drafts. */
export default function PreferencesNav({ items, active, onSelect, label, footer }: {
  items: PreferenceItem[];
  active: string;
  onSelect: (id: string) => void;
  label: string;
  footer?: ReactNode;
}) {
  const [query, setQuery] = useState('');
  const navigate = useNavigate();
  const q = query.trim().toLowerCase();
  const visible = items.filter((item) => !q || [item.label, item.group, ...(item.words ?? [])].some((word) => word.toLowerCase().includes(q)));
  const groups = [...new Set(visible.map((item) => item.group))];
  const select = (item: PreferenceItem) => {
    if (item.href) navigate(item.href);
    else onSelect(item.id);
    setQuery('');
  };

  return <aside className="preferences-sidebar">
    <label className="preferences-mobile-select">
      <span>{label}</span>
      <select aria-label={label} value={active} onChange={(event) => {
        const item = items.find((entry) => entry.id === event.target.value);
        if (item) select(item);
      }}>
        {[...new Set(items.map((item) => item.group))].map((group) => <optgroup key={group} label={group}>
          {items.filter((item) => item.group === group).map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
        </optgroup>)}
      </select>
    </label>
    <div className="preferences-desktop-nav">
      <div className="preferences-search">
        <Search size={15} aria-hidden="true" />
        <input type="search" autoComplete="off" name={`${label.toLowerCase().replaceAll(' ', '-')}-search`} aria-label={`Search ${label.replace(' sections', '').toLowerCase()}`}
          placeholder="Find a setting" value={query} onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => { if (event.key === 'Enter' && visible[0]) select(visible[0]); if (event.key === 'Escape') setQuery(''); }} />
        {query && <button type="button" onClick={() => setQuery('')} aria-label="Clear settings search"><X size={13} /></button>}
      </div>
      <nav aria-label={label} className="preferences-nav">
        {groups.map((group) => <div key={group} className="preferences-nav-group">
          <p className="preferences-group-label">{group}</p>
          {visible.filter((item) => item.group === group).map((item) => <div key={item.id}>
            {item.href ? <Link to={item.href} className="preferences-nav-item"><item.icon size={16} /><span>{item.label}</span><ArrowUpRight size={12} /></Link>
              : <button type="button" className={`preferences-nav-item${active === item.id ? ' on' : ''}`} aria-current={active === item.id ? 'page' : undefined}
                onClick={() => select(item)}><item.icon size={16} /><span>{item.label}</span></button>}
          </div>)}
        </div>)}
        {visible.length === 0 && <p className="preferences-no-results" role="status">No settings match “{query.trim()}”. Try another name or keyword.</p>}
      </nav>
      {footer && <div className="preferences-nav-footer">{footer}</div>}
    </div>
  </aside>;
}
