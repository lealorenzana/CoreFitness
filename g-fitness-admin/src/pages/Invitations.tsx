import { useCallback, useEffect, useMemo, useState } from 'react';
import { Copy, Mail, Upload, X, Users, CheckCircle2, Clock, UserPlus, FileText, Info, Send, Lock, Trash2, ArrowRight } from 'lucide-react';
import { usePaged } from '../hooks/usePaged';
import { useFitRows } from '../hooks/useFitRows';
import { showToast } from '../utils/toast';
import { getGymContext } from '../lib/gymContext';
import {
  emailInvitation, importInvites, inviteLink, inviteToGym, listInvitations, parseList, revokeInvitation,
  type ImportResult, type Invitation, type InviteRole, type ParsedRow,
} from '../lib/api/invitations';
import { RdHeader, RdCard, StatTile, RdButton, Pill, RdTable, Tr, Td, TableFooter, EmptyBlock, IconTile } from '../components/ui/rd';
import type { Tone } from '../components/ui/rdTokens';

const when = (iso: string) =>
  new Date(iso).toLocaleDateString('en-PH', { day: 'numeric', month: 'short', year: 'numeric' });
/** "2 days ago" / "In 12 days", from whole days. */
const relDays = (iso: string, now: number) => {
  const d = Math.round((new Date(iso).getTime() - now) / 86_400_000);
  if (d === 0) return 'Today';
  return d > 0 ? `In ${d} day${d === 1 ? '' : 's'}` : `${-d} day${d === -1 ? '' : 's'} ago`;
};
const ROLE: Record<InviteRole, string> = { member: 'Member', trainer: 'Coach', staff: 'Front desk' };
const STATE_TONE: Record<Invitation['state'], Tone> = { waiting: 'violet', accepted: 'green', revoked: 'gray', expired: 'amber' };
const STATE_LABEL: Record<Invitation['state'], string> = { waiting: 'Waiting', accepted: 'Joined', revoked: 'Withdrawn', expired: 'Expired' };

/**
 * Bringing in the members a gym already has (redesigned 2026-10-11 from the
 * owner's mock-up): three counts, one person or a whole list side by side,
 * and the invitations waiting to be accepted.
 *
 * Invitations rather than accounts, deliberately: each member sets their own
 * password, and an invitation is addressed — accepting it needs the address it
 * was sent to (0111). The gym hands out the link the way it already talks to
 * its members, or presses "Email it", which says whether it went.
 */
export default function Invitations() {
  const [rows, setRows] = useState<Invitation[] | null>(null);
  /** Every invitation, for the counts above the page (the list below may be waiting-only). */
  const [all, setAll] = useState<Invitation[]>([]);
  /** Rows that fit the list's own box — the page never scrolls (2026-10-11). */
  const fit = useFitRows(10);
  const paged = usePaged(rows ?? [], fit.perPage);
  const [way, setWay] = useState<'one' | 'group'>('one');
  const [showDone, setShowDone] = useState(false);
  const [role, setRole] = useState<InviteRole>('member');
  const [isAdmin, setIsAdmin] = useState(false);
  const [one, setOne] = useState({ email: '', firstName: '', lastName: '', phone: '' });
  const [busy, setBusy] = useState(false);
  const [paste, setPaste] = useState('');
  const [importing, setImporting] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [gym, setGym] = useState<{ id: string; name: string } | null>(null);
  const [mailing, setMailing] = useState<string | null>(null);
  const [mailed, setMailed] = useState<Record<string, string>>({});
  const [reviewing, setReviewing] = useState(false);
  /** Now, read once — never during a render. */
  const [nowMs] = useState(() => Date.now());

  const load = useCallback(async () => {
    try {
      const [list, every, ctx] = await Promise.all([listInvitations(showDone), listInvitations(true).catch(() => []), getGymContext()]);
      setRows(list);
      setAll(every);
      setIsAdmin(ctx?.role === 'admin');
      setGym(ctx?.gymId && ctx.gymName ? { id: ctx.gymId, name: ctx.gymName } : null);
    } catch (e) {
      setRows([]);
      showToast(e instanceof Error ? e.message : 'Could not load invitations', 'error');
    }
  }, [showDone]);

  useEffect(() => { void (async () => { await load(); })(); }, [load]);

  const parsed: ParsedRow[] = useMemo(() => (paste.trim() ? parseList(paste) : []), [paste]);
  const usable = parsed.filter((r) => !r.problem);
  const broken = parsed.filter((r) => r.problem);

  const counts = useMemo(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const soon = now.getTime() + 3 * 86_400_000;
    return {
      waiting: all.filter((r) => r.state === 'waiting').length,
      acceptedThisMonth: all.filter((r) => r.state === 'accepted' && r.accepted_at && new Date(r.accepted_at).getTime() >= monthStart).length,
      expiringSoon: all.filter((r) => r.state === 'waiting' && new Date(r.expires_at).getTime() <= soon).length,
    };
  }, [all]);

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
    setReviewing(false);
    await load();
  };

  const onFile = async (file: File) => { setPaste(await file.text()); setReviewing(true); setResult(null); };

  const copy = (text: string, key: string) => {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(null), 1500);
    });
  };

  /** Email one invitation. Says plainly whether it went, and keeps Copy link either way. */
  const mail = async (r: Invitation) => {
    if (!gym) return;
    setMailing(r.id);
    try {
      const res = await emailInvitation(r, gym);
      if (res.status === 'sent') {
        setMailed((m) => ({ ...m, [r.id]: 'Emailed' }));
        showToast(`Emailed to ${r.email}.`, 'success');
      } else if (res.status === 'not_configured') {
        showToast('Email is not set up on Core Fitness yet, so nothing was sent. Copy the link and send it yourself.', 'error');
      } else {
        showToast(`The email did not go through${res.error ? ': ' + res.error.slice(0, 140) : ''}. Copy the link instead.`, 'error');
      }
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not email it', 'error');
    } finally {
      setMailing(null);
    }
  };
  const withdraw = async (r: Invitation) => {
    try { await revokeInvitation(r.id); await load(); }
    catch (e) { showToast(e instanceof Error ? e.message : 'Could not withdraw it', 'error'); }
  };

  const labelCls = 'block text-[14.5px] mb-2 font-medium';
  const labelSt = { color: 'var(--color-text-primary)' };
  const input = 'w-full h-12 rounded-xl px-4 text-[15px] text-white outline-none';
  const inputSt = { background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.1)' };
  const muted = { color: 'var(--color-text-secondary)' };
  const roleWord = role === 'member' ? 'members' : role === 'trainer' ? 'coaches' : 'front desk';

  return (
    <div className="rd-fit" data-invitations>
      <RdHeader title="Invitations" subtitle="Invite members and manage pending invites. Each person sets their own password and arrives already approved." />

      <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
        <StatTile icon={Users} label="Pending invitations" compact value={counts.waiting} sub="Invites waiting to be accepted"
          onClick={() => { setShowDone(false); document.getElementById('waiting')?.scrollIntoView({ behavior: 'smooth' }); }} />
        <StatTile icon={CheckCircle2} tone="green" label="Accepted this month" compact value={counts.acceptedThisMonth} sub="New members joined"
          onClick={() => { setShowDone(true); document.getElementById('waiting')?.scrollIntoView({ behavior: 'smooth' }); }} />
        <StatTile icon={Clock} tone="amber" label="Expiring soon" compact value={counts.expiringSoon} sub="Expires in 3 days or less"
          onClick={() => { setShowDone(false); document.getElementById('waiting')?.scrollIntoView({ behavior: 'smooth' }); }} />
      </div>

      <div className="rd-fit-split">
        <RdCard className="flex flex-col min-h-0 overflow-hidden" data-invite-ways>
          <div className="flex gap-2 p-3" role="tablist" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            {([['one', 'Invite one person', UserPlus], ['group', 'Invite a group', FileText]] as const).map(([k, label, Icon]) => (
              <button key={k} type="button" role="tab" aria-selected={way === k} onClick={() => setWay(k)} data-way={k}
                className="flex-1 h-11 rounded-xl inline-flex items-center justify-center gap-2 text-[14.5px] font-semibold transition-colors"
                style={way === k ? { background: 'rgba(124,58,237,0.2)', border: '1px solid rgba(139,92,246,0.7)', color: '#EDE9FE' }
                  : { border: '1px solid transparent', color: 'var(--color-text-secondary)' }}>
                <Icon size={17} /> {label}
              </button>
            ))}
          </div>
          <div className="rd-fit-scroll p-5">
        {/* ── One person ── */}
        {way === 'one' && (
          <form onSubmit={inviteOne} data-invite-one>
            <p className="text-[14.5px]" style={muted}>Send a single invitation to a new member.</p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className={labelCls} style={labelSt} htmlFor="iv-email">Email</label>
                <input id="iv-email" type="email" required className={input} style={inputSt} placeholder="name@example.com"
                  value={one.email} onChange={(e) => setOne({ ...one, email: e.target.value })} />
              </div>
              <div>
                <label className={labelCls} style={labelSt} htmlFor="iv-first">First name (optional)</label>
                <input id="iv-first" className={input} style={inputSt} placeholder="e.g. Maria"
                  value={one.firstName} onChange={(e) => setOne({ ...one, firstName: e.target.value })} />
              </div>
              <div>
                <label className={labelCls} style={labelSt} htmlFor="iv-last">Last name (optional)</label>
                <input id="iv-last" className={input} style={inputSt} placeholder="e.g. Santos"
                  value={one.lastName} onChange={(e) => setOne({ ...one, lastName: e.target.value })} />
              </div>
              <div>
                <label className={labelCls} style={labelSt} htmlFor="iv-phone">Mobile (optional)</label>
                <input id="iv-phone" className={input} style={inputSt} placeholder="09XX XXX XXXX"
                  value={one.phone} onChange={(e) => setOne({ ...one, phone: e.target.value })} />
              </div>
              <div>
                <label className={labelCls} style={labelSt} htmlFor="iv-role">Joining as</label>
                <select id="iv-role" className={input} style={{ ...inputSt, colorScheme: 'dark' }} value={role}
                  onChange={(e) => setRole(e.target.value as InviteRole)}>
                  <option value="member">Member</option>
                  {/* Only an owner brings in a coach or more desk staff — the database enforces the same split. */}
                  {isAdmin && <option value="trainer">Coach</option>}
                  {isAdmin && <option value="staff">Front desk</option>}
                </select>
              </div>
            </div>
            <RdButton className="mt-6" variant="primary" icon={Send} type="submit" disabled={busy}>
              {busy ? 'Inviting…' : 'Create invitation'}
            </RdButton>
          </form>
        )}

        {/* ── A whole list ── */}
        {way === 'group' && (
        <div data-invite-group>
          <p className="text-[13px] flex items-start gap-2" style={muted}>
            <Info size={15} className="flex-none mt-0.5" /> Paste a spreadsheet or choose a CSV file. You&rsquo;ll review every invitation, joining as {roleWord}, before any is sent.
          </p>
          {/* A worked example (the owner asked, 2026-10-18): what the desk actually does, step by step. */}
          <details className="mt-2 rounded-xl px-3 py-2 text-[13px]" style={{ border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.02)' }} data-invite-howto>
            <summary className="cursor-pointer font-semibold text-white">How to — an example</summary>
            <ol className="mt-2 ml-4 list-decimal space-y-1.5" style={muted}>
              <li>Keep one person per line: <b className="text-white">email, first name, last name, mobile</b>. Only the email is required; the mobile is optional.</li>
              <li>From Excel or Google Sheets, select those columns (no header row needed) and copy — or save the sheet as <b className="text-white">.csv</b> and choose it with Upload CSV.</li>
              <li>Paste into the box below. For example:
                <pre className="mt-1.5 rounded-lg px-3 py-2 text-[12px] whitespace-pre-wrap" style={{ background: 'rgba(0,0,0,0.3)', color: '#C4B5FD' }}>{'maria.santos@gmail.com, Maria, Santos, 09171234567\njuan.delacruz@yahoo.com, Juan, Dela Cruz\nana.reyes@gmail.com, Ana, Reyes, 09989876543'}</pre>
              </li>
              <li>Press <b className="text-white">Review invitations</b>. You see who will be invited and any line that cannot be used (a missing or broken email) — fix those or leave them out.</li>
              <li>Press <b className="text-white">Invite</b>. Each person gets their own link, sets their own password, and arrives already approved as {roleWord}. They show under &ldquo;Waiting to be accepted&rdquo; until they join.</li>
            </ol>
          </details>

          <label className="mt-4 flex flex-col items-center justify-center text-center rounded-2xl px-4 py-5 cursor-pointer transition-colors hover:bg-white/[0.02]"
            style={{ border: '1.5px dashed rgba(139,92,246,0.5)', background: 'rgba(124,58,237,0.05)' }}>
            <span className="flex items-center gap-2 text-[16px] font-semibold text-white"><FileText size={20} /> Choose a CSV file</span>
            <span className="text-[13.5px] mt-1" style={muted}>Supports .csv files with email, name and mobile (optional)</span>
            <span className="mt-3 h-10 px-4 rounded-xl inline-flex items-center gap-2 text-[14px] font-semibold" style={{ color: '#C4B5FD', border: '1px solid rgba(139,92,246,0.55)' }}>
              <Upload size={16} /> Upload CSV
            </span>
            <input type="file" accept=".csv,text/csv,text/plain" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); }} />
          </label>

          <div className="flex items-center gap-3 my-4 text-[13.5px]" style={muted}>
            <span className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.08)' }} /> or paste your list
            <span className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.08)' }} />
          </div>
          <textarea aria-label="Paste your list"
            className="w-full rounded-xl px-4 py-3 text-[14.5px] text-white outline-none"
            style={{ ...inputSt, minHeight: 104, resize: 'vertical' }}
            placeholder={'maria@example.com, Maria, Santos, 09171234567\njuan@example.com, Juan, Dela Cruz'}
            value={paste}
            onChange={(e) => { setPaste(e.target.value); setResult(null); setReviewing(false); }} />

          <div className="mt-4 flex items-center gap-3 flex-wrap">
            {!reviewing ? (
              <RdButton variant="primary" icon={Users} disabled={parsed.length === 0} onClick={() => setReviewing(true)}>Review invitations</RdButton>
            ) : (
              <RdButton variant="primary" icon={Send} disabled={usable.length === 0 || importing !== null} onClick={() => void runImport()}>
                {importing ? `Inviting… ${importing.done} of ${importing.total}` : `Invite ${usable.length} ${usable.length === 1 ? 'person' : 'people'}`}
              </RdButton>
            )}
            {paste && <RdButton variant="ghost" icon={X} onClick={() => { setPaste(''); setResult(null); setReviewing(false); }}>Clear</RdButton>}
            <span className="text-[13.5px] inline-flex items-center gap-1.5" style={muted}><Lock size={14} /> Nothing is sent until you review.</span>
          </div>

          {reviewing && parsed.length > 0 && (
            <div className="mt-4 rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }} data-invite-review>
              <p className="text-[14.5px] text-white">
                {usable.length} to invite as {roleWord}{broken.length > 0 && `, ${broken.length} that cannot be used`}
              </p>
              {usable.length > 0 && (
                <ul className="mt-2 flex flex-col gap-1 max-h-40 overflow-y-auto">
                  {usable.slice(0, 50).map((r) => (
                    <li key={r.line} className="text-[13px]" style={muted}>{r.email}{r.firstName ? ` — ${[r.firstName, r.lastName].filter(Boolean).join(' ')}` : ''}</li>
                  ))}
                </ul>
              )}
              {broken.length > 0 && (
                <ul className="mt-2 flex flex-col gap-1">
                  {broken.slice(0, 8).map((r) => <li key={r.line} className="text-[13px]" style={{ color: '#FBBF24' }}>Line {r.line}: {r.problem}</li>)}
                  {broken.length > 8 && <li className="text-[13px]" style={muted}>…and {broken.length - 8} more</li>}
                  <li className="text-[13px] mt-1" style={muted}>The lines that cannot be used are skipped — the rest still go.</li>
                </ul>
              )}
            </div>
          )}

          {result && (
            <div className="mt-4 rounded-xl p-4" style={{ background: 'rgba(124,58,237,0.08)', border: '1px solid rgba(139,92,246,0.45)' }}>
              <p className="text-[14.5px] text-white">{result.invited.length} invited{result.failed.length > 0 && `, ${result.failed.length} refused`}</p>
              {result.failed.length > 0 && (
                <ul className="mt-2 flex flex-col gap-1">
                  {result.failed.slice(0, 10).map((f) => (
                    <li key={f.email} className="text-[13px]" style={muted}><strong className="text-white">{f.email}</strong> — {f.reason}</li>
                  ))}
                </ul>
              )}
              {result.invited.length > 0 && (
                <RdButton className="mt-3" variant="soft" icon={Copy}
                  onClick={() => copy(result.invited.map((i) => `${i.email}\t${inviteLink(i.token)}`).join('\n'), 'bulk')}>
                  {copied === 'bulk' ? 'Copied' : 'Copy every link'}
                </RdButton>
              )}
            </div>
          )}
        </div>
        )}
          </div>
        </RdCard>

      {/* ── The list ── */}
      <RdCard className="overflow-hidden rd-fit-fill" id="waiting" data-invite-list>
        <div className="flex items-center gap-4 px-5 py-3.5 flex-wrap">
          <IconTile icon={Users} size={42} />
          <div className="flex-1 min-w-[220px]">
            <h2 className="text-[20px] font-semibold text-white">{showDone ? 'Every invitation' : 'Waiting to be accepted'}</h2>
            <p className="text-[14px]" style={muted}>Invitations that are pending acceptance. Share the link again or withdraw anytime.</p>
          </div>
          {counts.waiting > 0 && <Pill tone="violet">{counts.waiting} pending</Pill>}
          <button type="button" onClick={() => setShowDone((v) => !v)} className="text-[14.5px] font-semibold inline-flex items-center gap-1.5" style={{ color: '#A78BFA' }}>
            {showDone ? 'Waiting only' : 'View all'} <ArrowRight size={15} />
          </button>
        </div>
        <RdTable boxRef={fit.ref} head={['Email', 'Invited date', 'Expires', 'Role', ...(showDone ? ['State'] : []), { label: 'Actions', align: 'right' }]}
          empty={rows === null ? <p className="py-10 text-center text-[14.5px]" style={muted}>Loading…</p>
            : rows.length === 0 ? <EmptyBlock icon={Mail} title={showDone ? 'Nobody has been invited yet.' : 'Nobody is waiting.'}
                body="Invite one person or a whole list above — each gets their own link." /> : undefined}>
          {paged.visible.map((r) => {
            const soon = r.state === 'waiting' && new Date(r.expires_at).getTime() - nowMs <= 3 * 86_400_000;
            const name = [r.first_name, r.last_name].filter(Boolean).join(' ');
            return (
              <Tr key={r.id} data-invite-row style={{ height: (rows?.length ?? 0) > paged.perPage ? fit.rowHeight : undefined }}>
                <Td>
                  <p className="text-[15px] text-white">{r.email}</p>
                  {name && <p className="text-[13px]" style={muted}>{name}</p>}
                </Td>
                <Td>
                  <p className="whitespace-nowrap">{when(r.created_at)}</p>
                  <p className="text-[13px]" style={muted}>{relDays(r.created_at, nowMs)}</p>
                </Td>
                <Td>
                  {r.state === 'accepted' ? <><p className="whitespace-nowrap">Joined</p><p className="text-[13px]" style={muted}>{when(r.accepted_at!)}</p></>
                    : <><p className="whitespace-nowrap">{when(r.expires_at)}</p><p className="text-[13px]" style={{ color: soon ? '#FBBF24' : 'var(--color-text-secondary)' }}>{r.state === 'waiting' ? relDays(r.expires_at, nowMs) : STATE_LABEL[r.state]}</p></>}
                </Td>
                <Td><Pill tone="gray">{ROLE[r.role]}</Pill></Td>
                {showDone && <Td><Pill tone={STATE_TONE[r.state]}>{STATE_LABEL[r.state]}</Pill></Td>}
                <Td align="right">
                  {r.state === 'waiting' && (
                    <div className="inline-flex items-center gap-1.5 justify-end">
                      {/* Icon buttons with their words as labels and tips — three labelled buttons stacked made every row tall. */}
                      <IconAct label={copied === r.id ? 'Copied' : 'Copy link'} icon={copied === r.id ? CheckCircle2 : Copy} onClick={() => copy(inviteLink(r.token), r.id)} />
                      <IconAct label={mailing === r.id ? 'Sending…' : mailed[r.id] ?? 'Email it'} icon={Mail} disabled={!gym || mailing === r.id} onClick={() => void mail(r)} />
                      <IconAct label="Withdraw" icon={Trash2} danger onClick={() => void withdraw(r)} />
                    </div>
                  )}
                </Td>
              </Tr>
            );
          })}
        </RdTable>
        <TableFooter page={paged.page} perPage={paged.perPage} total={paged.total} noun="invitations" onPage={paged.setPage} />
      </RdCard>
      </div>
    </div>
  );
}

/** A square action with its words as the label and the tip. */
function IconAct({ label, icon: Icon, onClick, disabled, danger }: { label: string; icon: typeof Copy; onClick: () => void; disabled?: boolean; danger?: boolean }) {
  return (
    <button type="button" aria-label={label} data-tip={label} onClick={onClick} disabled={disabled}
      className="w-10 h-10 rounded-xl grid place-items-center transition-colors hover:bg-white/5 disabled:opacity-40"
      style={{ border: '1px solid rgba(255,255,255,0.08)', color: danger ? '#F87171' : '#C4B5FD' }}>
      <Icon size={17} />
    </button>
  );
}
