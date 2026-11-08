import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

/**
 * Click a statistic, see all of it (the owner, 2026-11-08: "when I click on the statistics or anything, there
 * should be a full detail that shows like a tooltip, or a floating page — do this to all of the statistics and
 * charts"). Mounted once in App. Any element with `data-detail` (JSON, see `detail()`) opens a floating card beside
 * it; a stat tile (`.kpi`, `.tile`) that has none is described from what it already shows — its label, number,
 * footnote and its own explanation (`data-tip`). Esc, ✕ or a click elsewhere closes it. Only numbers the page
 * already read are shown: nothing is fetched or invented here.
 */
export interface Detail { title: string; value?: string; rows?: [string, string][]; note?: string }

/** Serialise a detail for a `data-detail` attribute. */
export const detail = (d: Detail) => JSON.stringify(d);

const text = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();

function fromTile(el: HTMLElement): Detail | null {
  const label = text(el.querySelector('.kpi-label, .tile-label'));
  const value = text(el.querySelector('.kpi-value, .tile-value'));
  if (!label && !value) return null;
  const foot = text(el.querySelector('.kpi-foot, .tile-foot'));
  const tip = el.dataset.tip ?? el.querySelector<HTMLElement>('[data-tip]')?.dataset.tip ?? '';
  return { title: label || 'This number', value, rows: foot ? [['Beside it', foot]] : [], note: tip || undefined };
}

export default function DetailLayer() {
  const [open, setOpen] = useState<{ d: Detail; x: number; y: number; above: boolean } | null>(null);
  const card = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (card.current?.contains(t)) return;
      // A link or button inside a tile keeps its own job; the tile itself as a link/button (Tiles with onClick) too.
      const host = t.closest<HTMLElement>('[data-detail], .kpi, .tiles > .tile:not(button):not(a)');
      if (!host || (t.closest('a, button, input, select, textarea') && !t.closest('[data-detail]'))) { setOpen(null); return; }
      let d: Detail | null = null;
      if (host.dataset.detail) { try { d = JSON.parse(host.dataset.detail) as Detail; } catch { d = null; } }
      else d = fromTile(host);
      if (!d) return;
      const r = host.getBoundingClientRect();
      const above = r.bottom + 260 > innerHeight && r.top > 280;
      setOpen({ d, x: Math.min(Math.max(r.left + r.width / 2, 170), innerWidth - 170), y: above ? r.top - 8 : r.bottom + 8, above });
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(null); };
    const onScroll = () => setOpen(null);
    document.addEventListener('click', onClick);
    addEventListener('keydown', onKey);
    addEventListener('scroll', onScroll, true);
    return () => { document.removeEventListener('click', onClick); removeEventListener('keydown', onKey); removeEventListener('scroll', onScroll, true); };
  }, []);

  if (!open) return null;
  const { d } = open;
  return createPortal(
    <div ref={card} className={`detail-pop${open.above ? ' above' : ''}`} style={{ left: open.x, top: open.y }} role="dialog" aria-label={d.title} data-detail-pop>
      <button type="button" className="detail-pop__x" onClick={() => setOpen(null)} aria-label="Close"><X size={14} /></button>
      <div className="detail-pop__title">{d.title}</div>
      {d.value && <div className="detail-pop__value">{d.value}</div>}
      {d.rows && d.rows.length > 0 && (
        <dl className="detail-pop__rows">
          {d.rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
        </dl>
      )}
      {d.note && <p className="detail-pop__note">{d.note}</p>}
    </div>,
    document.body,
  );
}
