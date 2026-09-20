import { useEffect, useState } from 'react';
import {
  explain, gymDetail, gymPeople, renameGym,
  type GymDetail as Detail, type GymPerson, type PlatformGym,
} from '../lib/platform';

const day = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-PH', { day: 'numeric', month: 'short', year: 'numeric' }) : null;
const peso = (n: string) => '₱' + Number(n).toLocaleString('en-PH', { maximumFractionDigits: 0 });

/**
 * One gym, opened up: what it is made of, who runs it, and how to reach them.
 *
 * The people list is admins and staff only — the platform's own counterparties,
 * the ones it invoices and supports. A gym's members and coaches are its own
 * business and 0109's function cannot return them at all (docs/TENANCY.md).
 *
 * Everything else here is a count or a date. Opening a gym never opens its rows.
 */
export default function GymDetail({ gym, onChanged, onClose }: {
  gym: PlatformGym; onChanged: () => void; onClose: () => void;
}) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [people, setPeople] = useState<GymPerson[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<{ name: string; slug: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const [d, p] = await Promise.all([gymDetail(gym.id), gymPeople(gym.id)]);
        setDetail(d); setPeople(p);
      } catch (e) {
        setError(explain(e, '0109'));
      }
    })();
  }, [gym.id]);

  const rename = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!renaming) return;
    setBusy(true);
    setError(null);
    try {
      await renameGym(gym.id, renaming.name.trim(),
        renaming.slug.trim() === gym.slug ? null : renaming.slug.trim());
      setRenaming(null);
      onChanged();
      setDetail(await gymDetail(gym.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not rename it');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card detail">
      <div className="row">
        <span className="grow">
          <span className="name">{gym.name}</span>
          <span className="meta">
            {detail ? `Opened ${day(detail.created_at)}` : 'Loading…'}
            {detail?.onboarded_at ? ` · set up ${day(detail.onboarded_at)}` : ' · never set up'}
          </span>
        </span>
        <span className="actions">
          <button className="btn ghost" onClick={() => setRenaming({ name: gym.name, slug: gym.slug })}>
            Rename
          </button>
          <button className="btn ghost" onClick={onClose}>Close</button>
        </span>
      </div>

      {error && <p className="err">{error}</p>}

      {renaming && (
        <form className="fields" onSubmit={rename} style={{ marginBottom: 14 }}>
          <div>
            <label htmlFor="rn-name">Gym name</label>
            <input id="rn-name" required value={renaming.name}
              onChange={(e) => setRenaming({ ...renaming, name: e.target.value })} />
          </div>
          <div>
            <label htmlFor="rn-slug">Link name</label>
            <input id="rn-slug" required value={renaming.slug}
              onChange={(e) => setRenaming({ ...renaming, slug: e.target.value })} />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            {renaming.slug.trim() !== gym.slug && (
              <p className="meta" style={{ color: 'var(--warn)' }}>
                Changing the link name breaks every /join/{gym.slug} link already printed or shared.
              </p>
            )}
            <div className="row" style={{ marginTop: 8 }}>
              <button className="btn" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
              <button className="btn ghost" type="button" onClick={() => setRenaming(null)}>Cancel</button>
            </div>
          </div>
        </form>
      )}

      {detail && (
        <>
          <div className="stats">
            <span className="stat"><strong>{detail.members}</strong><span>members</span></span>
            <span className="stat"><strong>{detail.trainers}</strong><span>coaches</span></span>
            <span className="stat"><strong>{detail.staff + detail.owners}</strong><span>behind the desk</span></span>
            <span className="stat"><strong>{detail.classes}</strong><span>classes</span></span>
            <span className="stat"><strong>{detail.checkins_30d}</strong><span>check-ins</span><span className="muted">30 days</span></span>
            <span className="stat"><strong>{detail.payments_30d}</strong><span>payments taken</span><span className="muted">30 days</span></span>
            <span className="stat">
              <strong>{peso(detail.paid_total)}</strong><span>paid to us</span>
              <span className="muted">{detail.last_paid_on ? `last ${day(detail.last_paid_on)}` : 'never'}</span>
            </span>
          </div>

          <div className="meta" style={{ marginTop: 14 }}>
            <strong style={{ color: 'var(--text)' }}>Where they are:</strong>{' '}
            {detail.address || <span className="muted">not filled in</span>}
            {detail.phone && <> · {detail.phone}</>}
            {detail.email && <> · {detail.email}</>}
          </div>
        </>
      )}

      <div style={{ marginTop: 14 }}>
        <div className="name" style={{ fontSize: 13 }}>Who runs it</div>
        <div className="meta">Owners and front desk only — a gym's members are its own business.</div>
        {people === null && <p className="empty">Loading…</p>}
        {people?.length === 0 && (
          <p className="empty">Nobody can sign into this gym yet. Invite its owner from the gym's row.</p>
        )}
        {people?.map((p) => (
          <div className="log" key={p.user_id}>
            <strong style={{ color: 'var(--text)' }}>
              {[p.first_name, p.last_name].filter(Boolean).join(' ') || p.email}
            </strong>
            {' · '}{p.is_owner ? 'owner' : 'front desk'}
            {p.status !== 'active' && ` · ${p.status}`}
            {p.email && <> · {p.email}</>}
          </div>
        ))}
      </div>
    </div>
  );
}
