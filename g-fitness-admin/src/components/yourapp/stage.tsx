import { useContext, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { StageCtx } from './stageCtx';

/**
 * Your app's one preview (owner, 2026-11-23): a fixed column on the right that never scrolls; each section hands
 * its phone (or TV) to it, and only the section being read shows. `sec` is the section on screen.
 */
export function YaStage({ sec, children }: { sec: string; children: ReactNode }) {
  const { el, sec: on } = useContext(StageCtx);
  if (!el || on !== sec) return null;
  return createPortal(<div className="ya-stage-in" key={sec} data-stage={sec}>{children}</div>, el);
}
