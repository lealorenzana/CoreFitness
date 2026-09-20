import { useState } from 'react';
import { inviteOwner, type OwnerInvited } from '../lib/platform';

interface Props {
  gymId: string;
  gymName: string;
  /** From the application, when there is one: the form opens already filled in. */
  initial?: { firstName?: string; lastName?: string; email?: string; phone?: string };
  onDone: () => void;
  onCancel: () => void;
}

/**
 * Naming a gym's owner, and handing over what they sign in with.
 *
 * Used from Applications (straight after letting a gym in) and from Gyms (any
 * gym with nobody in it). Both need the same two halves: the form, then the
 * credentials — which are shown once and stored nowhere, because the temporary
 * password exists in readable form only in this reply.
 *
 * No email is sent. Nothing in this project sends mail, so the screen says
 * "pass these on" rather than implying an invitation is already in their inbox.
 */
export default function InviteOwner({ gymId, gymName, initial, onDone, onCancel }: Props) {
  const [form, setForm] = useState({
    firstName: initial?.firstName ?? '',
    lastName: initial?.lastName ?? '',
    email: initial?.email ?? '',
    phone: initial?.phone ?? '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<OwnerInvited | null>(null);
  const [copied, setCopied] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setResult(await inviteOwner(gymId, {
        email: form.email.trim(),
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        phone: form.phone.trim() || undefined,
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the owner');
    } finally {
      setBusy(false);
    }
  };

  if (result) {
    const lines = [
      `${result.gym} — your Core Fitness sign-in`,
      'Where: https://corefitness-admin.vercel.app',
      `Email: ${result.email}`,
      result.password ? `Temporary password: ${result.password}` : '',
      result.password ? 'You will be asked to choose your own password when you sign in.' : '',
    ].filter(Boolean).join('\n');

    return (
      <div className="card handover">
        <div className="name">
          {result.existing ? `${result.email} now owns ${result.gym}` : `${result.gym} has an owner`}
        </div>
        {result.existing ? (
          <div className="meta">
            They already had a Core Fitness account, so they keep the password they know. Tell them
            to switch gyms after signing in — {result.gym} is now one of theirs.
          </div>
        ) : (
          <>
            <div className="meta">
              Pass these on yourself — nothing here sends email. This password is shown once and is
              stored nowhere; it stops working as soon as they choose their own.
            </div>
            <pre className="handover-box">{lines}</pre>
            <button className="btn ghost" type="button"
              onClick={() => { void navigator.clipboard.writeText(lines).then(() => setCopied(true)); }}>
              {copied ? 'Copied' : 'Copy'}
            </button>
          </>
        )}
        <div style={{ height: 12 }} />
        <button className="btn" type="button" onClick={onDone}>
          {result.password ? 'I have written it down' : 'Done'}
        </button>
      </div>
    );
  }

  return (
    <form className="card" onSubmit={submit}>
      <div className="name">Who owns {gymName}?</div>
      <div className="meta">
        They become this gym's admin, with an account of their own. If that email already has a Core
        Fitness account, no second one is made — {gymName} is simply added to it.
      </div>
      <div className="fields">
        <div>
          <label htmlFor="owner-first">First name</label>
          <input id="owner-first" required value={form.firstName}
            onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
        </div>
        <div>
          <label htmlFor="owner-last">Last name</label>
          <input id="owner-last" required value={form.lastName}
            onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
        </div>
        <div>
          <label htmlFor="owner-email">Email</label>
          <input id="owner-email" type="email" required value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </div>
        <div>
          <label htmlFor="owner-phone">Mobile number</label>
          <input id="owner-phone" value={form.phone} placeholder="09XX XXX XXXX"
            onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </div>
      </div>
      {error && <p className="err">{error}</p>}
      <div style={{ height: 12 }} />
      <div className="row">
        <button className="btn" type="submit" disabled={busy}>
          {busy ? 'Creating…' : 'Create the owner'}
        </button>
        <button className="btn ghost" type="button" onClick={onCancel} disabled={busy}>Cancel</button>
      </div>
    </form>
  );
}
