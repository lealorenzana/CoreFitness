import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { getGymContext } from '../../lib/gymContext';
import { acceptMemberDocument, behind, CURRENT, getMyAgreements } from '../../lib/api/termsAcceptance';
import { prettyVersion, type LegalDocument } from '../../lib/legalVersions';

/**
 * The end of a member document: where this member stands with *this version*.
 *
 *   agreed to it        "You agreed to this version." — nothing to press
 *   agreed to an older  "You agreed to the version of …" + Agree to this version
 *   none recorded       Agree to this version (desk-made accounts, pre-0151 sign-ups)
 *
 * Only for a member of the current gym: a coach or the desk opening the page has
 * no member terms of their own, and `accept_member_terms()` would refuse them.
 * Signed out, or 0151 not pasted: nothing — Register asks at sign-up.
 */
type State =
  | { kind: 'hidden' }
  | { kind: 'ready'; agreed: string | null }
  | { kind: 'saving'; agreed: string | null }
  | { kind: 'done' }
  | { kind: 'error'; agreed: string | null; message: string };

export default function AgreementBlock({ document }: { document: LegalDocument }) {
  const [state, setState] = useState<State>({ kind: 'hidden' });
  const current = CURRENT[document];

  useEffect(() => {
    let alive = true;
    void (async () => {
      const [ctx, mine] = await Promise.all([getGymContext(), getMyAgreements()]);
      if (!alive || !mine || ctx?.role !== 'member') return;
      setState(behind(mine[document], current) ? { kind: 'ready', agreed: mine[document] } : { kind: 'done' });
    })();
    return () => { alive = false; };
  }, [document, current]);

  if (state.kind === 'hidden') return null;

  if (state.kind === 'done') {
    return (
      <div id="agreement" className="legal-agree is-done">
        <span className="legal-agree-mark"><Check size={16} /></span>
        <p><b>You agreed to this version</b> — the one dated {prettyVersion(current)}.</p>
      </div>
    );
  }

  const agreed = state.agreed;
  const save = async () => {
    setState({ kind: 'saving', agreed });
    try {
      await acceptMemberDocument(document);
      setState({ kind: 'done' });
    } catch (e) {
      setState({ kind: 'error', agreed, message: e instanceof Error ? e.message : 'It could not be saved. Try again.' });
    }
  };

  return (
    <div id="agreement" className="legal-agree">
      <p>
        <b>{agreed === null || agreed === 'unversioned' ? 'No agreement to this version is recorded for you.' : `You agreed to the version of ${prettyVersion(agreed)}.`}</b>{' '}
        This page was updated on {prettyVersion(current)}. Agreeing records this version, with today’s date, for your gym.
      </p>
      {state.kind === 'error' && <p className="legal-agree-error">{state.message}</p>}
      <button type="button" className="legal-agree-btn" onClick={() => void save()} disabled={state.kind === 'saving'}>
        {state.kind === 'saving' ? 'Saving…' : 'Agree to this version'}
      </button>
    </div>
  );
}
