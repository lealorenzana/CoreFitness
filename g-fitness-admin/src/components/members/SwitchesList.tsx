import { useEffect, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, ReceiptText, UserCheck } from 'lucide-react';
import Avatar from '../ui/Avatar';
import { RdButton } from '../ui/rd';

// This window sits outside the redesigned pages' .att scope, so its words carry their own styles.
const SUB: React.CSSProperties = { fontSize: 13, color: 'var(--color-text-secondary)' };
const LBL: React.CSSProperties = { fontSize: 12, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', gap: 6 };
import { gymSwitchList, type GymSwitch } from '../../lib/api/gymSwitches';

const day = (iso: string) => new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });

/**
 * Members → Switching (0237, the owner, 2026-11-07): members moving between gyms,
 * each with what this gym does next.
 *   IN, waiting   — they are a sign-up like any other: approve or decline under
 *                   Sign-ups; once approved, their training history comes with them.
 *   OUT, done     — their payments and visits stay in this gym's records; if
 *                   their last term asked for a refund, it waits under Requests.
 * The other gym is never named (0227): where a member goes is their business.
 */
export default function SwitchesList({ onOpenSignups, onOpenRequests, onOpenMember }: {
  onOpenSignups: () => void;
  onOpenRequests: () => void;
  onOpenMember: (id: string) => void;
}) {
  const [rows, setRows] = useState<GymSwitch[] | null | undefined>(undefined);
  useEffect(() => { void gymSwitchList().then(setRows); }, []);

  if (rows === undefined) return <p style={{ ...SUB, padding: 20 }}>Loading…</p>;
  if (rows === null) return <p style={{ ...SUB, padding: 20 }}>The switches list could not be read right now. Notifications still tell you of each one.</p>;
  if (rows.length === 0) {
    return (
      <div style={{ padding: 20, textAlign: 'center' }} data-switches-empty>
        <p style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>No one is switching right now.</p>
        <p style={{ ...SUB, marginTop: 6 }}>When a member asks to move here from another gym, or leaves for one, they show here with what to do.</p>
      </div>
    );
  }
  const incoming = rows.filter((r) => r.direction === 'in');
  const outgoing = rows.filter((r) => r.direction === 'out');


  return (
    <div data-switches-list style={{ padding: '4px 20px 20px' }}>
      {incoming.length > 0 && (<>
        <p style={{ ...LBL, margin: '4px 0 2px' }}><ArrowDownLeft size={14} />Switching in · {incoming.length}</p>
        {incoming.map((r) => <SwitchRow key={r.id} r={r} onOpenSignups={onOpenSignups} onOpenRequests={onOpenRequests} onOpenMember={onOpenMember} />)}
      </>)}
      {outgoing.length > 0 && (<>
        <p style={{ ...LBL, margin: '18px 0 2px' }}><ArrowUpRight size={14} />Switched out · last 90 days · {outgoing.length}</p>
        {outgoing.map((r) => <SwitchRow key={r.id} r={r} onOpenSignups={onOpenSignups} onOpenRequests={onOpenRequests} onOpenMember={onOpenMember} />)}
      </>)}
      <p style={{ ...SUB, margin: '16px 0 0', lineHeight: 1.55, fontSize: 12.5 }}>
        A member belongs to one gym at a time. Approving a switch-in is the same as any sign-up — your joining rules and plans apply.
        When someone leaves, nothing of theirs is deleted here; the other gym is never named — that is the member's business.
      </p>
    </div>
  );
}

function SwitchRow({ r, onOpenSignups, onOpenRequests, onOpenMember }: {
  r: GymSwitch; onOpenSignups: () => void; onOpenRequests: () => void; onOpenMember: (id: string) => void;
}) {
  const inWaiting = r.direction === 'in' && r.status === 'pending';
  const word = r.direction === 'in'
    ? (r.status === 'pending' ? `Asked ${day(r.askedAt)} — waiting for you`
      : r.status === 'completed' ? `Joined ${day(r.decidedAt ?? r.askedAt)} — their training came with them`
      : r.status === 'declined' ? `Declined ${day(r.decidedAt ?? r.askedAt)}` : `They withdrew it ${day(r.decidedAt ?? r.askedAt)}`)
    : `Left ${day(r.decidedAt ?? r.askedAt)} — payments and visits stay here`;
  return (
    <div className="flex items-center gap-3" style={{ padding: '12px 0', borderBottom: '1px solid var(--color-border)' }} data-switch-row={r.direction}>
      <Avatar name={r.name} photoUrl={r.photoUrl} size={38} />
      <div className="min-w-0 flex-1">
        <button type="button" className="text-left" onClick={() => onOpenMember(r.member)}
          style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>{r.name}</button>
        <p style={{ ...SUB, marginTop: 2 }}>{word}</p>
      </div>
      {inWaiting && (
        <RdButton size="sm" variant="primary" icon={UserCheck} onClick={onOpenSignups} data-switch-review>Review in Sign-ups</RdButton>
      )}
      {r.refundWaiting && (
        <RdButton size="sm" variant="soft" icon={ReceiptText} onClick={onOpenRequests} data-switch-refund>Refund request waiting</RdButton>
      )}
    </div>
  );
}
