import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { Field, TextInput } from '../components/ui/Field';
import { toast } from '../components/ui/Toast';
import { errorMessage } from '../utils/errorMessage';
import { Page, PageTitle } from '../components/ui/page';
import { Eyebrow, NocButton, Panel } from '../components/ui/noc';

/**
 * Change the email you sign in with (Nocturne redesign).
 *
 * Until now this was the one account detail nobody could change. The member
 * Edit Profile screen rendered the field disabled under "Ask the front desk to
 * change the email on your account" — and the front desk had no way to do it
 * either, so the instruction pointed at a door that wasn't there.
 *
 * Two things this screen is careful about.
 *
 * **It does not claim the address has changed.** `updateUser({ email })` sends
 * a confirmation link and changes nothing until that link is clicked, so the
 * success state says a link is waiting and names the address it went to. A
 * "Email updated" toast here would be a lie that only surfaces at the next
 * login, when the old address still works and the new one doesn't.
 *
 * **It re-checks the password first.** An email change is an account takeover
 * if left unguarded: whoever holds an unlocked phone points the login at their
 * own address and then resets the password to it. Supabase has no
 * verify-password endpoint, so the check is a `signInWithPassword` against the
 * current address — the same guard the password screen uses.
 *
 * `profiles.email` is not written here. Migration 0026 syncs it from a trigger
 * on `auth.users`, which fires when the confirmation lands, so the gym's roster
 * updates at the moment the change becomes real rather than the moment it was
 * requested.
 */
export default function ChangeEmail() {
  const navigate = useNavigate();
  const location = useLocation();
  const isTrainer = location.pathname.startsWith('/trainer');
  const backTo = isTrainer ? '/trainer/settings' : '/member/settings';

  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setCurrent(user?.email ?? ''));
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const target = next.trim().toLowerCase();

    if (!target || !password) {
      toast.error('Fill in the new email and your password.');
      return;
    }
    // Deliberately loose. Anything stricter starts rejecting real addresses,
    // and the confirmation link is the real proof the mailbox exists.
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(target)) {
      toast.error('That does not look like an email address.');
      return;
    }
    if (target === current.toLowerCase()) {
      toast.error('That is already your email address.');
      return;
    }

    setBusy(true);
    try {
      const { error: checkError } = await supabase.auth.signInWithPassword({
        email: current,
        password,
      });
      if (checkError) {
        toast.error('That password is not correct.');
        return;
      }

      const { error } = await supabase.auth.updateUser({ email: target });
      if (error) throw error;

      setSentTo(target);
    } catch (err) {
      toast.error(errorMessage(err, 'Could not start the email change'));
    } finally {
      setBusy(false);
    }
  };

  if (sentTo) {
    return (
      <Page>
        <PageTitle title="Check your new inbox" subtitle="A confirmation link is on its way" />
        <Panel glow="structure" filled>
          <Eyebrow>Link sent to</Eyebrow>
          <p className="break-all" style={{ fontSize: 17, marginTop: 6, color: 'var(--color-text-primary)' }}>{sentTo}</p>
          <div className="rule" style={{ margin: '14px 0' }} />
          {/* The one thing that must not be misread: nothing has moved yet. */}
          <p style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--color-text-secondary)' }}>
            Nothing has changed yet. Keep signing in with{' '}
            <span className="break-all" style={{ color: 'var(--color-text-primary)' }}>{current}</span> until you tap that link.
          </p>
        </Panel>
        <NocButton variant="action" onClick={() => navigate(backTo)} className="w-full">Done</NocButton>
      </Page>
    );
  }

  return (
    <Page>
      <PageTitle back fallback={backTo} title="Change email" subtitle="The address you sign in with" />

      <section>
        <Eyebrow>Signing in as</Eyebrow>
        <p className="truncate" style={{ fontSize: 15, marginTop: 6, color: 'var(--color-text-primary)' }}>{current || '—'}</p>
      </section>

      <div className="rule" />

      <form onSubmit={submit} className="flex flex-col" style={{ gap: 18 }}>
        <Field label="New email" hint="We send a confirmation link here before anything changes.">
          <TextInput
            type="email"
            inputMode="email"
            autoComplete="email"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            placeholder="you@example.com"
          />
        </Field>

        <Field label="Your password" hint="Confirms it's you before the address moves.">
          <TextInput
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />
        </Field>

        <NocButton type="submit" variant="action" disabled={busy} className="w-full">
          {busy ? 'Sending…' : 'Send confirmation link'}
        </NocButton>
      </form>

      <p style={{ fontSize: 12.5, lineHeight: 1.6, color: 'var(--color-text-muted)' }}>
        Your gym records update automatically once you confirm, so the front desk always sees the
        address you actually use.
      </p>
    </Page>
  );
}
