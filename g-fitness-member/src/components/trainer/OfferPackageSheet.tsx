import { useEffect, useState } from 'react';
import GlassSheet from '../ui/GlassSheet';
import { Field, Select, TextInput } from '../ui/Field';
import { NocButton } from '../ui/noc';
import { toast } from '../ui/Toast';
import { errorMessage } from '../../utils/errorMessage';
import { listMembers } from '../../lib/api/members';
import { inviteCoaching, monthsLabel, type CoachingSettings } from '../../lib/api/coaching';

/**
 * Start coaching someone (0181's coach offer, simplify 2026-10-28): the coach
 * picks a member and a length — and their price, where members pay the coach
 * directly. The member says yes in their app. Opened from Packages and from the
 * rail's + (only where the gym lets coaches offer).
 */
export default function OfferPackageSheet({ open, onClose, settings, member: preset, onSent }: {
  open: boolean; onClose: () => void; settings: CoachingSettings;
  /** A member to start with (a trainee's place: "Offer them a package"). */
  member?: string | null;
  onSent?: () => void;
}) {
  const direct = settings.feeMode === 'trainer_direct';
  const [members, setMembers] = useState<{ id: string; name: string }[]>([]);
  const [invite, setInvite] = useState({ member: preset ?? '', months: '', price: '' });
  const [busy, setBusy] = useState(false);
  const [shownFor, setShownFor] = useState(preset ?? null);
  if ((preset ?? null) !== shownFor) { setShownFor(preset ?? null); setInvite((v) => ({ ...v, member: preset ?? '' })); }

  useEffect(() => {
    if (!open) return;
    void listMembers().then((rows) => setMembers(rows.map((m) => ({ id: m.profile.id, name: `${m.profile.first_name} ${m.profile.last_name}` }))))
      .catch(() => setMembers([]));
  }, [open]);

  const send = async () => {
    setBusy(true);
    try {
      await inviteCoaching(invite.member, Number(invite.months), direct ? Number(invite.price) : null);
      toast.success('Offer sent — they say yes in their app');
      setInvite({ member: '', months: '', price: '' });
      onClose();
      onSent?.();
    } catch (e) { toast.error(errorMessage(e, 'The offer could not be sent')); }
    finally { setBusy(false); }
  };

  return (
    <GlassSheet open={open} onClose={onClose} title="Start coaching someone" subtitle="They are asked, and say yes in their app"
      footer={<NocButton className="w-full" disabled={busy || !invite.member || !invite.months || (direct && invite.price === '')}
        onClick={() => void send()}>Send the offer</NocButton>}>
      <div className="flex flex-col" style={{ gap: 10 }} data-invite>
        <Field label="Member">
          <Select aria-label="Member to invite" value={invite.member} onChange={(e) => setInvite({ ...invite, member: e.target.value })}>
            <option value="">Choose a member</option>
            {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </Select>
        </Field>
        <div className="grid grid-cols-2" style={{ gap: 8 }}>
          <Field label="Length">
            <Select aria-label="Length" value={invite.months} onChange={(e) => setInvite({ ...invite, months: e.target.value })}>
              <option value="">Choose</option>
              {settings.lengths.map((m) => <option key={m} value={m}>{monthsLabel(m)}</option>)}
            </Select>
          </Field>
          {direct && (
            <Field label="Your price (₱)">
              <TextInput inputMode="decimal" value={invite.price} onChange={(e) => setInvite({ ...invite, price: e.target.value.replace(/[^0-9.]/g, '') })} placeholder="0" />
            </Field>
          )}
        </div>
      </div>
    </GlassSheet>
  );
}
