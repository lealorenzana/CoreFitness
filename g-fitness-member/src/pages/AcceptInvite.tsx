import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { clearGymContext } from '../lib/gymContext';
import { clearGymApp } from '../lib/gymApp';
import { Page, PageTitle } from '../components/ui/page';
import { NocButton } from '../components/ui/noc';

interface Peek {
  gym_id: string;
  gym_name: string;
  slug: string;
  logo_url: string | null;
  accent: string;
  role: 'member' | 'trainer' | 'staff';
  first_name: string | null;
  state: 'waiting' | 'accepted' | 'revoked' | 'expired' | 'gym_unavailable';
}

/**
 * Opening an invitation from a gym (0111).
 *
 * The link works before anyone signs in, because that is when it is usually
 * opened — `peek_invitation` is granted to `anon` and tells the visitor which
 * gym invited them and as what, and nothing else. No email, no token echoed
 * back: somebody who guessed a token learns only a gym's public name.
 *
 * Accepting needs a session, and the database refuses it unless the signed-in
 * address is the one the invitation was sent to. That is what makes a link safe
 * to hand out — a forwarded invitation cannot be used by whoever received it.
 *
 * An accepted member arrives **already approved**: the gym invited them by
 * name, which is the approval. A self-registration still joins the queue.
 */
export default function AcceptInvite() {
  const { token = '' } = useParams();
  const navigate = useNavigate();
  const [peek, setPeek] = useState<Peek | null>(null);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    void (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setSignedIn(!!session);

      const { data, error: peekError } = await supabase.rpc('peek_invitation', { p_token: token });
      if (peekError || !Array.isArray(data) || !data[0]) {
        setNotFound(true);
        return;
      }
      setPeek(data[0] as Peek);
    })();
  }, [token]);

  const accept = async () => {
    setBusy(true);
    setError(null);
    try {
      const { error: acceptError } = await supabase.rpc('accept_invitation', { p_token: token });
      if (acceptError) throw new Error(acceptError.message);
      // The gym they belong to has changed, so everything cached about "which
      // gym, and what it looks like" is now about the wrong one.
      clearGymContext();
      clearGymApp();
      window.location.assign('/member/home');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That did not work');
      setBusy(false);
    }
  };

  const body = () => {
    if (notFound) {
      return (
        <Message
          title="This link is not valid"
          text="It may have been typed incorrectly, or the gym may have withdrawn it. Ask them for a new one."
          action={{ label: 'Find a gym instead', to: '/join' }}
          navigate={navigate}
        />
      );
    }
    if (!peek || signedIn === null) {
      return <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Opening…</p>;
    }

    if (peek.state === 'accepted') {
      return (
        <Message
          title="This invitation has already been used"
          text={`If that was you, sign in and ${peek.gym_name} will be there.`}
          action={{ label: 'Sign in', to: '/login' }}
          navigate={navigate}
        />
      );
    }
    if (peek.state === 'revoked') {
      return (
        <Message
          title="This invitation was withdrawn"
          text={`${peek.gym_name} cancelled it. Ask them for a new one.`}
          action={{ label: 'Find a gym instead', to: '/join' }}
          navigate={navigate}
        />
      );
    }
    if (peek.state === 'expired') {
      return (
        <Message
          title="This invitation has expired"
          text={`Invitations last 30 days. Ask ${peek.gym_name} to send another.`}
          action={{ label: 'Find a gym instead', to: '/join' }}
          navigate={navigate}
        />
      );
    }
    if (peek.state === 'gym_unavailable') {
      return (
        <Message
          title={`${peek.gym_name} is not taking sign-ups`}
          text="The gym is not active on Core Fitness at the moment."
          action={{ label: 'Find a gym instead', to: '/join' }}
          navigate={navigate}
        />
      );
    }

    const role = peek.role === 'member' ? 'a member'
      : peek.role === 'trainer' ? 'one of their coaches' : 'part of their front desk';

    return (
      <div className="space-y-5">
        <div className="text-center">
          {peek.logo_url
            ? <img src={peek.logo_url} alt="" className="mx-auto h-16 w-16 rounded-2xl object-cover" />
            : <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl text-xl font-bold"
                style={{ background: 'var(--color-primary)' }}>
                {peek.gym_name.slice(0, 1)}
              </div>}
          <h2 className="mt-4 text-xl font-semibold" style={{ color: 'var(--color-text-primary)' }}>
            {peek.first_name ? `${peek.first_name}, ` : ''}{peek.gym_name} has invited you
          </h2>
          <p className="mt-2 text-sm" style={{ color: 'var(--color-text-muted)' }}>
            To join as {role}. You will be able to use the app straight away — no waiting to be
            approved, because they invited you themselves.
          </p>
        </div>

        {error && (
          <p className="rounded-xl px-3.5 py-3 text-sm"
            style={{ background: 'var(--color-secondary-light)', color: 'var(--color-secondary)' }}>
            {error}
          </p>
        )}

        {signedIn ? (
          <NocButton onClick={() => void accept()} disabled={busy}>
            {busy ? 'Joining…' : `Join ${peek.gym_name}`}
          </NocButton>
        ) : (
          <div className="space-y-2.5">
            <p className="text-center text-sm" style={{ color: 'var(--color-text-muted)' }}>
              Sign in or make an account first — with the email this invitation was sent to.
            </p>
            {/* The token rides along so they land back here afterwards rather
                than on a home screen, wondering what happened to the link. */}
            <NocButton onClick={() => navigate(`/register?invite=${token}`)}>
              Create my account
            </NocButton>
            <NocButton variant="structure" onClick={() => navigate(`/login?invite=${token}`)}>
              I already have one
            </NocButton>
          </div>
        )}
      </div>
    );
  };

  return (
    <Page>
      <PageTitle title="Invitation" back fallback="/join" />
      <div className="mt-6">{body()}</div>
    </Page>
  );
}

function Message({ title, text, action, navigate }: {
  title: string; text: string;
  action: { label: string; to: string };
  navigate: ReturnType<typeof useNavigate>;
}) {
  return (
    <div className="space-y-4 text-center">
      <h2 className="text-lg font-semibold" style={{ color: 'var(--color-text-primary)' }}>{title}</h2>
      <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>{text}</p>
      <NocButton onClick={() => navigate(action.to)}>{action.label}</NocButton>
    </div>
  );
}
