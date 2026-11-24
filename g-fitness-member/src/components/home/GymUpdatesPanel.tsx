import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { CaretRight, Play, Sparkle, X } from '@phosphor-icons/react';
import { useT } from '../../lib/i18n';
import { TodayCompanion } from './TodayStory';

export default function GymUpdatesPanel({ children }: { children: ReactNode }) {
  const t = useT();
  const dialog = useRef<HTMLDialogElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  useEffect(() => {
    if (open && !dialog.current?.open) dialog.current?.showModal();
  }, [open]);
  useEffect(() => () => clearTimeout(timer.current), []);
  const close = () => {
    if (closing) return;
    setClosing(true);
    timer.current = setTimeout(() => {
      dialog.current?.close();
      setOpen(false);
      setClosing(false);
    }, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 220);
  };
  return <>
    <button type="button" className="today-gym-updates-trigger" data-today-reveal
      aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>
      <span><strong>{t('From your gym')}</strong><small>{t('Updates, videos, and community goals')}</small></span>
      <CaretRight size={17} aria-hidden="true" />
    </button>
    {createPortal(<dialog ref={dialog} className={`today-gym-updates-panel${closing ? ' is-closing' : ''}`}
      aria-labelledby="today-gym-updates-title" onCancel={event => { event.preventDefault(); close(); }}
      onClick={event => { if (event.target === event.currentTarget) close(); }}>
      <div className="today-gym-updates-inner">
        <header><div className="today-gym-updates-heading"><h2 id="today-gym-updates-title">{t('From your gym')}</h2><p>{t('Updates, videos, and community goals')}</p></div>
          {open && <div className="today-gym-updates-art" aria-hidden="true">
            <span className="today-gym-updates-orbit" />
            <Sparkle className="today-gym-updates-star" size={17} weight="fill" />
            <TodayCompanion />
            <span className="today-gym-video-screen"><Play size={12} weight="fill" /><i className="today-gym-video-line" /><i className="today-gym-video-progress" /></span>
          </div>}
          <button type="button" aria-label={t('Close')} onClick={close}><X size={20} /></button>
        </header>
        <div className="today-gym-updates-body">{open && children}</div>
      </div>
    </dialog>, document.getElementById('modal-root') ?? document.body)}
  </>;
}
