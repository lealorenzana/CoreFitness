import { useEffect, useState } from 'react';
import { AtSign } from 'lucide-react';
import { myLogin, setMyUsername, usernameAvailable, usernameShape, USERNAME_HINT, type MyLogin } from '../lib/api/logins';
import { showToast } from '../utils/toast';

/**
 * Settings → My profile → Username (0236): add, change or remove the name you
 * can sign in with. Removing it is refused while the account has no real email
 * (it would be their only way in). Hidden before 0236 is pasted.
 */
export default function MyUsernameBox() {
  const [login, setLogin] = useState<MyLogin | null>(null);
  const [value, setValue] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { void myLogin().then((l) => { setLogin(l); setValue(l?.username ?? ''); }); }, []);
  if (!login) return null;

  const changed = value.trim() !== (login.username ?? '');
  const save = async () => {
    const why = usernameShape(value) ?? (value.trim() ? await usernameAvailable(value).catch(() => null) : null);
    if (why) { setProblem(why); return; }
    setBusy(true);
    try {
      const saved = await setMyUsername(value.trim() || null);
      setLogin({ ...login, username: saved });
      setValue(saved ?? '');
      showToast(saved ? `You can sign in as ${saved}` : 'Username removed — sign in with your email', 'success');
    } catch (e) {
      setProblem(e instanceof Error ? e.message : 'That could not be saved');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="a-fld" style={{ marginBottom: 12 }} data-my-username>
      <label htmlFor="p-username">Username</label>
      <div style={{ display: 'flex', gap: 8 }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <AtSign size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
          <input id="p-username" className="a-in" style={{ paddingLeft: 32 }} value={value} autoCapitalize="off" spellCheck={false} placeholder="e.g. maria.santos"
            onChange={(e) => { setProblem(null); setValue(e.target.value.toLowerCase().replace(/\s+/g, '')); }} />
        </div>
        <button type="button" className="a-btn sm" disabled={!changed || busy} onClick={() => void save()}>{busy ? 'Saving…' : 'Save'}</button>
      </div>
      <p style={{ fontSize: 12, marginTop: 6, color: problem ? 'var(--color-secondary)' : 'var(--color-text-secondary)' }} role={problem ? 'alert' : undefined}>
        {problem ?? (login.hasEmail
          ? `${USERNAME_HINT}. Sign in with it or your email — leave it empty to use only your email.`
          : `${USERNAME_HINT}. You have no email on file, so this is how you sign in.`)}
      </p>
    </div>
  );
}
