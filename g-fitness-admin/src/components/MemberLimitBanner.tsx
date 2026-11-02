import { useEffect, useState } from 'react';
import { AlertTriangle, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';

/**
 * The plan's member limit, before it bites (0230).
 *
 * At the limit the database refuses a new member — a sign-up, an approval, an
 * invitation, a switch from another gym — so the owner hears it here first:
 * from 90% a quiet line, at the limit an amber one that says what stops and how
 * to lift it. Silent below 90% and on a plan with no limit, like its neighbour
 * SubscriptionBanner. Admin and staff both see it — the desk is who gets refused.
 */
interface Allowance { plan_name: string | null; max_members: number | null; active_members: number }

export default function MemberLimitBanner() {
  const [a, setA] = useState<Allowance | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const { data, error } = await supabase.rpc('my_member_allowance');
      if (!alive || error || !Array.isArray(data) || !data[0]) return;
      setA(data[0] as Allowance);
    })();
    return () => { alive = false; };
  }, []);

  if (!a || a.max_members == null || a.active_members < Math.ceil(a.max_members * 0.9)) return null;
  const full = a.active_members >= a.max_members;
  const plan = a.plan_name ?? 'your plan';

  return (
    <div
      className="mx-4 mt-4 flex items-start gap-2.5 rounded-lg border px-3.5 py-2.5 text-sm"
      style={{
        borderColor: full ? 'var(--color-secondary)' : 'var(--color-border)',
        background: full ? 'var(--color-secondary-light)' : 'var(--color-surface)',
        color: full ? 'var(--color-secondary)' : 'var(--color-text-secondary)',
      }}
      role={full ? 'alert' : undefined}
      data-member-limit
    >
      {full ? <AlertTriangle size={16} className="mt-0.5 shrink-0" /> : <Users size={16} className="mt-0.5 shrink-0" />}
      <span className="flex-1">
        {full
          ? <>Your plan ({plan}) allows {a.max_members} members, and you have {a.active_members}. New sign-ups and approvals stop until you upgrade — nobody already in is affected.</>
          : <>{a.active_members} of {a.max_members} members on {plan}. At {a.max_members}, new sign-ups and approvals stop — upgrade for more room.</>}
      </span>
      <Link to="/subscription" className="text-xs font-semibold underline whitespace-nowrap">Upgrade</Link>
    </div>
  );
}
