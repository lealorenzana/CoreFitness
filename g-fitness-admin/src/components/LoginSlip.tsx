import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { QRCodeSVG } from 'qrcode.react';
import { Check, Copy, Mail, MailX, Printer, X } from 'lucide-react';
import { getGymContext } from '../lib/gymContext';

const MEMBER_APP = 'https://corefitness-gym.vercel.app';
const ADMIN_APP = 'https://corefitness-admin.vercel.app';

export type SlipRole = 'member' | 'trainer' | 'staff';

/**
 * The login slip (0236, the owner, 2026-11-07): every login the desk makes or
 * resets is shown here, ready to print or read out — the gym, the person, what
 * they sign in with, the one-time password, and the app with its QR code. Their
 * first sign-in asks them to choose their own password, so the slip stops
 * working once used. It is shown whether or not the email went; the email line
 * says which. Paper is white in both modes — it is meant to be printed.
 */
export default function LoginSlip({ name, role, username, email, password, emailed, existing, onClose }: {
  name: string;
  role: SlipRole;
  username: string | null;
  email: string | null;
  /** Null for someone who already had an account: they sign in with their own password. */
  password: string | null;
  /** What happened to the email, if one was sent. */
  emailed?: 'sent' | 'failed' | 'not_configured' | 'skipped' | null;
  existing?: boolean;
  onClose: () => void;
}) {
  const [gym, setGym] = useState<{ name: string; logo: string | null } | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    void getGymContext().then((c) => setGym({ name: c?.shortName || c?.gymName || 'Your gym', logo: c?.logoUrl ?? null }));
  }, []);
  // Printing shows the slip alone (index.css: body.slip-open hides #root).
  useEffect(() => {
    document.body.classList.add('slip-open');
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => { document.body.classList.remove('slip-open'); window.removeEventListener('keydown', onKey); };
  }, [onClose]);

  const app = role === 'staff' ? `${ADMIN_APP}/admin/login` : `${MEMBER_APP}/login`;
  const appShort = app.replace(/^https:\/\//, '');
  const what = role === 'member' ? 'Member' : role === 'trainer' ? 'Coach' : 'Front desk';
  const signInWith = [username, email].filter(Boolean) as string[];
  const text = [
    `${gym?.name ?? 'Your gym'} — your Core Fitness login`,
    `Name: ${name}`,
    `Sign in at: ${app}`,
    username ? `Username: ${username}` : null,
    email ? `Email: ${email}` : null,
    password ? `One-time password: ${password}` : 'Sign in with the password you already use.',
    password ? 'When you first sign in you will choose your own password.' : null,
  ].filter(Boolean).join('\n');
  const copy = () => void navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); });

  return createPortal(
    <div className="login-slip-sheet fixed inset-0 z-[400] grid place-items-center p-4" role="dialog" aria-modal="true" aria-label={`Login slip for ${name}`}
      style={{ background: 'rgba(8, 8, 14, 0.6)', backdropFilter: 'blur(4px)' }} onClick={onClose} data-login-slip>
      <div className="w-full max-w-[440px]" onClick={(e) => e.stopPropagation()}>
        <div className="login-slip-paper relative rounded-2xl p-6" style={{ background: '#FFFFFF', color: '#15151C', boxShadow: '0 24px 60px -20px rgba(0,0,0,.5)' }}>
          <button type="button" onClick={onClose} aria-label="Close" className="login-slip-controls absolute top-3 right-3 h-9 w-9 rounded-lg grid place-items-center"
            style={{ color: '#4A4D5E' }}><X size={17} /></button>
          <div className="flex items-center gap-3 pb-4" style={{ borderBottom: '1.5px dashed #C9C9D5' }}>
            {gym?.logo
              ? <img src={gym.logo} alt="" className="w-10 h-10 rounded-xl object-cover" />
              : <span className="w-10 h-10 rounded-xl grid place-items-center text-sm font-extrabold" style={{ background: 'var(--fill-primary, var(--color-primary))', color: '#FFFFFF' }}>{(gym?.name ?? 'G').slice(0, 2).toUpperCase()}</span>}
            <div className="min-w-0">
              <p className="text-[15px] font-bold truncate">{gym?.name ?? ' '}</p>
              <p className="text-xs" style={{ color: '#4A4D5E' }}>Your Core Fitness login</p>
            </div>
          </div>

          <div className="pt-4 grid gap-3" style={{ gridTemplateColumns: 'minmax(0,1fr) auto' }}>
            <div className="min-w-0 space-y-3">
              <Line label={what} value={name} />
              {signInWith.length > 0 && (
                <Line label={signInWith.length > 1 ? 'Sign in with either' : 'Sign in with'} value={signInWith.join('\n')} mono data="slip-login" />
              )}
              {password
                ? <Line label="One-time password" value={password} mono big data="slip-password" />
                : <Line label="Password" value="The one you already use" />}
            </div>
            <div className="text-center">
              <div className="rounded-xl p-2" style={{ border: '1.5px solid #E3E3EA' }}><QRCodeSVG value={app} size={92} level="M" bgColor="#FFFFFF" fgColor="#15151C" /></div>
              <p className="text-[11px] mt-1.5 font-semibold" style={{ color: '#4A4D5E' }}>Scan to open</p>
            </div>
          </div>

          <div className="mt-4 rounded-xl px-3.5 py-3 text-[12.5px] leading-relaxed" style={{ background: 'color-mix(in srgb, var(--color-primary) 9%, #FFFFFF)', color: '#2E2A3D' }}>
            <p>Sign in at <b>{appShort}</b>{role === 'staff' ? ' on a computer' : ' on your phone'}.</p>
            {password && <p className="mt-1">At your first sign-in you choose your own password{role !== 'staff' ? ', a username and a photo if you like' : ''}. This one then stops working.</p>}
            {existing && <p className="mt-1">You already have a Core Fitness account: sign in with your usual password and you will be asked to finish joining.</p>}
          </div>
        </div>

        {/* The desk's controls — never printed. */}
        <div className="login-slip-controls mt-3 flex flex-wrap items-center gap-2">
          <EmailState emailed={emailed ?? null} hasEmail={!!email} />
          <span className="flex-1" />
          <button type="button" onClick={copy} className="h-10 px-3.5 rounded-xl text-[13px] font-semibold inline-flex items-center gap-1.5"
            style={{ background: '#FFFFFF', color: '#15151C', border: '1px solid #D6D6E0' }}>
            {copied ? <Check size={15} /> : <Copy size={15} />}{copied ? 'Copied' : 'Copy'}
          </button>
          <button type="button" onClick={() => window.print()} className="h-10 px-3.5 rounded-xl text-[13px] font-semibold inline-flex items-center gap-1.5"
            style={{ background: 'var(--fill-primary, var(--color-primary))', color: '#FFFFFF' }} data-slip-print>
            <Printer size={15} />Print slip
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function Line({ label, value, mono, big, data }: { label: string; value: string; mono?: boolean; big?: boolean; data?: string }) {
  return (
    <div data-slip-line={data}>
      <p className="text-[11px] font-bold uppercase tracking-[0.12em]" style={{ color: '#686B7E' }}>{label}</p>
      <p className={`whitespace-pre-line break-all ${big ? 'text-[22px] font-extrabold tracking-[0.06em]' : 'text-[15px] font-semibold'}`}
        style={{ fontFamily: mono ? 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' : undefined }}>{value}</p>
    </div>
  );
}

function EmailState({ emailed, hasEmail }: { emailed: 'sent' | 'failed' | 'not_configured' | 'skipped' | null; hasEmail: boolean }) {
  const [icon, words] = !hasEmail ? [MailX, 'No email — hand this slip over']
    : emailed === 'sent' ? [Mail, 'Also emailed to them']
    : emailed === 'failed' ? [MailX, 'The email did not go — hand this slip over']
    : emailed === 'not_configured' ? [MailX, 'Email is not set up — hand this slip over']
    : [MailX, 'Not emailed — hand this slip over'];
  const Icon = icon;
  return (
    <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold rounded-full px-3 h-8" data-slip-email={emailed ?? 'none'}
      style={{ background: '#FFFFFF', color: emailed === 'sent' ? '#15803D' : '#92400E', border: '1px solid #D6D6E0' }}>
      <Icon size={14} />{words}
    </span>
  );
}
