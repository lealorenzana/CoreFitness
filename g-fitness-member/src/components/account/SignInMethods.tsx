import { useEffect, useState } from 'react';
import type { UserIdentity } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabaseClient';
import { toast } from '../ui/Toast';
import { LineRow, SectionHead } from '../ui/noc';

/**
 * Sign-in methods: link a Google account to this one, so "Continue with Google"
 * signs in to it. Trainers matter most — the gym creates their account with an
 * email and password, so a Google sign-in with any other address made a second,
 * empty account. Linked here, Google opens THIS account whatever its address.
 * Uses Supabase's manual identity linking (Authentication → "Allow manual
 * linking" must be on); unlinking needs another way in, so email stays.
 */
export default function SignInMethods({ returnPath }: { returnPath: string }) {
  const [ids, setIds] = useState<UserIdentity[] | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [tick, setTick] = useState(0);
  useEffect(() => {
    void (async () => {
      const { data } = await supabase.auth.getUserIdentities();
      setIds(data?.identities ?? []);
      setEmail((await supabase.auth.getUser()).data.user?.email ?? null);
    })();
  }, [tick]);
  useEffect(() => {
    // Back from Google after linking: say so once, and clean the address.
    const u = new URL(window.location.href);
    if (u.searchParams.get('linked') === 'google') {
      u.searchParams.delete('linked');
      window.history.replaceState(null, '', u.pathname + u.search);
      toast.success('Google is linked — you can use Continue with Google to sign in');
    }
  }, []);

  const google = ids?.find((i) => i.provider === 'google') ?? null;
  const googleEmail = (google?.identity_data as { email?: string } | undefined)?.email ?? null;

  const link = async () => {
    setBusy(true);
    const sep = returnPath.includes('?') ? '&' : '?';
    const { error } = await supabase.auth.linkIdentity({
      provider: 'google', options: { redirectTo: `${window.location.origin}${returnPath}${sep}linked=google` },
    });
    if (error) {
      setBusy(false);
      toast.error(/manual linking|disabled/i.test(error.message)
        ? 'Linking Google is not switched on for this app yet. Ask the gym to contact Core Fitness.'
        : /already linked|identity_already_exists/i.test(error.message)
          ? 'That Google account is already used by another Core Fitness account.'
          : error.message);
    }
    // On success the browser goes to Google and comes back to returnPath.
  };
  const unlink = async () => {
    if (!google) return;
    setBusy(true);
    const { error } = await supabase.auth.unlinkIdentity(google);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Google is unlinked. Sign in with your email and password.');
    setTick((n) => n + 1);
  };

  if (ids === null) return null;
  return (
    <section data-sign-in-methods>
      <SectionHead title="Sign-in methods" />
      <div style={{ marginTop: 4 }}>
        <LineRow title="Email and password" meta={email ?? undefined} />
        <LineRow title="Google"
          meta={google ? `Linked${googleEmail ? ` · ${googleEmail}` : ''}` : 'Not linked — link it to use Continue with Google'}
          action={busy ? '…' : google ? 'Unlink' : 'Link'} actionTone={google ? 'structure' : 'action'}
          onClick={busy ? undefined : () => void (google ? unlink() : link())} last />
      </div>
    </section>
  );
}
