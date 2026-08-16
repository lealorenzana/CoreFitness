import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, Mail, MailCheck, AlertCircle } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { panelStyle } from '../components/ui/Card';
import { Field, TextInput } from '../components/ui/Field';
import { toast } from '../components/ui/Toast';
import { errorMessage } from '../utils/errorMessage';

/**
 * Change the email you sign in with.
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
      <div className="flex items-center justify-center h-full px-6">
        <motion.div
          initial={{ scale: 0.94, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 320, damping: 24 }}
          className="text-center"
        >
          <div
            className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-5"
            style={{ background: 'var(--color-primary-light)', border: '2px solid var(--color-primary)' }}
          >
            <MailCheck size={36} style={{ color: 'var(--color-primary)' }} />
          </div>
          <h2 className="display text-xl text-white">Check your new inbox</h2>
          <p className="text-xs mt-2 leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
            We sent a confirmation link to <span className="text-white font-semibold">{sentTo}</span>.
          </p>

          <div className="mt-5 p-4 text-left" style={{ ...panelStyle, borderRadius: 'var(--radius-panel)' }}>
            <div className="flex items-start gap-2.5">
              <AlertCircle size={16} style={{ color: 'var(--color-secondary)' }} className="flex-shrink-0 mt-0.5" />
              <p className="text-xs leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
                Nothing has changed yet. Keep signing in with{' '}
                <span className="text-white font-semibold">{current}</span> until you tap that link.
              </p>
            </div>
          </div>

          <button
            onClick={() => navigate(backTo)}
            className="w-full h-12 rounded-full font-semibold text-sm text-white mt-5"
            style={{ background: 'var(--color-primary)' }}
          >
            Done
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-4">
      <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-3">
        <button
          onClick={() => navigate(backTo)}
          className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ ...panelStyle, color: 'var(--color-text-secondary)' }}
          aria-label="Back"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="min-w-0">
          <h1 className="display text-xl text-white">Change email</h1>
          <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>The address you sign in with</p>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
        className="p-4 flex items-center gap-3"
        style={{ ...panelStyle, borderRadius: 'var(--radius-panel)' }}
      >
        <span
          className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: 'var(--color-primary-light)' }}
        >
          <Mail size={19} style={{ color: 'var(--color-primary)' }} />
        </span>
        <div className="min-w-0">
          <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Signing in as</p>
          <p className="text-sm font-semibold text-white truncate">{current || '—'}</p>
        </div>
      </motion.div>

      <motion.form
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
        onSubmit={submit}
        className="p-4 space-y-4"
        style={{ ...panelStyle, borderRadius: 'var(--radius-panel)' }}
      >
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

        <button
          type="submit"
          disabled={busy}
          className="w-full h-12 rounded-full font-semibold text-sm text-white disabled:opacity-50 active:scale-[0.99] transition-transform"
          style={{ background: 'var(--color-primary)' }}
        >
          {busy ? 'Sending…' : 'Send confirmation link'}
        </button>
      </motion.form>

      <p className="text-xs px-1 leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
        Your gym records update automatically once you confirm, so the front desk always sees the
        address you actually use.
      </p>
    </div>
  );
}
