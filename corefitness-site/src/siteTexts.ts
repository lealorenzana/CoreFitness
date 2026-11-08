import { useEffect, useState } from 'react';
import { supabase } from './supabase';

/**
 * The words the platform changed on this site (0241, the platform's Website page). A key that is not here keeps
 * the built-in words written in App.tsx, so with no database — or before 0241 — the page reads as it always has.
 */
export type SiteTexts = Partial<Record<'notice' | 'hero_eyebrow' | 'hero_title_1' | 'hero_title_2' | 'hero_lede' | 'coaches_title' | 'coaches_lede', string>>;

export function useSiteTexts(): SiteTexts {
  const [texts, setTexts] = useState<SiteTexts>({});
  useEffect(() => {
    let alive = true;
    void (async () => {
      if (!supabase) return;
      const { data, error } = await supabase.rpc('site_texts');
      if (error || !alive || !data || typeof data !== 'object') return;
      setTexts(data as SiteTexts);
    })();
    return () => { alive = false; };
  }, []);
  return texts;
}
