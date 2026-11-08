import { useState } from 'react';
import { Send } from 'lucide-react';
import Modal from './Modal';
import { supabase } from '../lib/supabaseClient';

/**
 * Core Fitness writes to a gym's owner (0240, the owner's ask 2026-11-08): it lands in the owner's bell and
 * Notifications in the admin app, with a phone push — the road a gym's win-back message takes to a member.
 *
 * The templates are starting words, never numbers of their own: an at-risk gym's template quotes the reasons the
 * health score already shows (`reasons`), and every word can be changed before it is sent.
 */
interface Template { key: string; label: string; title: string; body: (gym: string, reasons: string[]) => string }

const TEMPLATES: Template[] = [
  { key: 'check_in', label: 'Checking in', title: 'How is it going at your gym?',
    body: (gym, reasons) => `Hi! This is Core Fitness. We noticed a few things at ${gym}${reasons.length ? `: ${reasons.join('; ').toLowerCase()}` : ''}. `
      + 'Is everything all right? If something is getting in the way, reply from Help in your app and we will sort it out with you.' },
  { key: 'payment', label: 'Payment due', title: 'Your Core Fitness plan is due',
    body: (gym) => `Hi! Your Core Fitness plan for ${gym} is due. You can pay from Your plan in the app. `
      + 'If you need more time or have a question about the bill, reply from Help and we will work it out.' },
  { key: 'setup', label: 'Help setting up', title: 'Need a hand setting up?',
    body: (gym) => `Hi! We saw ${gym} has not been very active in the app yet. We are happy to walk you through `
      + 'adding members, check-ins and your plans. Reply from Help and tell us when suits you.' },
  { key: 'blank', label: 'Write my own', title: '', body: () => '' },
];

export default function MessageOwner({ open, onClose, gymId, gymName, reasons = [], onSent }: {
  open: boolean; onClose: () => void; gymId: string; gymName: string; reasons?: string[]; onSent?: (n: number) => void;
}) {
  const [tpl, setTpl] = useState(TEMPLATES[0].key);
  const [title, setTitle] = useState(TEMPLATES[0].title);
  const [body, setBody] = useState(TEMPLATES[0].body(gymName, reasons));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pick = (key: string) => {
    const t = TEMPLATES.find((x) => x.key === key)!;
    setTpl(key); setTitle(t.title); setBody(t.body(gymName, reasons)); setError(null);
  };

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    const { data, error: err } = await supabase.rpc('platform_message_gym', {
      p_gym: gymId, p_title: title.trim(), p_body: body.trim(), p_reason: tpl === 'blank' ? null : tpl,
    });
    setBusy(false);
    if (err) {
      setError(/platform_message_gym|function .* does not exist|schema cache/i.test(err.message)
        ? 'Messages to owners need migration 0240 — paste it in the Supabase SQL editor first.' : err.message);
      return;
    }
    onSent?.(Number(data) || 0);
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} size="md" label="Write to the owner" title={`Write to the owner of ${gymName}`}
      subtitle="It lands in their bell and Notifications in the admin app, with a push to their phone.">
      <form className="msg-owner" onSubmit={send} data-message-owner>
        <div className="chips" role="radiogroup" aria-label="Start from">
          {TEMPLATES.map((t) => (
            <button key={t.key} type="button" role="radio" aria-checked={tpl === t.key} className={`chip${tpl === t.key ? ' on' : ''}`} onClick={() => pick(t.key)}>{t.label}</button>
          ))}
        </div>
        {reasons.length > 0 && (
          <p className="meta">Why it is at risk: {reasons.join(' · ')}</p>
        )}
        <label className="field">
          <span>Title</span>
          <input value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} placeholder="What it is about" required />
        </label>
        <label className="field">
          <span>Message <em className="muted">{body.length}/2000</em></span>
          <textarea value={body} maxLength={2000} rows={7} onChange={(e) => setBody(e.target.value)} placeholder="Write as you would to them in person." required />
        </label>
        {error && <p className="err">{error}</p>}
        <div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn" disabled={busy || title.trim().length < 3 || body.trim().length < 10}>
            <Send size={14} /> {busy ? 'Sending…' : 'Send to the owner'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
