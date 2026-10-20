import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { HeartHandshake, MessageCircleHeart, Download, Search, MessageCircle, Phone, PhoneCall, Send, LineChart, Pencil, Info, Check } from 'lucide-react';
import Modal from '../components/ui/Modal';
import { Av, Pager } from './attendance/parts';
import './attendance/att.css';
import { useBranding } from '../hooks/useBranding';
import { usePaged } from '../hooks/usePaged';
import { useFitRows } from '../hooks/useFitRows';
import { showToast } from '../utils/toast';
import { exportToCSV } from '../utils/exportUtils';
import { supabase } from '../lib/supabaseClient';
import {
  retentionRadar, sendRetentionMessage, winbackSweep, winbackRules, winbackResults, saveWinbackRule, logRetentionCall, lastContacts,
  type AtRisk, type Contact, type WinbackKey, type WinbackResult, type WinbackRule,
} from '../lib/api/retention';

const WHEN: Record<WinbackKey, [string, string]> = {
  no_visit_14: ['No visit in 14 days', 'To a member whose last visit was 14–30 days ago. Once a month at most.'],
  no_visit_30: ['No visit in 30 days', 'To a paying member who missed the first nudge — no visit in 30+ days.'],
  lapsed: ['Plan lapsed', 'To someone whose membership ended in the last 14 days and did not renew.'],
};
const CHIPS = [['all', 'All'], ['high', 'High risk'], ['gone30', 'No visit 30+ days'], ['ending', 'Plan ending'], ['fresh', 'Not contacted']] as const;
type Chip = typeof CHIPS[number][0];
const MONTH = (i: number) => new Date(2000, i, 1).toLocaleDateString('en-PH', { month: 'short' });
const dayWord = (iso: string) => new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
const gone = (r: AtRisk) => { const m = r.reasons.find((x) => /^No visit in \d+ days/.test(x)); return m ? Number(m.match(/\d+/)![0]) : 0; };

/**
 * Retention (2026-10-20, the approved mock-up): who the radar (0130, computed in
 * SQL from check-ins, bookings, the workout log and the membership) thinks is
 * slipping, why, and how they were last reached — a desk message, a logged call
 * (0205) or an automatic win-back. "Automatic messages" is the old Win-back
 * messages page as a tab; /retention/messages still opens it.
 */
export default function Retention() {
  const branding = useBranding();
  const navigate = useNavigate();
  const location = useLocation();
  const view: 'who' | 'msgs' = location.pathname.endsWith('/messages') ? 'msgs' : 'who';

  const [radar, setRadar] = useState<AtRisk[] | undefined | null>(null);
  const [contacts, setContacts] = useState<Map<string, Contact>>(new Map());
  const [rules, setRules] = useState<WinbackRule[] | null>(null);
  const [results, setResults] = useState<WinbackResult[]>([]);
  const [visits, setVisits] = useState<{ member_id: string; check_in_time: string }[] | null>(null);
  const [activeCount, setActiveCount] = useState<number | null>(null);
  const [chip, setChip] = useState<Chip>('all');
  const [q, setQ] = useState('');
  const [who, setWho] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [calling, setCalling] = useState<AtRisk | null>(null);
  const [callNote, setCallNote] = useState('');
  const [editing, setEditing] = useState<Record<string, { title: string; message: string }>>({});
  const [busy, setBusy] = useState(false);
  const [now] = useState(() => Date.now());

  const load = async () => {
    // Sends any switched-on win-back messages that are due (0130), then reads.
    await winbackSweep();
    const [r, ru, res] = await Promise.all([retentionRadar(), winbackRules(), winbackResults()]);
    setRadar(r); setRules(ru); setResults(res);
    if (r) setContacts(await lastContacts(r.map((x) => x.memberId)));
  };
  useEffect(() => {
    void (async () => {
      await load();
      const since = new Date(now); since.setMonth(since.getMonth() - 5, 1); since.setHours(0, 0, 0, 0);
      const [a, p] = await Promise.all([
        supabase.from('attendance').select('member_id, check_in_time').gte('check_in_time', since.toISOString()),
        supabase.from('gym_people').select('id', { count: 'exact', head: true }).eq('role', 'member').eq('status', 'active'),
      ]);
      setVisits(a.error ? [] : (a.data ?? []));
      setActiveCount(p.error ? null : p.count ?? 0);
    })();
  }, [now]);

  /** Who visited in each calendar month (local), from the last six months of check-ins. */
  const byMonth = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const v of visits ?? []) {
      const d = new Date(v.check_in_time); const k = `${d.getFullYear()}-${d.getMonth()}`;
      if (!m.has(k)) m.set(k, new Set()); m.get(k)!.add(v.member_id);
    }
    return m;
  }, [visits]);
  const monthKey = (back: number) => { const d = new Date(now); d.setMonth(d.getMonth() - back, 1); return { k: `${d.getFullYear()}-${d.getMonth()}`, i: d.getMonth() }; };
  /** Of last month's visitors, the share who came this month — and the same for the three months before. */
  const stillComing = [3, 2, 1, 0].map((back) => {
    const prev = byMonth.get(monthKey(back + 1).k) ?? new Set<string>();
    const cur = byMonth.get(monthKey(back).k) ?? new Set<string>();
    const kept = [...prev].filter((x) => cur.has(x)).length;
    return { i: monthKey(back).i, rate: prev.size ? Math.round((kept / prev.size) * 100) : null, kept, of: prev.size };
  });
  const thisMonth = stillComing[3];
  /** At least one visit in each of the last four weeks; and the four weeks before, for the change. */
  const weekly = (offset: number) => {
    const per = new Map<string, Set<number>>();
    for (const v of visits ?? []) {
      const ago = Math.floor((now - new Date(v.check_in_time).getTime()) / (7 * 86400000)) - offset;
      if (ago < 0 || ago > 3) continue;
      if (!per.has(v.member_id)) per.set(v.member_id, new Set()); per.get(v.member_id)!.add(ago);
    }
    return [...per.values()].filter((s) => s.size === 4).length;
  };
  const everyWeek = weekly(0); const everyWeekBefore = weekly(4);
  const slipping = (radar ?? []).filter((r) => gone(r) >= 14).length;
  const messaged = results.reduce((s, r) => s + r.sent, 0);
  const cameBack = results.reduce((s, r) => s + r.cameBack, 0);

  const counts: Record<Chip, number> = {
    all: radar?.length ?? 0,
    high: (radar ?? []).filter((r) => r.level === 'high').length,
    gone30: (radar ?? []).filter((r) => gone(r) >= 30).length,
    ending: (radar ?? []).filter((r) => r.reasons.some((x) => x.startsWith('Membership ends'))).length,
    fresh: (radar ?? []).filter((r) => !contacts.has(r.memberId)).length,
  };
  const listed = (radar ?? []).filter((r) => (chip === 'all' || (chip === 'high' && r.level === 'high') || (chip === 'gone30' && gone(r) >= 30)
      || (chip === 'ending' && r.reasons.some((x) => x.startsWith('Membership ends'))) || (chip === 'fresh' && !contacts.has(r.memberId)))
    && (!q.trim() || r.name.toLowerCase().includes(q.trim().toLowerCase())));
  const { ref: fitRef, perPage } = useFitRows(6);
  const paged = usePaged(listed, perPage);
  const picked = (radar ?? []).find((r) => r.memberId === who) ?? (radar ?? [])[0] ?? null;

  /** Ready-made words built from the reasons the member is listed — never a promise the gym has not made. */
  const templates = (r: AtRisk): [string, string][] => {
    const first = r.name.split(' ')[0];
    const out: [string, string][] = [['We miss you', `Hi ${first}! We haven't seen you at ${branding.name} in a while — your spot is still here. Come by this week?`]];
    const ending = r.reasons.find((x) => x.startsWith('Membership ends'));
    if (ending) out.push(['Plan ending', `Hi ${first}, ${ending.replace('Membership ends', 'your membership ends')}. Renew at the front desk or in the app to keep your spot.`]);
    out.push(['Need help?', `Hi ${first}, is anything getting in the way of training? Tell us at the desk or reply in the app — we can help.`]);
    return out;
  };
  const pick = (r: AtRisk) => { setWho(r.memberId); setDraft(templates(r)[0][1]); };
  const text = picked && who === picked.memberId ? draft : picked ? templates(picked)[0][1] : '';

  const send = async () => {
    if (!picked || !text.trim()) return;
    setSending(true);
    try {
      await sendRetentionMessage(picked.memberId, text);
      showToast(`Message sent to ${picked.name}`, 'success');
      setContacts(await lastContacts((radar ?? []).map((x) => x.memberId)));
    } catch (err) {
      showToast(err instanceof Error ? err.message : `Could not message ${picked.name}`, 'error');
    } finally {
      setSending(false);
    }
  };
  const markCalled = async () => {
    if (!calling) return;
    try {
      await logRetentionCall(calling.memberId, callNote);
      showToast(`Call to ${calling.name} logged`, 'success');
      setCalling(null); setCallNote('');
      setContacts(await lastContacts((radar ?? []).map((x) => x.memberId)));
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not log that call', 'error');
    }
  };
  const saveRule = async (key: WinbackKey, patch: { title?: string; message?: string; isActive?: boolean }, ok: string) => {
    setBusy(true);
    try {
      await saveWinbackRule(key, patch);
      showToast(ok, 'success');
      setEditing((e) => { const n = { ...e }; delete n[key]; return n; });
      const [ru, res] = await Promise.all([winbackRules(), winbackResults()]);
      setRules(ru); setResults(res);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'That could not be saved', 'error');
    } finally {
      setBusy(false);
    }
  };
  const exportList = () => exportToCSV(listed.map((r) => ({
    Member: r.name, Phone: r.phone ?? '', Risk: r.score, Level: r.level, Why: r.reasons.join('; '),
    'Last visit': r.lastVisit ? r.lastVisit.slice(0, 10) : '', 'Last contact': contacts.get(r.memberId)?.at.slice(0, 10) ?? '',
  })), 'win-back-list');

  const contactWord = (c?: Contact) => !c ? 'never' : `${dayWord(c.at)} · ${c.how === 'automatic' ? 'automatic' : c.how}`;
  const onCount = (rules ?? []).filter((r) => r.isActive).length;

  return (
    <div className="att" data-retention>
      <div className="a-head">
        <div className="min-w-0"><h1>Retention</h1><p>Who is slipping away, why — and the messages that bring them back</p></div>
        <nav className="a-tabs" aria-label="Retention views" data-rd-tabs style={{ marginLeft: 'auto' }}>
          <button type="button" className={view === 'who' ? 'on' : ''} onClick={() => navigate('/retention')}><HeartHandshake size={14} />Who to win back <em>{radar?.length ?? 0}</em></button>
          <button type="button" className={view === 'msgs' ? 'on' : ''} onClick={() => navigate('/retention/messages')} data-view="msgs"><MessageCircleHeart size={14} />Automatic messages <em>{onCount} on</em></button>
        </nav>
        {view === 'who' && <button type="button" className="a-btn" onClick={exportList} disabled={!listed.length}><Download size={15} />Export list</button>}
      </div>

      <div className="a-grid" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', flex: 'none' }} data-retention-tiles>
        <div className="a-card" style={{ padding: '12px 14px' }}>
          <div className="a-lbl">Still coming</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}><div className="a-num">{thisMonth.rate == null ? '—' : `${thisMonth.rate}%`}</div>
            <span className="a-sub">{thisMonth.of ? `${thisMonth.kept} of last month's ${thisMonth.of} visitors came this month` : 'nobody visited last month'}</span></div>
        </div>
        <div className="a-card" style={{ padding: '12px 14px' }}>
          <div className="a-lbl">Come every week</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}><div className="a-num">{visits ? everyWeek : '…'}</div>
            <span className="a-sub">{activeCount != null ? `of ${activeCount}` : ''}{visits && everyWeek !== everyWeekBefore ? <> · <span className={everyWeek > everyWeekBefore ? 'a-up' : 'a-dn'}>{everyWeek > everyWeekBefore ? '▲' : '▼'} {Math.abs(everyWeek - everyWeekBefore)}</span></> : ''} · each of the last 4 weeks</span></div>
        </div>
        <div className="a-card" style={{ padding: '12px 14px', borderColor: slipping ? '#3e310f' : undefined }}>
          <div className="a-lbl" style={{ color: slipping ? 'var(--a-a300)' : undefined }}>Slipping</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}><div className="a-num">{radar ? slipping : '…'}</div><span className="a-sub">no visit in 14+ days</span></div>
        </div>
        <div className="a-card" style={{ padding: '12px 14px' }}>
          <div className="a-lbl">Came back after a message</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}><div className="a-num">{cameBack}</div>
            <span className="a-sub">{messaged ? `of ${messaged} messaged in 30 days · visited within 2 weeks` : 'nobody messaged in 30 days'}</span></div>
        </div>
      </div>

      {radar === undefined && <div className="a-hint" style={{ flex: 'none' }}><Info size={14} /><span>The retention radar needs migration 0130.</span></div>}

      {view === 'who' && (
        <div className="a-grid" style={{ gridTemplateColumns: 'minmax(0, 1fr) 330px', flex: 1 }}>
          <div className="a-card" data-winback-list>
            <div className="a-ct" style={{ flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {CHIPS.map(([k, l]) => <button key={k} type="button" className={`a-chip ${chip === k ? 'v' : ''}`} onClick={() => setChip(k)} data-chip={k}>{l} <em>{counts[k]}</em></button>)}
              </div>
              <label className="a-input" style={{ padding: '6px 10px', fontSize: 12, width: 180 }}><Search size={14} />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a member…" aria-label="Find a member" /></label>
            </div>
            <div ref={fitRef} className="a-scroll grow" data-rd-table>
              {radar === null ? <p className="a-sub" style={{ padding: '10px 0' }}>Loading…</p> : listed.length === 0 ? <p className="a-sub" style={{ padding: '10px 0' }}>{radar?.length ? 'Nobody matches.' : 'Nobody is slipping right now.'}</p> : (
                <table className="a-table">
                  <thead><tr><th>Member</th><th>Why we think so</th><th>Risk</th><th>Last contact</th><th /></tr></thead>
                  <tbody>
                    {paged.visible.map((r) => {
                      const c = contacts.get(r.memberId);
                      const recent = c && now - new Date(c.at).getTime() < 7 * 86400000;
                      return (
                        <tr key={r.memberId} data-winback-row style={{ background: picked?.memberId === r.memberId && who ? '#ffffff06' : undefined }}>
                          <td><div className="a-who"><Av name={r.name} photo={r.photoUrl} small /><div className="min-w-0"><b>{r.name}</b><div className="a-sub">{r.lastVisit ? `last in ${dayWord(r.lastVisit)}` : 'never checked in'}</div></div></div></td>
                          <td>{r.reasons.map((x, i) => <span key={x} className={`a-why ${i === 0 ? 'a' : ''}`}>{x}</span>)}</td>
                          <td><div className="a-risk" data-tip={`${r.score} of 100 — ${r.level} risk`}>{[20, 40, 60, 80, 100].map((s) => <i key={s} className={r.score >= s - 10 ? 'on' : ''} />)}</div></td>
                          <td className="a-sub" data-tip={c?.note ?? undefined}>{contactWord(c)}{c?.note ? ' · note' : ''}</td>
                          <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                            <button type="button" className={`a-btn sm ${recent ? '' : 'amber'}`} onClick={() => pick(r)}><MessageCircle size={13} />Message</button>{' '}
                            <button type="button" className="a-btn sm" onClick={() => { setCalling(r); setCallNote(''); }} data-mark-called>Mark called</button>{' '}
                            {r.phone ? <a className="a-btn ghost sm" href={`tel:${r.phone.replace(/[^\d+]/g, '')}`} aria-label={`Call ${r.name}`} data-tip={r.phone}><Phone size={13} /></a>
                              : <button type="button" className="a-btn ghost sm" disabled aria-label="No phone on file" data-tip="No phone on file"><Phone size={13} /></button>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 8, gap: 8 }}>
              <span className="a-sub">{listed.length ? `${(paged.page - 1) * paged.perPage + 1}–${Math.min(paged.total, paged.page * paged.perPage)} of ${paged.total} · ` : ''}reasons come from check-ins, bookings, the workout log and the membership — never a guess</span>
              <Pager page={paged.page} pages={paged.totalPages} onPage={paged.setPage} />
            </div>
          </div>

          <div className="a-grid" style={{ alignContent: 'start', overflowY: 'auto' }}>
            <div className="a-card glow" data-message-card>
              <div className="a-ct"><h3><MessageCircle size={16} />{picked ? `Message ${picked.name.split(' ')[0]}` : 'Message'}</h3><small>in the app</small></div>
              {!picked ? <p className="a-sub">Nobody to message — the list is empty.</p> : (<>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                  {templates(picked).map(([l, t]) => <button key={l} type="button" className={`a-chip ${text === t ? 'v' : ''}`} onClick={() => { setWho(picked.memberId); setDraft(t); }}>{l}</button>)}
                </div>
                <textarea className="a-bubble" rows={4} maxLength={300} value={text} onChange={(e) => { setWho(picked.memberId); setDraft(e.target.value); }} aria-label="Message"
                  style={{ width: '100%', resize: 'none', outline: 'none', font: 'inherit', fontSize: 12 }} />
                <button type="button" className="a-btn amber" style={{ marginTop: 10 }} disabled={sending || !text.trim()} onClick={() => void send()} data-send-winback>
                  <Send size={15} />Send to {picked.name.split(' ')[0]}</button>
                <div className="a-sub" style={{ marginTop: 6 }}>Logged as contact, so the desk sees it and nobody messages them twice.</div>
              </>)}
            </div>
            <div className="a-card" data-still-coming>
              <div className="a-ct"><h3><LineChart size={16} />Still coming, by month</h3></div>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 110 }}>
                {stillComing.map((m, i) => (
                  <div key={m.i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, justifyContent: 'flex-end', height: '100%' }}
                    data-tip={m.rate == null ? 'Nobody visited the month before' : `${m.kept} of ${m.of} came back (${m.rate}%)`}>
                    {m.rate != null && <small className="a-sub" style={{ fontSize: 10 }}>{m.rate}%</small>}
                    <span style={{ width: '100%', height: `${m.rate ?? 0}%`, minHeight: m.rate ? 3 : 0, background: i === 3 ? 'var(--a-p400)' : '#2e2552', borderRadius: 5 }} />
                    <small className="a-sub" style={{ color: i === 3 ? 'var(--a-p300)' : undefined }}>{MONTH(m.i)}</small>
                  </div>
                ))}
              </div>
              <div className="a-sub" style={{ marginTop: 6 }}>Share of each month's visitors who checked in the next month.</div>
            </div>
          </div>
        </div>
      )}

      {view === 'msgs' && (
        <div className="a-grid" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', flex: 1, alignContent: 'start' }} data-winback-rules>
          {rules === null && <p className="a-sub">Loading…</p>}
          {rules?.length === 0 && <p className="a-sub">Win-back messages are not switched on yet — paste migration 0130.</p>}
          {rules?.map((r) => {
            const e = editing[r.key];
            const res = results.find((x) => x.ruleKey === r.key);
            return (
              <div key={r.key} className="a-card" style={{ gap: 8, borderColor: r.isActive ? '#3b2f6b' : undefined }} data-rule={r.key}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <b>{WHEN[r.key][0]}</b>
                  <button type="button" className={`a-toggle ${r.isActive ? '' : 'off'}`} disabled={busy} aria-pressed={r.isActive} aria-label={`Send "${r.title}" automatically`}
                    onClick={() => void saveRule(r.key, { isActive: !r.isActive }, r.isActive ? `"${r.title}" is off` : `"${r.title}" is on`)} />
                </div>
                <div className="a-sub">{WHEN[r.key][1]}</div>
                {e ? (<>
                  <input className="a-in" value={e.title} maxLength={80} aria-label={`Title of ${r.key}`} onChange={(ev) => setEditing({ ...editing, [r.key]: { ...e, title: ev.target.value } })} />
                  <textarea className="a-in" rows={3} value={e.message} maxLength={300} aria-label={`Text of ${r.key}`} onChange={(ev) => setEditing({ ...editing, [r.key]: { ...e, message: ev.target.value } })} />
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button type="button" className="a-btn violet sm" disabled={busy || !e.title.trim() || !e.message.trim()} onClick={() => void saveRule(r.key, { title: e.title, message: e.message }, 'Wording saved')}><Check size={13} />Save wording</button>
                    <button type="button" className="a-btn ghost sm" onClick={() => setEditing((x) => { const n = { ...x }; delete n[r.key]; return n; })}>Cancel</button>
                  </div>
                </>) : (<>
                  <div className="a-bubble" style={{ opacity: r.isActive ? 1 : 0.6 }}><b style={{ display: 'block', marginBottom: 2 }}>{r.title}</b>{r.message}</div>
                  <div className="a-sub">{!r.isActive && !res ? 'off · nothing sent' : res ? <><b style={{ color: '#fff' }}>{res.sent} sent</b> in 30 days · <span className="a-up">{res.cameBack} came back within 2 weeks</span></> : 'on · nobody it fits yet this month'}</div>
                  <button type="button" className="a-btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => setEditing({ ...editing, [r.key]: { title: r.title, message: r.message } })}><Pencil size={13} />Edit message</button>
                </>)}
              </div>
            );
          })}
          <div className="a-hint" style={{ gridColumn: '1 / -1' }}><Info size={14} />
            <span>Automatic messages go out in the app, at most one a month per member across all three, never to someone who visited this week, and not in a month the desk already called them — so nobody is nagged. Only the owner changes them. “Came back” means they checked in within two weeks of the message. The 7-, 3- and 1-day “membership ending” reminders are separate and always sent.</span></div>
        </div>
      )}

      <Modal isOpen={!!calling} onClose={() => setCalling(null)} title={calling ? `Log a call to ${calling.name}` : 'Log a call'}
        subtitle="Recorded as contact, so the desk sees it and the app holds back its automatic message this month."
        footer={<>
          <button type="button" className="px-4 py-2 rounded-lg text-[13px]" style={{ color: 'var(--color-text-secondary)' }} onClick={() => setCalling(null)}>Cancel</button>
          <button type="button" className="px-4 py-2 rounded-lg text-[13px] font-semibold text-white" style={{ background: 'var(--color-primary)' }} onClick={() => void markCalled()} data-log-call><PhoneCall size={14} className="inline mr-1.5" />Log the call</button>
        </>}>
        <label className="block text-[13px] mb-1.5" style={{ color: 'var(--color-text-secondary)' }} htmlFor="call-note">What they said <span style={{ color: 'var(--color-text-muted)' }}>— optional</span></label>
        <textarea id="call-note" rows={3} maxLength={200} value={callNote} onChange={(e) => setCallNote(e.target.value)} placeholder="e.g. Back on Thursday, was sick"
          className="w-full px-3 py-2 rounded-lg text-[13px] text-white outline-none" style={{ background: 'var(--color-surface-high)', border: '1px solid var(--color-border)' }} />
      </Modal>
    </div>
  );
}
