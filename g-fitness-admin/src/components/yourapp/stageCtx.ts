import { createContext, useContext, useEffect, useRef } from 'react';

/** Your app's fixed preview column and the section on screen (see stage.tsx). */
export const StageCtx = createContext<{ el: HTMLElement | null; sec: string }>({ el: null, sec: '' });

/**
 * Your app has one Save (owner, 2026-11-23): each section with unsaved words tells the page so, and the save bar
 * at the foot saves every changed section at once. `save(true)` is quiet: the bar says Saved once.
 */
export interface SaveEntry { label: string; dirty: boolean; save: (quiet: boolean) => Promise<boolean>; reset: () => void }
export const SaveCtx = createContext<(key: string, entry: SaveEntry | null) => void>(() => {});

export function useYaSave(key: string, label: string, dirty: boolean, save: (quiet: boolean) => Promise<boolean>, reset: () => void): void {
  const reg = useContext(SaveCtx);
  const fns = useRef({ save, reset });
  useEffect(() => { fns.current = { save, reset }; });
  useEffect(() => { reg(key, { label, dirty, save: (q) => fns.current.save(q), reset: () => fns.current.reset() }); }, [reg, key, label, dirty]);
  useEffect(() => () => reg(key, null), [reg, key]);
}
