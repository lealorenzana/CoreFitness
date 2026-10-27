import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MagnifyingGlass, QrCode, Scan } from '@phosphor-icons/react';
import { Page, PageTitle } from '../../components/ui/page';
import { NocButton, SectionHead } from '../../components/ui/noc';
import { TextInput } from '../../components/ui/Field';
import Avatar from '../../components/ui/Avatar';
import FriendScanner from '../../components/friends/FriendScanner';
import { toast } from '../../components/ui/Toast';
import { useFriendsOn } from '../../hooks/useFriendsOn';
import { findMembers, peopleYouMayKnow, sendRequest, type Found } from '../../lib/api/friends';

/**
 * Add a friend (wave 3, 0217): search your gym by name (only members who are
 * findable), scan a friend's code, or pick from people you may know — your
 * squad and the people you invited or who invited you. Both of you agree: a
 * request waits until they accept.
 */
export default function AddFriend() {
  const navigate = useNavigate();
  const on = useFriendsOn();
  const [q, setQ] = useState('');
  const [found, setFound] = useState<Found[]>([]);
  const [known, setKnown] = useState<Found[] | null>(null);
  const [scan, setScan] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => { if (on) void (async () => setKnown(await peopleYouMayKnow().catch(() => [])))(); }, [on]);
  useEffect(() => {
    if (!on) return;
    const t = window.setTimeout(() => { void (async () => setFound(await findMembers(q).catch(() => [])))(); }, 300);
    return () => clearTimeout(t);
  }, [q, on]);

  const add = async (p: Found) => {
    setBusy(p.id);
    try {
      const r = await sendRequest(p.id);
      toast.success(r === 'friends' ? `You and ${p.firstName} are friends now.` : `Request sent to ${p.firstName}.`);
      const mark = (list: Found[]) => list.map((x) => (x.id === p.id ? { ...x, state: r } : x));
      setFound(mark); setKnown((k) => (k ? mark(k) : k));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'That request did not go.');
    } finally {
      setBusy(null);
    }
  };

  const row = (p: Found) => (
    <div key={p.id} className="flex items-center" data-person style={{ gap: 12, padding: '12px 0', borderBottom: '1px solid var(--color-separator)' }}>
      <Avatar name={`${p.firstName} ${p.lastName}`} photoUrl={p.photoUrl} size={42} />
      <span className="min-w-0 flex-1">
        <span className="block truncate" style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text-primary)' }}>{p.firstName} {p.lastName}</span>
        {p.reason && <span className="block" style={{ fontSize: 12.5, color: 'var(--color-text-muted)' }}>{p.reason === 'squad' ? 'In your squad' : 'You invited each other'}</span>}
      </span>
      {p.state === 'friends' ? <span style={{ fontSize: 13, color: 'var(--color-primary-300)' }}>Friends</span>
        : p.state === 'sent' ? <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Sent</span>
        : <NocButton variant="action" style={{ minWidth: 76, flex: 'none' }} disabled={busy === p.id} onClick={() => void add(p)}>{p.state === 'incoming' ? 'Accept' : 'Add'}</NocButton>}
    </div>
  );

  const title = <PageTitle back fallback="/member/friends?tab=friends" title="Add a friend" />;
  if (on === false) return <Page>{title}<p style={{ fontSize: 13.5, color: 'var(--color-text-muted)' }}>Friends are not switched on at your gym.</p></Page>;

  return (
    <Page>
      {title}
      <label className="flex items-center" style={{ gap: 8 }}>
        <MagnifyingGlass size={18} aria-hidden style={{ color: 'var(--color-text-muted)', flex: 'none' }} />
        <TextInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search your gym by name" aria-label="Search your gym by name" />
      </label>
      {q.trim().length >= 2 && (
        <section data-search-results>
          {found.length === 0
            ? <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Nobody findable by that name. They may have switched it off — ask for their friend code.</p>
            : found.map(row)}
        </section>
      )}
      <div className="grid" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
        <NocButton variant="ghost" icon={<Scan size={16} />} onClick={() => setScan(true)}>Scan a code</NocButton>
        <NocButton variant="ghost" icon={<QrCode size={16} />} onClick={() => navigate('/member/friends/code')}>Your code</NocButton>
      </div>
      <section>
        <SectionHead title="People you may know" meta="your squad · invited" />
        {known == null ? null : known.length === 0
          ? <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Nobody to suggest yet. Your squad and the people you invite show here.</p>
          : known.map(row)}
      </section>
      <FriendScanner open={scan} onClose={() => setScan(false)} />
    </Page>
  );
}
