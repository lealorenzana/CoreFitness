import { useCallback, useEffect, useState } from 'react';
import { Check, Eye, EyeOff, Plus, QrCode, Smartphone, Trash2 } from 'lucide-react';
import Button from './ui/Button';
import { showToast } from '../utils/toast';
import { getGymModules, setGymModule, type GymModule } from '../lib/api/gymApp';
import { refreshGymModules } from '../hooks/useGymModules';
import {
  deleteGymPaymentMethod, KIND_LABEL, listGymPaymentMethods, saveGymPaymentMethod,
  type GymPaymentMethod, type PayKind,
} from '../lib/api/gymPayments';
import { shrinkImage } from '../lib/image';

type Draft = Omit<GymPaymentMethod, 'id'> & { id?: string | null };
const blank = (sort: number): Draft => ({
  kind: 'gcash', label: 'GCash', account_name: '', account_number: '', qr_image: null,
  instructions: '', sort_order: sort, active: true,
});

/**
 * Settings → Online payments (0167, owner only).
 *
 * The switch is the gym's own `online_pay` module — the same one Your app →
 * What you run shows — so the two can never disagree. Off: members see only
 * "pay at the front desk". On: members choosing a plan can pay into one of the
 * accounts below and send the reference and a screenshot; the desk confirms
 * each one under Payments → Coming to renew. The money goes to the gym's own
 * account; Core Fitness never touches it.
 */
export default function OnlinePaymentsTab() {
  const [module, setModule] = useState<GymModule | null | undefined>(undefined);
  const [methods, setMethods] = useState<GymPaymentMethod[] | null | undefined>(undefined);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [mods, list] = await Promise.all([getGymModules(), listGymPaymentMethods()]);
    setModule(mods.find((m) => m.feature_key === 'online_pay') ?? null);
    setMethods(list);
  }, []);
  useEffect(() => { void (async () => { await load(); })(); }, [load]);

  const toggle = async () => {
    if (!module || module.state === 'not_sold' || module.state === 'parent_off') return;
    try {
      await setGymModule('online_pay', !module.enabled);
      refreshGymModules();
      await load();
      showToast(module.enabled ? 'Members now pay at the front desk only.' : 'Members can now pay online.', 'success');
    } catch (e) { showToast(e instanceof Error ? e.message : 'That could not be saved', 'error'); }
  };

  const save = async () => {
    if (!draft) return;
    if (draft.label.trim().length < 2) { showToast('Give it a name members will recognise, like "GCash".', 'error'); return; }
    if (!draft.account_number?.trim() && !draft.qr_image) { showToast('Add the account number, a QR code, or both.', 'error'); return; }
    setBusy(true);
    try {
      await saveGymPaymentMethod(draft);
      setDraft(null);
      await load();
      showToast('Saved.', 'success');
    } catch (e) { showToast(e instanceof Error ? e.message : 'That could not be saved', 'error'); }
    finally { setBusy(false); }
  };

  const remove = async (m: GymPaymentMethod) => {
    if (!window.confirm(`Remove ${m.label}? Members stop seeing it. Payments already sent with it are kept.`)) return;
    try { await deleteGymPaymentMethod(m.id); await load(); }
    catch (e) { showToast(e instanceof Error ? e.message : 'That could not be removed', 'error'); }
  };

  const muted = { color: 'var(--color-text-secondary)' };
  const input = 'w-full rounded-lg border px-3 py-2 text-sm';
  const inputStyle = { borderColor: 'var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text-primary)' };

  if (methods === undefined || module === undefined) return <p className="text-sm" style={muted}>Loading…</p>;
  if (methods === null) return <p className="text-sm" style={muted}>Online payments need migration 0167, which is not in the database yet.</p>;

  const on = !!module?.enabled;
  const live = methods.filter((m) => m.active);
  const locked = module?.state === 'not_sold';
  const held = module?.state === 'parent_off';

  return (
    <div className="space-y-5" data-tab="online-payments">
      <div>
        <h2 className="text-base font-semibold text-white">Online payments</h2>
        <p className="text-xs mt-1" style={muted}>
          Let members pay by GCash, Maya or bank transfer from the app, or keep payments at the front desk only.
          The money goes straight to your own account — Core Fitness never handles it — and the desk confirms each one.
        </p>
      </div>

      {/* The switch */}
      <button type="button" onClick={() => void toggle()} disabled={locked || held || !module} aria-pressed={on}
        className="w-full flex items-start gap-3 rounded-xl border px-4 py-3.5 text-left disabled:cursor-default"
        style={{ borderColor: on ? 'var(--color-primary)' : 'var(--color-border)', background: 'var(--color-surface)', opacity: locked || held ? 0.6 : 1 }}>
        <span className="mt-0.5 grid h-5 w-9 shrink-0 rounded-full p-0.5" style={{ background: on ? 'var(--color-primary)' : 'var(--color-border)' }}>
          <span className="h-4 w-4 rounded-full bg-white transition-transform" style={{ transform: on ? 'translateX(16px)' : 'none' }} />
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-semibold text-white">{on ? 'Members can pay online' : 'Front desk only'}</span>
          <span className="block text-xs mt-0.5" style={muted}>
            {locked ? 'Your Core Fitness plan does not include online payments.'
              : held ? 'Off because the front desk is switched off under Your app → What you run.'
              : on && live.length === 0 ? 'On, but members see nothing until you add a way to pay below.'
              : on ? `Members choosing a plan see ${live.map((m) => m.label).join(', ')} next to "pay at the desk".`
              : 'Members renew by telling the desk they are coming, and pay there.'}
          </span>
        </span>
      </button>

      {/* The methods */}
      <div className="rounded-xl border p-4" style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}>
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-white flex-1">Where members send the money</p>
          {!draft && <Button size="sm" onClick={() => setDraft(blank(methods.length))}><Plus size={14} className="mr-1" /> Add a way to pay</Button>}
        </div>
        {methods.length === 0 && !draft && (
          <p className="text-xs mt-3" style={muted}>None yet. Add your GCash, Maya or bank account — with its QR code if you have one, so members can scan it.</p>
        )}
        <div className="mt-3 space-y-2">
          {methods.map((m) => (
            <div key={m.id} className="flex items-center gap-3 rounded-lg border px-3 py-2.5" style={{ borderColor: 'var(--color-border)', opacity: m.active ? 1 : 0.6 }}>
              {m.qr_image
                ? <img src={m.qr_image} alt="" className="h-11 w-11 rounded-md bg-white object-contain p-0.5" />
                : <span className="grid h-11 w-11 place-items-center rounded-md" style={{ background: 'var(--color-surface-high)' }}><Smartphone size={18} style={muted} /></span>}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-white truncate">{m.label} <span className="text-xs font-normal" style={muted}>· {KIND_LABEL[m.kind]}{m.active ? '' : ' · hidden'}</span></p>
                <p className="text-xs truncate" style={muted}>{[m.account_name, m.account_number].filter(Boolean).join(' · ') || 'QR code only'}</p>
              </div>
              <Button size="sm" variant="ghost" onClick={() => setDraft({ ...m })}>Edit</Button>
              <button type="button" aria-label={`Remove ${m.label}`} onClick={() => void remove(m)} className="p-2 rounded-md" style={muted}><Trash2 size={15} /></button>
            </div>
          ))}
        </div>

        {draft && (
          <div className="mt-4 rounded-lg border p-4 space-y-3" style={{ borderColor: 'var(--color-primary)' }} data-draft>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs mb-1" style={muted} htmlFor="pm-kind">Type</label>
                <select id="pm-kind" className={input} style={inputStyle} value={draft.kind}
                  onChange={(e) => { const k = e.target.value as PayKind; setDraft({ ...draft, kind: k, label: draft.label === KIND_LABEL[draft.kind] || !draft.label ? (k === 'bank' ? 'Bank transfer' : KIND_LABEL[k]) : draft.label }); }}>
                  {(Object.keys(KIND_LABEL) as PayKind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs mb-1" style={muted} htmlFor="pm-label">Name members see</label>
                <input id="pm-label" className={input} style={inputStyle} maxLength={60} value={draft.label} placeholder="GCash, BPI, Maya…"
                  onChange={(e) => setDraft({ ...draft, label: e.target.value })} />
              </div>
              <div>
                <label className="block text-xs mb-1" style={muted} htmlFor="pm-name">Account name</label>
                <input id="pm-name" className={input} style={inputStyle} maxLength={120} value={draft.account_name ?? ''} placeholder="As it appears when they pay"
                  onChange={(e) => setDraft({ ...draft, account_name: e.target.value })} />
              </div>
              <div>
                <label className="block text-xs mb-1" style={muted} htmlFor="pm-number">Number</label>
                <input id="pm-number" className={input} style={inputStyle} maxLength={60} value={draft.account_number ?? ''} placeholder="09XX XXX XXXX or account no."
                  onChange={(e) => setDraft({ ...draft, account_number: e.target.value })} />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs mb-1" style={muted} htmlFor="pm-note">A line for members (optional)</label>
                <input id="pm-note" className={input} style={inputStyle} maxLength={600} value={draft.instructions ?? ''} placeholder="Send the exact amount and keep the receipt."
                  onChange={(e) => setDraft({ ...draft, instructions: e.target.value })} />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {draft.qr_image
                ? <img src={draft.qr_image} alt="QR code" className="h-24 w-24 rounded-lg bg-white object-contain p-1" />
                : <span className="grid h-24 w-24 place-items-center rounded-lg border border-dashed" style={{ borderColor: 'var(--color-border)' }}><QrCode size={22} style={muted} /></span>}
              <div className="space-y-2">
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm" style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}>
                  {draft.qr_image ? 'Choose another QR code' : 'Upload the QR code'}
                  <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" aria-label="QR code image"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      void shrinkImage(f, 600, 'qr').then((url) => setDraft((d) => d && { ...d, qr_image: url }))
                        .catch(() => showToast('That image could not be read.', 'error'));
                    }} />
                </label>
                {draft.qr_image && <button type="button" className="block text-xs underline" style={muted} onClick={() => setDraft({ ...draft, qr_image: null })}>Remove the QR code</button>}
                <button type="button" onClick={() => setDraft({ ...draft, active: !draft.active })} className="flex items-center gap-1.5 text-xs" style={muted}>
                  {draft.active ? <Eye size={13} /> : <EyeOff size={13} />} {draft.active ? 'Shown to members' : 'Hidden from members'}
                </button>
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={() => void save()} disabled={busy}><Check size={14} className="mr-1" /> {busy ? 'Saving…' : 'Save'}</Button>
              <Button variant="ghost" onClick={() => setDraft(null)}>Cancel</Button>
            </div>
          </div>
        )}
      </div>

      <p className="text-xs" style={muted}>
        How it works for the desk: a member who pays online shows up under Payments → Coming to renew with the amount,
        the reference number and their screenshot. Check it reached your account, then Record payment (it is filled in
        for you) — or Decline it with a reason, which tells the member and lets them send it again.
      </p>
    </div>
  );
}
