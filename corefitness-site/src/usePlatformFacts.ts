import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import { FALLBACK_FACTS, type Facts } from './legalText';

/**
 * What the gym documents quote from the platform's settings, and which version
 * is in effect — `platform_public_terms()` (0154, 0156). Read once per page
 * view. Until it answers (or if it cannot) the facts are the fallback: no
 * numbers, and nothing in effect, which is the honest reading of "unknown".
 */
const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);

export function usePlatformFacts(): Facts {
  const [facts, setFacts] = useState<Facts>(FALLBACK_FACTS);
  useEffect(() => {
    let alive = true;
    void (async () => {
      if (!supabase) return;
      const { data, error } = await supabase.rpc('platform_public_terms');
      if (error || !data || !alive) return;
      const d = data as Record<string, unknown>;
      setFacts({
        businessName: text(d.business_name) ?? FALLBACK_FACTS.businessName,
        address: text(d.business_address),
        email: text(d.business_email),
        phone: text(d.business_phone),
        graceDays: typeof d.grace_days === 'number' ? d.grace_days : null,
        reminderDays: Array.isArray(d.reminder_days) ? (d.reminder_days as number[]) : null,
        published: text(d.gym_terms_published),
      });
    })();
    return () => { alive = false; };
  }, []);
  return facts;
}
