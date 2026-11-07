import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { Check, Search } from 'lucide-react';

/**
 * Every dropdown in the admin opens a designed list instead of the browser's plain one (the owner,
 * 2026-11-07: "fix all these across the system, that kind of UI of the dropdown box, enhance the design").
 *
 * Mounted once (App). A click on any <select> is caught before the browser's list opens; a panel opens under
 * the field (above it when there is no room) listing the select's own <option>s and <optgroup> headings. A pick
 * is handed back to the real <select> as a person's choice would be — its value set, `input` and `change`
 * fired — so React's onChange, forms and the test suite's selectOption keep working on the real element.
 * Arrow keys, Enter and Escape work in the panel; keyboard use on the field itself is left to the browser.
 * `data-native-select` opts a <select> out. The phone app has the same idea as a bottom sheet
 * (g-fitness-member/src/components/ui/SelectEnhancer.tsx).
 */
type Opt = { value: string; label: string; disabled: boolean; group: string | null };

function readOptions(sel: HTMLSelectElement): Opt[] {
  return Array.from(sel.options).map((o) => ({
    value: o.value, label: o.label || o.text, disabled: o.disabled,
    group: o.parentElement instanceof HTMLOptGroupElement ? o.parentElement.label : null,
  }));
}

function pick(sel: HTMLSelectElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
  setter?.call(sel, value);
  sel.dispatchEvent(new Event('input', { bubbles: true }));
  sel.dispatchEvent(new Event('change', { bubbles: true }));
}

export default function SelectEnhancer() {
  const [sel, setSel] = useState<HTMLSelectElement | null>(null);
  const [pos, setPos] = useState<CSSProperties>({});
  const [q, setQ] = useState('');
  const [active, setActive] = useState(-1);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const open = (e: MouseEvent) => {
      if (e.button !== 0) return;
      const s = (e.target as Element | null)?.closest?.('select') as HTMLSelectElement | null;
      if (!s || s.disabled || s.multiple || s.hasAttribute('data-native-select')) return;
      e.preventDefault();
      s.focus({ preventScroll: true });
      const r = s.getBoundingClientRect();
      const below = innerHeight - r.bottom - 12;
      const above = r.top - 12;
      const up = below < 240 && above > below;
      const maxHeight = Math.min(380, up ? above : below);
      setPos({ left: Math.min(r.left, innerWidth - Math.max(r.width, 240) - 8), width: Math.max(r.width, 240), maxHeight,
        ...(up ? { bottom: innerHeight - r.top + 6 } : { top: r.bottom + 6 }) });
      setQ('');
      setActive(-1);
      setSel(s);
    };
    document.addEventListener('mousedown', open, true);
    return () => document.removeEventListener('mousedown', open, true);
  }, []);

  const close = useCallback(() => { const s = sel; setSel(null); s?.focus({ preventScroll: true }); }, [sel]);
  const options = useMemo(() => (sel ? readOptions(sel) : []), [sel]);
  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    return term ? options.filter((o) => o.label.toLowerCase().includes(term)) : options;
  }, [options, q]);

  useEffect(() => {
    if (!sel) return;
    const t = window.setTimeout(() => listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' }), 30);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); close(); return; }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        setActive((a) => {
          let n = a;
          for (let i = 0; i < shown.length; i++) {
            n = (n + (e.key === 'ArrowDown' ? 1 : -1) + shown.length) % shown.length;
            if (!shown[n].disabled) break;
          }
          listRef.current?.querySelectorAll('[role="option"]')[n]?.scrollIntoView({ block: 'nearest' });
          return n;
        });
      }
      if (e.key === 'Enter' && active >= 0 && shown[active] && !shown[active].disabled) { e.preventDefault(); pick(sel, shown[active].value); close(); }
    };
    const onScroll = (e: Event) => { if (!listRef.current?.parentElement?.contains(e.target as Node)) close(); };
    window.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', close);
    return () => { window.clearTimeout(t); window.removeEventListener('keydown', onKey); window.removeEventListener('scroll', onScroll, true); window.removeEventListener('resize', close); };
  }, [sel, shown, active, close]);

  if (!sel) return null;
  const current = sel.value;
  return createPortal(
    <div className="cf-asel" onMouseDown={close} data-select-panel>
      <div className="cf-asel__panel" style={pos} role="listbox" aria-label={sel.getAttribute('aria-label') ?? sel.labels?.[0]?.textContent ?? 'Choose one'}
        onMouseDown={(e) => e.stopPropagation()}>
        {options.length > 10 && (
          <label className="cf-asel__search"><Search size={14} />
            <input autoFocus value={q} onChange={(e) => { setQ(e.target.value); setActive(-1); }} placeholder="Search" aria-label="Search the list" />
          </label>
        )}
        <div className="cf-asel__list" ref={listRef}>
          {shown.length === 0 && <p className="cf-asel__none">Nothing matches “{q}”.</p>}
          {shown.map((o, i) => {
            const head = o.group && (i === 0 || shown[i - 1].group !== o.group) ? o.group : null;
            const on = o.value === current;
            return (
              <div key={`${o.value}-${i}`}>
                {head && <p className="cf-asel__group">{head}</p>}
                <button type="button" role="option" aria-selected={on} disabled={o.disabled} data-select-option={o.value}
                  className={`cf-asel__opt${on ? ' is-on' : ''}${i === active ? ' is-active' : ''}`}
                  onMouseEnter={() => setActive(i)} onClick={() => { pick(sel, o.value); close(); }}>
                  <span className="truncate">{o.label}</span>
                  {on && <Check size={15} strokeWidth={2.6} />}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>,
    document.body,
  );
}
