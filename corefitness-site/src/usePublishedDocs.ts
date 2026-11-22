import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import type { StoredDoc } from './legalText';

/**
 * 0262: the gym documents' version in effect, when it was written in the platform's Settings. Null while reading,
 * before 0262, or when the version in effect is the one in this site's code (legalText.ts): then the code text shows,
 * exactly as before.
 */
export interface PublishedDocs { version: string; docs: Record<string, StoredDoc> }

export function usePublishedDocs(): PublishedDocs | null {
  const [docs, setDocs] = useState<PublishedDocs | null>(null);
  useEffect(() => {
    let alive = true;
    void (async () => {
      if (!supabase) return;
      const { data, error } = await supabase.rpc('public_gym_documents');
      if (error || !alive || !data || typeof data !== 'object') return;
      const d = data as PublishedDocs;
      if (typeof d.version === 'string' && d.docs && typeof d.docs === 'object') setDocs(d);
    })();
    return () => { alive = false; };
  }, []);
  return docs;
}
