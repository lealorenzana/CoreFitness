import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSwipeToClose } from '../../lib/useSwipeToClose';
import { Check, MagnifyingGlass, X } from '@phosphor-icons/react';

/**
 * Every dropdown in the app opens a designed list instead of the phone's plain system one (the owner,
 * 2026-11-07: "fix all these across the system, that kind of UI of the dropdown box").
 *
 * Mounted once (App). A tap on any <select> is caught before the system list opens; this sheet lists the
 * select's own <option>s (and <optgroup> headings), and a pick is handed back to the real <select> the way a
 * person's choice would be — its value set, `input` and `change` fired — so every form, React's onChange,
 * screen readers and the test suite's selectOption keep working on the real element. Keyboard use is left to
 * the system list. `data-native-select` on a <select> opts it out.
 *
 * The admin app has the same file with a popover under the field (g-fitness-admin/src/components/ui/SelectEnhancer.tsx).
 */
type Opt = { value: string; label: string; disabled: boolean; group: string | null };

function readOptions(sel: HTMLSelectElement): Opt[] {
  return Array.from(sel.options).map((o) => ({
    value: o.value, label: o.label || o.text, disabled: o.disabled,
    group: o.parentElement instanceof HTMLOptGroupElement ? o.parentElement.label : null,
  }));
}

function titleOf(sel: HTMLSelectElement): string {
  // The select's own name first. A <label> that WRAPS the select has every option's text in its textContent — the
  // province sheet's title was all 80 provinces run together (2026-11-11) — so read the label without the select.
  const aria = sel.getAttribute('aria-label');
  if (aria) return aria;
  const lab = sel.labels?.[0];
  if (lab) {
    const copy = lab.cloneNode(true) as HTMLElement;
    copy.querySelectorAll('select, option, optgroup').forEach((n) => n.remove());
    const own = copy.textContent?.replace(/\s+/g, ' ').trim();
    if (own) return own;
  }
  const near = sel.closest('label, [data-field]')?.querySelector('span, p, label')?.textContent?.trim();
  return near || 'Choose one';
}

/** Hand a value to the real <select> as a person's choice would: React's onChange runs, so does any listener. */
function pick(sel: HTMLSelectElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
  setter?.call(sel, value);
  sel.dispatchEvent(new Event('input', { bubbles: true }));
  sel.dispatchEvent(new Event('change', { bubbles: true }));
}

export default function SelectEnhancer() {
  const [sel, setSel] = useState<HTMLSelectElement | null>(null);
  const [q, setQ] = useState('');

  useEffect(() => {
    const target = (e: Event) => {
      const t = e.target as Element | null;
      const s = t?.closest?.('select') as HTMLSelectElement | null;
      if (!s || s.disabled || s.multiple || s.hasAttribute('data-native-select')) return null;
      return s;
    };
    const open = (e: Event) => {
      const s = target(e);
      if (!s) return;
      e.preventDefault();
      s.focus({ preventScroll: true });
      setQ('');
      setSel(s);
    };
    // touchend on phones (before the system list), mousedown with a mouse.
    document.addEventListener('touchend', open, { capture: true, passive: false });
    document.addEventListener('mousedown', open, true);
    return () => {
      document.removeEventListener('touchend', open, { capture: true } as EventListenerOptions);
      document.removeEventListener('mousedown', open, true);
    };
  }, []);

  const close = useCallback(() => setSel(null), []);
  const swipe = useSwipeToClose(close);
  useEffect(() => {
    if (!sel) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sel, close]);

  const options = useMemo(() => (sel ? readOptions(sel) : []), [sel]);
  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    return term ? options.filter((o) => o.label.toLowerCase().includes(term)) : options;
  }, [options, q]);
  const listRef = useRef<HTMLDivElement>(null);
  // Open on the current choice, not the top of a long list.
  useEffect(() => {
    if (!sel) return;
    const t = window.setTimeout(() => listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'center' }), 60);
    return () => window.clearTimeout(t);
  }, [sel]);

  if (!sel) return null;
  const current = sel.value;
  const searchable = options.length > 10;

  return createPortal(
    <div className="cf-sel" role="presentation" data-select-sheet onClick={close}>
      <div ref={swipe} className="cf-sel__panel noc-sheet" role="listbox" aria-label={titleOf(sel)} onClick={(e) => e.stopPropagation()}>
        <span className="cf-sel__grab" aria-hidden />
        <div className="cf-sel__head">
          <b>{titleOf(sel)}</b>
          <button type="button" aria-label="Close" onClick={close} className="cf-sel__x"><X size={16} /></button>
        </div>
        {searchable && (
          <label className="cf-sel__search">
            <MagnifyingGlass size={16} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" aria-label="Search the list" />
          </label>
        )}
        <div className="cf-sel__list" ref={listRef}>
          {shown.length === 0 && <p className="cf-sel__none">Nothing matches “{q}”.</p>}
          {shown.map((o, i) => {
            const head = o.group && (i === 0 || shown[i - 1].group !== o.group) ? o.group : null;
            const on = o.value === current;
            return (
              <div key={`${o.value}-${i}`}>
                {head && <p className="cf-sel__group">{head}</p>}
                <button type="button" role="option" aria-selected={on} disabled={o.disabled} data-select-option={o.value}
                  className={`cf-sel__opt${on ? ' is-on' : ''}`}
                  onClick={() => { pick(sel, o.value); close(); }}>
                  <span className="truncate">{o.label}</span>
                  {on && <Check size={17} weight="bold" />}
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
