import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Page, PageTitle } from '../components/ui/page';
import { Eyebrow, NocButton } from '../components/ui/noc';
import { toast } from '../components/ui/Toast';
import { UsernameInput } from '../components/account/LoginPieces';
import { myLogin, setMyUsername, usernameShape, type MyLogin } from '../lib/api/logins';

/**
 * Settings → Username (0236): add, change or remove the name you can sign in
 * with. Removing it is refused while the account has no real email — it would
 * be the only way in (set_my_username() says so too).
 */
export default function ChangeUsername() {
  const navigate = useNavigate();
  const isTrainer = useLocation().pathname.startsWith('/trainer');
  const backTo = isTrainer ? '/trainer/settings' : '/member/settings';
  const [login, setLogin] = useState<MyLogin | null | undefined>(undefined);
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { void myLogin().then((l) => { setLogin(l); setValue(l?.username ?? ''); }); }, []);

  const changed = !!login && value.trim() !== (login.username ?? '');
  const save = async () => {
    if (!login) return;
    const v = value.trim();
    if (!v && !login.hasEmail) { setError('With no email, your username is how you sign in — change it instead.'); return; }
    if (v && usernameShape(v)) { setError(usernameShape(v)); return; }
    setBusy(true);
    setError(null);
    try {
      const saved = await setMyUsername(v || null);
      toast.success(saved ? `You can sign in as ${saved}` : 'Username removed — sign in with your email');
      navigate(backTo);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That could not be saved');
      setBusy(false);
    }
  };

  return (
    <Page>
      <PageTitle back fallback={backTo} title="Username" subtitle="A name you can sign in with" />
      {login === undefined ? <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Loading…</p>
        : login === null ? <p style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>Usernames are not available at your gym yet.</p> : (<>
          <section>
            <Eyebrow>Now</Eyebrow>
            <p style={{ fontSize: 15, marginTop: 6, color: 'var(--color-text-primary)' }} data-current-username>
              {login.username ? `@${login.username}` : 'No username — you sign in with your email'}
            </p>
          </section>
          <UsernameInput value={value} onChange={(v) => { setError(null); setValue(v); }} required={!login.hasEmail} />
          {error && <p style={{ fontSize: 13, color: 'var(--color-secondary-300, var(--color-secondary))' }} role="alert">{error}</p>}
          <NocButton variant="fill" className="w-full" disabled={!changed || busy} onClick={() => void save()}>
            {busy ? 'Saving…' : value.trim() ? 'Save username' : 'Remove username'}
          </NocButton>
        </>)}
    </Page>
  );
}
