import { createContext } from 'react';

/** Your app's fixed preview column and the section on screen (see stage.tsx). */
export const StageCtx = createContext<{ el: HTMLElement | null; sec: string }>({ el: null, sec: '' });
