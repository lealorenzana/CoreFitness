import { useCallback, useEffect, useMemo, useState } from 'react';
import { Copy, Upload, X } from 'lucide-react';
import Button from '../components/ui/Button';
import { showToast } from '../utils/toast';
import { getGymContext } from '../lib/gymContext';
import {
  importInvites, inviteLink, inviteToGym, listInvitations, parseList, revokeInvitation,
  type ImportResult, type Invitation, type InviteRole, type ParsedRow,
} from '../lib/api/invitations';

const when = (iso: string) =>
  new Date(iso).toLocaleDateString('en-PH', { day: 'numeric', month: 'short', year: 'numeric' });

/**
 * Bringing in the members a gym already has.
 *
 * A gym that joins Core Fitness does not start empty — it has two hundred
 * people who train there. Creating them one at a time at the desk was the only
 * thing that existed, so this screen exists to do the other two hundred.
 *
 * Invitations rather than accounts, deliberately: an account needs a password,
 * and a password the gym chooses is one the gym knows. An invitation lets each
 * member set their own, and it is addressed — accepting one requires signing in
 * with the address it was sent to, so a link that gets forwarded cannot be used
 * by whoever received it (0111).
 *
 * Nothing here sends email. The gym hands out the link the way it already talks
 * to its members, and the screen says so rather than implying an inbox.
 */
export default function Invitations() {
  const [rows, setRows] = useState<Invitation[] | null>(null);
  const [showDone, setShowDone] = useState(false);
  const [role, setRole] = useState<InviteRole>('member');
  const [isAdmin, setIsAdmin] = useState(false);
  const [one, setOne] = useState({ email: '', firstName: '', lastName: '', phone: '' });
  const [busy, setBusy] = useState(false);
  const [paste, setPaste] = useState('');
  const [importing, setImporting] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [list, ctx] = await Promise.all([listInvitations(showDone), getGymContext()]);
      setRows(list);
      setIsAdmin(ctx?.role === 'admin');
    } catch (e) {
      setRows([]);
      showToast(e instanceof Error ? e.message : 'Could not load invitations', 'error');
    }
  }, [showDone]);

  useEffect(() => { void (async () => { await load(); })(); }, [load]);

  const parsed: ParsedRow[] = useMemo(() => (paste.trim() ? parseList(paste) : []), [paste]);
  const usable = parsed.filter((r) => !r.problem);
  const broken = parsed.filter((r) => r.problem);

  const inviteOne = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await inviteToGym({ ...one, role });
      setOne({ email: '', firstName: '', lastName: '', phone: '' });
      await load();
      showToast('Invited. Copy their link from the list below.', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'That could not be sent', 'error');
    } finally {
      setBusy(false);
    }
  };

  const runImport = async () => {
    setImporting({ done: 0, total: usable.length });
    setResult(null);
    const r = await importInvites(parsed, role, (done, total) => setImporting({ done, total }));
    setImporting(null);
    setResult(r);
    setPaste('');
    await load();
  };

  const onFile = async (file: File) => {
    setPaste(await file.text());
  };

  const copy = (text: string, key: string) => {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(null), 1500);
    });
  };

  const card = 'rounded-xl border p-5';
  const cardStyle = { borderColor: 'var(--color-border)', background: 'var(--color-surface)' };
  const labelCls = 'block text-xs mb-1';
  const labelStyle = { color: 'var(--color-text-secondary)' };
  const input = 'w-full rounded-lg border px-3 py-2 text-sm';
  const inputStyle = {
    borderColor: 'var(--color-border)', background: 'var(--color-bg)',
    color: 'var(--color-text-primary)',
  };

  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <h1 className="text-lg font-semibold" style={{ color: 'var(--color-text-primary)' }}>Invitations</h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          For the members you already have. Each person gets their own link, sets their own password,
          and arrives already approved — no queue to work through.
        </p>
      </div>

      {/* ---- one person ----------------------------------------------------- */}
      <form className={card} style={cardStyle} onSubmit={inviteOne}>
        <h2 className="text-base font-semibold" style={{ color: 'var(--color-text-primary)' }}>
          Invite one person
        </h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={labelCls} style={labelStyle} htmlFor="iv-email">Email</label>
            <input id="iv-email" type="email" required className={input} style={inputStyle}
              value={one.email} onChange={(e) => setOne({ ...one, email: e.target.value })} />
          </div>
          <div>
            <label className={labelCls} style={labelStyle} htmlFor="iv-first">First name (optional)</label>
            <input id="iv-first" className={input} style={inputStyle}
              value={one.firstName} onChange={(e) => setOne({ ...one, firstName: e.target.value })} />
          </div>
          <div>
            <label className={labelCls} style={labelStyle} htmlFor="iv-last">Last name (optional)</label>
            <input id="iv-last" className={input} style={inputStyle}
              value={one.lastName} onChange={(e) => setOne({ ...one, lastName: e.target.value })} />
          </div>
          <div>
            <label className={labelCls} style={labelStyle} htmlFor="iv-phone">Mobile (optional)</label>
            <input id="iv-phone" className={input} style={inputStyle} placeholder="09XX XXX XXXX"
              value={one.phone} onChange={(e) => setOne({ ...one, phone: e.target.value })} />
          </div>
          <div>
            <label className={labelCls} style={labelStyle} htmlFor="iv-role">Joining as</label>
            <select id="iv-role" className={input} style={inputStyle} value={role}
              onChange={(e) => setRole(e.target.value as InviteRole)}>
              <option value="member">Member</option>
              {/* The front desk brings members in; only an owner brings in a
                  coach or more desk staff. The database enforces the same
                  split, so a staff account never sees an option it cannot use. */}
              {isAdmin && <option value="trainer">Coach</option>}
              {isAdmin && <option value="staff">Front desk</option>}
            </select>
          </div>
        </div>
        <Button className="mt-4" type="submit" disabled={busy}>
          {busy ? 'Inviting…' : 'Create invitation'}
        </Button>
      </form>

      {/* ---- a whole list --------------------------------------------------- */}
      <div className={card} style={cardStyle}>
        <h2 className="text-base font-semibold" style={{ color: 'var(--color-text-primary)' }}>
          Bring in your whole list
        </h2>
        <p className="mt-1 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          Paste from a spreadsheet, or choose a CSV file. One person per line — an email is all that
          is needed, and a name and mobile are used if they are there. Nothing is sent until you have
          seen what will happen.
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}>
            <Upload size={14} /> Choose a CSV file
            <input type="file" accept=".csv,text/csv,text/plain" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); }} />
          </label>
          {paste && (
            <Button variant="ghost" onClick={() => { setPaste(''); setResult(null); }}>
              <X size={14} className="mr-1.5" /> Clear
            </Button>
          )}
        </div>

        <textarea
          className="mt-3 w-full rounded-lg border px-3 py-2 text-sm"
          style={{ ...inputStyle, minHeight: 110, resize: 'vertical' }}
          placeholder={'maria@example.com, Maria, Santos, 09171234567\njuan@example.com, Juan, Dela Cruz'}
          value={paste}
          onChange={(e) => { setPaste(e.target.value); setResult(null); }}
        />

        {parsed.length > 0 && (
          <div className="mt-3">
            <p className="text-sm" style={{ color: 'var(--color-text-primary)' }}>
              {usable.length} to invite as {role === 'member' ? 'members' : role === 'trainer' ? 'coaches' : 'front desk'}
              {broken.length > 0 && `, ${broken.length} that cannot be used`}
            </p>
            {broken.length > 0 && (
              <ul className="mt-2 space-y-1">
                {broken.slice(0, 8).map((r) => (
                  <li key={r.line} className="text-xs" style={{ color: 'var(--color-secondary)' }}>
                    Line {r.line}: {r.problem}
                  </li>
                ))}
                {broken.length > 8 && (
                  <li className="text-xs" style={labelStyle}>…and {broken.length - 8} more</li>
                )}
              </ul>
            )}
            <Button className="mt-3" disabled={usable.length === 0 || importing !== null}
              onClick={() => void runImport()}>
              {importing
                ? `Inviting… ${importing.done} of ${importing.total}`
                : `Invite ${usable.length} ${usable.length === 1 ? 'person' : 'people'}`}
            </Button>
            {broken.length > 0 && (
              <p className="mt-2 text-xs" style={labelStyle}>
                The lines that cannot be used are skipped — the rest still go.
              </p>
            )}
          </div>
        )}

        {result && (
          <div className="mt-4 rounded-lg border p-3.5"
            style={{ borderColor: 'var(--color-primary)', background: 'var(--color-bg)' }}>
            <p className="text-sm" style={{ color: 'var(--color-text-primary)' }}>
              {result.invited.length} invited{result.failed.length > 0 && `, ${result.failed.length} refused`}
            </p>
            {result.failed.length > 0 && (
              <ul className="mt-2 space-y-1">
                {result.failed.slice(0, 10).map((f) => (
                  <li key={f.email} className="text-xs" style={labelStyle}>
                    <strong style={{ color: 'var(--color-text-primary)' }}>{f.email}</strong> — {f.reason}
                  </li>
                ))}
              </ul>
            )}
            {result.invited.length > 0 && (
              <Button variant="ghost" className="mt-3"
                onClick={() => copy(
                  result.invited.map((i) => `${i.email}\t${inviteLink(i.token)}`).join('\n'),
                  'bulk',
                )}>
                <Copy size={14} className="mr-1.5" />
                {copied === 'bulk' ? 'Copied' : 'Copy every link'}
              </Button>
            )}
          </div>
        )}
      </div>

      {/* ---- the list ------------------------------------------------------- */}
      <div className={card} style={cardStyle}>
        <div className="flex items-center gap-3">
          <h2 className="flex-1 text-base font-semibold" style={{ color: 'var(--color-text-primary)' }}>
            {showDone ? 'Every invitation' : 'Waiting to be accepted'}
          </h2>
          <Button variant="ghost" onClick={() => setShowDone((v) => !v)}>
            {showDone ? 'Waiting only' : 'Show all'}
          </Button>
        </div>

        {rows === null && <p className="mt-3 text-sm" style={labelStyle}>Loading…</p>}
        {rows?.length === 0 && (
          <p className="mt-3 text-sm" style={labelStyle}>
            {showDone ? 'Nobody has been invited yet.' : 'Nobody is waiting.'}
          </p>
        )}

        <div className="mt-3 space-y-2">
          {rows?.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center gap-2 rounded-lg border px-3.5 py-2.5"
              style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg)' }}>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm" style={{ color: 'var(--color-text-primary)' }}>
                  {[r.first_name, r.last_name].filter(Boolean).join(' ') || r.email}
                </span>
                <span className="block text-xs" style={labelStyle}>
                  {r.email} · {r.role === 'member' ? 'member' : r.role === 'trainer' ? 'coach' : 'front desk'}
                  {' · '}
                  {r.state === 'waiting' ? `invited ${when(r.created_at)}, expires ${when(r.expires_at)}`
                    : r.state === 'accepted' ? `joined ${when(r.accepted_at!)}`
                    : r.state === 'revoked' ? 'withdrawn'
                    : 'expired'}
                </span>
              </span>
              {r.state === 'waiting' && (
                <>
                  <Button variant="ghost" onClick={() => copy(inviteLink(r.token), r.id)}>
                    <Copy size={14} className="mr-1.5" /> {copied === r.id ? 'Copied' : 'Copy link'}
                  </Button>
                  <Button variant="ghost" onClick={() => void (async () => {
                    try { await revokeInvitation(r.id); await load(); }
                    catch (e) { showToast(e instanceof Error ? e.message : 'Could not withdraw it', 'error'); }
                  })()}>Withdraw</Button>
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
