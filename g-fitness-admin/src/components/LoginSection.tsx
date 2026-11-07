import { useEffect, useState } from 'react';
import { AtSign, KeyRound, RotateCw } from 'lucide-react';
import { loginInfoFor, resetLogin, type LoginInfo, type SlipLogin } from '../lib/api/logins';
import LoginSlip, { type SlipRole } from './LoginSlip';
import { showToast } from '../utils/toast';
import ConfirmDialog from './ui/ConfirmDialog';

/**
 * A person's login in the member and coach drawers (0236): their username,
 * whether they have finished their first sign-in, and — only where SQL allows
 * (no real email, or never set up; the desk resets members, the owner anyone) —
 * Reset login, which hands out a new one-time password on a slip. Renders
 * nothing before 0236 is pasted.
 */
export default function LoginSection({ userId, name, role }: { userId: string; name: string; role: SlipRole }) {
  const [info, setInfo] = useState<LoginInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [slip, setSlip] = useState<SlipLogin | null>(null);
  const [asking, setAsking] = useState(false);
  useEffect(() => {
    let alive = true;
    void loginInfoFor(userId).then((i) => { if (alive) setInfo(i); });
    return () => { alive = false; };
  }, [userId]);
  if (!info) return null;

  const reset = async () => {
    setAsking(false);
    setBusy(true);
    try {
      setSlip(await resetLogin(userId));
      setInfo(await loginInfoFor(userId));
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'The login could not be reset', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl p-3" data-login-section
      style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}>
      <div className="flex items-center gap-1.5 mb-1">
        <AtSign size={12} style={{ color: 'var(--color-text-muted)' }} />
        <span className="text-[9px] uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>Login</span>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <p className="text-xs font-medium font-mono" style={{ color: info.username ? 'var(--color-text-primary)' : 'var(--color-text-muted)' }} data-login-username>
          {info.username ? `@${info.username}` : 'No username'}
        </p>
        <span className="text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>
          · {info.hasEmail ? 'signs in with email' + (info.username ? ' or username' : '') : 'no email — signs in with the username'}
          {!info.setUp && ' · has not finished their first sign-in'}
        </span>
        <span className="flex-1" />
        {info.canReset && (
          <button type="button" onClick={() => setAsking(true)} disabled={busy} data-reset-login
            className="h-8 px-3 rounded-lg text-[12px] font-semibold inline-flex items-center gap-1.5 disabled:opacity-50"
            style={{ color: 'var(--color-text-primary)', border: '1px solid var(--color-border)', background: 'var(--color-surface)' }}>
            {busy ? <RotateCw size={13} className="animate-spin" /> : <KeyRound size={13} />}Reset login
          </button>
        )}
      </div>
      {!info.canReset && info.hasEmail && info.setUp && (
        <p className="text-[11px] mt-1.5" style={{ color: 'var(--color-text-secondary)' }}>
          Forgot their password? They use “Forgot password” on the sign-in screen — it goes to their own email.
        </p>
      )}
      <ConfirmDialog isOpen={asking} onClose={() => setAsking(false)} onConfirm={() => void reset()} type="warning"
        title={`Reset ${name}'s login`} confirmText="Reset login"
        message="Their current password stops working. You get a new one-time password on a slip to hand them, and they choose their own at their next sign-in." />
      {slip && (
        <LoginSlip name={name} role={role} username={slip.username} email={slip.email} password={slip.password}
          emailed={null} onClose={() => setSlip(null)} />
      )}
    </div>
  );
}
