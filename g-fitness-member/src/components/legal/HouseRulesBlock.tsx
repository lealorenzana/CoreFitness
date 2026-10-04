import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { getGymContext } from '../../lib/gymContext';
import { acceptHouseRules, getMyHouseRules, type MyHouseRules } from '../../lib/api/houseRules';

const day = (iso: string) => new Date(iso).toLocaleDateString('en-PH', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Manila' });

/**
 * Terms section 6: this gym's own house rules (0153), word for word, with the
 * reader's agreement to this version. Rendered only when the gym has rules in
 * effect; a reader with no session sees nothing here (each gym writes its own,
 * and section 6 says so). Only a member of the gym gets the Agree button —
 * a coach or the desk reading the Terms has nothing to agree to.
 */
export default function HouseRulesBlock() {
  const [rules, setRules] = useState<MyHouseRules | null>(null);
  const [member, setMember] = useState(false);
  const [state, setState] = useState<'idle' | 'saving' | 'error'>('idle');
  const [message, setMessage] = useState('');

  useEffect(() => {
    let alive = true;
    void (async () => {
      const [ctx, r] = await Promise.all([getGymContext(), getMyHouseRules()]);
      if (!alive) return;
      setRules(r);
      setMember(ctx?.role === 'member');
    })();
    return () => { alive = false; };
  }, []);

  if (!rules || rules.body.trim() === '') return null;

  const agree = async () => {
    setState('saving');
    try {
      await acceptHouseRules(rules.id);
      setRules({ ...rules, accepted_at: new Date().toISOString(), agreed_version: rules.version });
      setState('idle');
    } catch (e) {
      setState('error'); setMessage(e instanceof Error ? e.message : 'It could not be saved. Try again.');
    }
  };

  return (
    <div id="house-rules" className="legal-house">
      <p className="legal-house-head">Your gym’s own house rules <span>version {rules.version} · {day(rules.published_at)}</span></p>
      <div className="legal-house-body">{rules.body}</div>
      {member && (rules.accepted_at ? (
        <p className="legal-house-done"><Check size={15} /> You agreed to these rules on {day(rules.accepted_at)}.</p>
      ) : (
        <div className="legal-house-ask">
          <p>{rules.agreed_version ? `You agreed to version ${rules.agreed_version}; these replace it.` : 'Your gym asks you to agree to these rules.'}</p>
          {state === 'error' && <p className="legal-agree-error">{message}</p>}
          <button type="button" className="legal-agree-btn" onClick={() => void agree()} disabled={state === 'saving'}>
            {state === 'saving' ? 'Saving…' : 'Agree to these rules'}
          </button>
        </div>
      ))}
    </div>
  );
}
