import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Scan } from '@phosphor-icons/react';
import { Page, PageTitle } from '../../components/ui/page';
import { NocButton } from '../../components/ui/noc';
import FriendScanner from '../../components/friends/FriendScanner';
import { useFriendsOn } from '../../hooks/useFriendsOn';
import { useMyIdentity } from '../../hooks/useMyIdentity';
import { friendQr, myFriendCode } from '../../lib/api/friends';

/**
 * Your friend code (wave 3, 0217): a QR a friend scans to send you a request —
 * how someone reaches you even when you are not findable by name. It is not
 * the check-in code and opens nothing else.
 */
export default function FriendCode() {
  const on = useFriendsOn();
  const me = useMyIdentity();
  const [code, setCode] = useState<string | null | undefined>(undefined);
  const [scan, setScan] = useState(false);
  useEffect(() => { if (on) void (async () => setCode(await myFriendCode()))(); }, [on]);

  const title = <PageTitle back fallback="/member/friends/add" title="Your friend code" subtitle="A friend scans this to add you. It is not your check-in code." />;
  if (on === false) return <Page>{title}<p style={{ fontSize: 13.5, color: 'var(--color-text-muted)' }}>Friends are not switched on at your gym.</p></Page>;
  return (
    <Page>
      {title}
      {code === undefined ? null : code === null ? (
        <p style={{ fontSize: 13.5, color: 'var(--color-secondary)' }}>Your code could not be loaded just now — try again in a moment.</p>
      ) : (
        <div className="flex flex-col items-center" style={{ gap: 12 }} data-friend-code>
          <span style={{ padding: 16, borderRadius: 20, background: '#fff' }}>
            <QRCodeSVG value={friendQr(code)} size={200} level="M" />
          </span>
          <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-text-primary)' }}>{me?.fullName}</p>
          <p className="tabular-nums" style={{ fontSize: 22, fontWeight: 800, letterSpacing: '0.2em', color: 'var(--color-primary-300)' }} aria-label={`Your code: ${code.split('').join(' ')}`}>{code}</p>
          <p style={{ fontSize: 12.5, color: 'var(--color-text-muted)', textAlign: 'center' }}>No camera? They can type these seven letters instead.</p>
        </div>
      )}
      <NocButton variant="ghost" icon={<Scan size={16} />} onClick={() => setScan(true)}>Scan theirs instead</NocButton>
      <FriendScanner open={scan} onClose={() => setScan(false)} />
    </Page>
  );
}
