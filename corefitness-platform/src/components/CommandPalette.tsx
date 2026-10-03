import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import {
  Building2, Clock, CornerDownLeft, DoorOpen, History, Inbox, Layers, LifeBuoy, Megaphone, Plus, Receipt, Search, Wallet,
  type LucideIcon,
} from 'lucide-react';
import {
  listAnnouncements, listApplications, listGyms, listPlatformPlans, listSupportGrants, listTickets, paymentClaims,
  type Application, type PaymentClaim, type PlatformAnnouncement, type PlatformGym, type PlatformPlan,
  type PlatformTicket, type SupportGrant,
} from '../lib/platform';
import { searchEvents, type LoggedEvent } from '../lib/insight';

type Group = 'Recent' | 'Do something' | 'Screens' | 'Gyms' | 'Applications' | 'Payments' | 'Support' | 'Plans' | 'Announcements' | 'Activity log';
interface Hit { key: string; group: Group; icon: LucideIcon; label: string; hint: string; to: string; score: number }

const RECENT_KEY = 'cf-platform-recent-search';
/** Per-viewer convenience only (CLAUDE.md): it may be empty, and the palette works without it. */
const readRecent = (): { label: string; to: string }[] => {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') as { label: string; to: string }[]; } catch { return []; }
};
const remember = (label: string, to: string) => {
  try { localStorage.setItem(RECENT_KEY, JSON.stringify([{ label, to }, ...readRecent().filter((r) => r.to !== to)].slice(0, 6))); } catch { /* private window */ }
};

/** Every word typed must appear somewhere; a match at the start of a word, or of the name, ranks higher. */
function score(q: string, fields: (string | null | undefined)[]): number {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return 1;
  const hay = fields.filter(Boolean).map((f) => (f as string).toLowerCase());
  let total = 0;
  for (const w of words) {
    let best = 0;
    hay.forEach((h, i) => {
      const at = h.indexOf(w);
      if (at < 0) return;
      const s = (at === 0 ? 6 : /[\s\-_./@]/.test(h[at - 1]) ? 4 : 2) + (i === 0 ? 3 : 0);
      best = Math.max(best, s);
    });
    if (!best) return 0;
    total += best;
  }
  return total;
}

function Mark({ text, q }: { text: string; q: string }) {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return <>{text}</>;
  const lower = text.toLowerCase();
  const marks = new Array(text.length).fill(false);
  for (const w of words) { let i = lower.indexOf(w); while (i >= 0) { for (let k = i; k < i + w.length; k++) marks[k] = true; i = lower.indexOf(w, i + 1); } }
  const out: React.ReactNode[] = [];
  let i = 0;
  while (i < text.length) {
    let j = i;
    while (j < text.length && marks[j] === marks[i]) j++;
    out.push(marks[i] ? <mark key={i}>{text.slice(i, j)}</mark> : text.slice(i, j));
    i = j;
  }
  return <>{out}</>;
}

const peso = (n: string | number) => '₱' + Number(n).toLocaleString('en-PH', { maximumFractionDigits: 0 });

/**
 * Ctrl+K (⌘K): find anything on the platform (2026-10-03). Screens and
 * actions; every gym by name, link, plan or state ("overdue", "suspended",
 * "trial"); applications by gym, owner, email, phone, town or plan; payments
 * waiting by reference or gym; support tickets; gyms that opened their doors;
 * plans; announcements — and the activity log, searched in the database as you
 * type. Everything is read when it opens, so it is never stale and costs
 * nothing while closed.
 */
export default function CommandPalette({ pages }: { pages: { path: string; label: string; icon: LucideIcon; lede: string }[] }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const [gyms, setGyms] = useState<PlatformGym[]>([]);
  const [tickets, setTickets] = useState<PlatformTicket[]>([]);
  const [apps, setApps] = useState<Application[]>([]);
  const [claims, setClaims] = useState<PaymentClaim[]>([]);
  const [grants, setGrants] = useState<SupportGrant[]>([]);
  const [plans, setPlans] = useState<PlatformPlan[]>([]);
  const [ann, setAnn] = useState<PlatformAnnouncement[]>([]);
  const [events, setEvents] = useState<LoggedEvent[]>([]);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setOpen((v) => !v); }
      else if (e.key === '/' && !open && !(e.target as HTMLElement)?.closest('input, textarea, select, [contenteditable]')) { e.preventDefault(); setOpen(true); }
    };
    const ask = () => setOpen(true);
    window.addEventListener('keydown', key);
    window.addEventListener('platform:search', ask);
    return () => { window.removeEventListener('keydown', key); window.removeEventListener('platform:search', ask); };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setQ(''); setSel(0); setEvents([]);
    setTimeout(() => input.current?.focus(), 0);
    const quiet = <T,>(p: Promise<T>, set: (v: T) => void) => void p.then(set, () => undefined);
    quiet(listGyms(), setGyms);
    quiet(listTickets(), setTickets);
    quiet(listApplications(), setApps);
    quiet(paymentClaims('pending'), setClaims);
    quiet(listSupportGrants(), setGrants);
    quiet(listPlatformPlans(), setPlans);
    quiet(listAnnouncements(), setAnn);
  }, [open]);

  // The activity log is searched in SQL (0140), after typing settles.
  useEffect(() => {
    if (!open || q.trim().length < 3) { setEvents([]); return; }
    const t = window.setTimeout(() => {
      void searchEvents({ q: q.trim(), limit: 6 }).then(setEvents, () => setEvents([]));
    }, 300);
    return () => window.clearTimeout(t);
  }, [q, open]);

  const hits = useMemo<Hit[]>(() => {
    const s = q.trim();
    const out: Hit[] = [];
    const add = (h: Omit<Hit, 'score'>, fields: (string | null | undefined)[]) => {
      const sc = score(s, fields);
      if (sc > 0) out.push({ ...h, score: sc });
    };

    if (!s) {
      readRecent().forEach((r, i) => out.push({ key: 'r' + r.to, group: 'Recent', icon: Clock, label: r.label, hint: 'Opened recently', to: r.to, score: 100 - i }));
    }
    const actions: [string, string, string, LucideIcon][] = [
      ['Record a payment from a gym', '/money', 'record pay money gcash bank receipt', Receipt],
      ['Verify payments gyms sent', '/money', 'verify claim reference gcash proof screenshot', Wallet],
      ['Answer gyms asking to join', '/applications', 'approve let in application applicant', Inbox],
      ['Add or change a plan', '/plans', 'new plan price tier premium standard', Plus],
      ['Send an announcement to gyms', '/announcements', 'banner message tell gyms', Megaphone],
      ['Set how gyms pay you (GCash, bank, QR)', '/settings', 'gcash maya bank qr payment method settings', Wallet],
      ['See check-ins by gym and day', '/overview', 'checkins attendance visits', History],
      ['See AI usage and cost', '/usage', 'ai coach assistant claude tokens cost', Layers],
    ];
    for (const [label, to, words, icon] of actions) add({ key: 'a' + label, group: 'Do something', icon, label, hint: 'Action', to }, [label, words]);
    for (const p of pages) add({ key: 'p' + p.path, group: 'Screens', icon: p.icon, label: p.label, hint: p.lede, to: p.path }, [p.label, p.lede]);
    if (s) {
      for (const g of gyms) {
        const state = g.lock_reason === 'suspended' ? 'suspended' : g.lock_reason === 'overdue' ? 'overdue read-only'
          : g.days_left !== null && g.days_left < 0 ? 'overdue' : g.owners === 0 ? 'no owner unclaimed' : !g.onboarded ? 'not set up' : 'live active';
        add({ key: 'g' + g.id, group: 'Gyms', icon: Building2, label: g.name,
          hint: `${g.plan_name ?? g.plan} · ${g.members} member${g.members === 1 ? '' : 's'} · ${state.split(' ')[0]}`, to: `/gyms/${g.id}` },
          [g.name, g.slug, g.plan, g.plan_name, state]);
      }
      for (const a of apps) add({ key: 'ap' + a.id, group: 'Applications', icon: Inbox, label: a.gym_name,
        hint: `${a.status === 'pending' ? 'Waiting' : a.status === 'approved' ? 'Let in' : 'Turned down'} · ${a.owner_name} · ${a.email}`, to: '/applications' },
        [a.gym_name, a.owner_name, a.email, a.phone, a.address, a.plan_name, a.heard_from, a.status]);
      for (const c of claims) add({ key: 'c' + c.id, group: 'Payments', icon: Wallet, label: `${c.gym_name}: ${peso(c.amount)} by ${c.method_label}`,
        hint: `Ref ${c.reference} · waiting to be verified`, to: '/money' }, [c.reference, c.gym_name, c.method_label, 'payment verify']);
      for (const t of tickets) add({ key: 't' + t.id, group: 'Support', icon: LifeBuoy, label: t.subject,
        hint: `${t.gym_name} · ${t.status}${t.last_from === 'gym' && t.status !== 'closed' ? ' · waiting for you' : ''}`, to: '/support' },
        [t.subject, t.gym_name, t.opened_by_name, t.status]);
      for (const g of grants) add({ key: 'sg' + g.id, group: 'Support', icon: DoorOpen, label: `Look inside ${g.gym_name}`,
        hint: g.reason ? `Support access: “${g.reason}”` : 'Support access is open', to: `/support-access/${g.gym_id}` },
        [g.gym_name, g.reason, 'support access look inside']);
      for (const p of plans) add({ key: 'pl' + p.key, group: 'Plans', icon: Layers, label: p.name,
        hint: p.price_monthly === null ? 'No price yet' : `${peso(p.price_monthly)} a month`, to: '/plans' }, [p.name, p.key, p.blurb]);
      for (const a of ann) add({ key: 'an' + a.id, group: 'Announcements', icon: Megaphone, label: a.title,
        hint: a.live ? 'Live now' : 'Ended', to: '/announcements' }, [a.title, a.body]);
      for (const e of events) out.push({ key: 'e' + e.id, group: 'Activity log', icon: History, label: e.summary,
        hint: `${e.gym_name ?? 'The platform'} · ${new Date(e.created_at).toLocaleDateString('en-PH', { day: 'numeric', month: 'short' })}`,
        to: '/activity', score: 1 });
    }
    const ORDER: Group[] = ['Recent', 'Do something', 'Gyms', 'Applications', 'Payments', 'Support', 'Screens', 'Plans', 'Announcements', 'Activity log'];
    const LIMIT: Partial<Record<Group, number>> = { 'Do something': s ? 4 : 3, Screens: s ? 5 : 13, Gyms: 8, Applications: 5, Support: 5, Payments: 5 };
    return ORDER.flatMap((g) => out.filter((h) => h.group === g).sort((a, b) => b.score - a.score).slice(0, LIMIT[g] ?? 6));
  }, [q, pages, gyms, tickets, apps, claims, grants, plans, ann, events]);

  useEffect(() => {
    list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [sel]);

  const go = (h: Hit | undefined) => {
    if (!h) return;
    remember(h.label, h.to);
    setOpen(false);
    navigate(h.to);
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') setOpen(false);
    else if (e.key === 'ArrowDown') { e.preventDefault(); setSel((i) => Math.min(hits.length - 1, i + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((i) => Math.max(0, i - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); go(hits[sel]); }
  };

  if (!open) return null;
  return createPortal((
    <div className="palette-shade" onMouseDown={() => setOpen(false)}>
      <div className="palette" role="dialog" aria-label="Search" onMouseDown={(e) => e.stopPropagation()}>
        <label className="search palette-input">
          <Search size={16} />
          <input ref={input} autoFocus value={q} placeholder="Search gyms, applicants, payments, tickets, the log — or type what you want to do"
            aria-label="Search everything" onChange={(e) => { setQ(e.target.value); setSel(0); }} onKeyDown={onKey} />
        </label>
        <div className="palette-list" role="listbox" ref={list}>
          {hits.length === 0 && <p className="empty">Nothing matches “{q}”. Try a gym's name, an email, a GCash reference or a word like “overdue”.</p>}
          {hits.map((h, i) => {
            const Icon = h.icon;
            return (
              <div key={h.key} style={{ display: 'contents' }}>
                {(i === 0 || hits[i - 1].group !== h.group) && <div className="palette-group">{h.group}</div>}
                <button type="button" role="option" aria-selected={i === sel} className={`palette-hit${i === sel ? ' on' : ''}`}
                  onMouseEnter={() => setSel(i)} onClick={() => go(h)}>
                  <Icon size={16} />
                  <span className="palette-label"><Mark text={h.label} q={q} /></span>
                  <span className="palette-hint">{h.hint}</span>
                  {i === sel && <CornerDownLeft size={14} />}
                </button>
              </div>
            );
          })}
        </div>
        <div className="palette-foot">
          <span><kbd>↑</kbd><kbd>↓</kbd>move</span><span><kbd>Enter</kbd>open</span><span><kbd>Esc</kbd>close</span>
          <span style={{ marginLeft: 'auto' }}><kbd>Ctrl K</kbd> or <kbd>/</kbd> anywhere</span>
        </div>
      </div>
    </div>
  ), document.body);
}
