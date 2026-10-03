import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Building2 } from 'lucide-react';
import { Page, PageTitle } from '../components/ui/page';
import { LineRow, NocButton, SectionHead } from '../components/ui/noc';
import EmptyState from '../components/ui/EmptyState';
import { TextInput } from '../components/ui/Field';
import { toast } from '../components/ui/Toast';
import { errorMessage } from '../utils/errorMessage';
import { cleanSlug, gymByCode, gymBySlug, listGyms, requestToJoin, type PublicGym } from '../lib/api/gyms';
import { claimReferral, refFromUrl } from '../lib/api/referrals';
import { getGymContext, myGyms } from '../lib/gymContext';
import { supabase } from '../lib/supabaseClient';

/**
 * Find a gym and join it.
 *
 * Two ways in: a signed-in member asking a second gym to let them in (their
 * front desk approves, exactly as for a sign-up), and someone with no account
 * yet, who is sent to sign-up with the gym already chosen. `/join/<slug>` is
 * the link a gym shares, so the choice is already made.
 */
export default function JoinGym() {
  const navigate = useNavigate();
  const { slug: rawSlug } = useParams();
  const slug = rawSlug ? cleanSlug(rawSlug) : undefined;
  const [search, setSearch] = useState('');
  /** A join code: typed here, or carried in by `?code=` on a link. */
  const [code, setCode] = useState(() => new URLSearchParams(window.location.search).get('code') ?? '');
  const [codeBusy, setCodeBusy] = useState(false);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [gyms, setGyms] = useState<PublicGym[] | null>(null);
  const [mine, setMine] = useState<Set<string>>(new Set());
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  /**
   * `byLink` is the `/join/<slug>` case and asks a different question.
   *
   * `list_gyms()` returns listed gyms only, so a gym whose joining rule is
   * "only with your link or code" could not be found by its own link. Searching
   * is the listed question; a link is the addressed one.
   */
  const load = useCallback(async (term: string, byLink = false) => {
    try {
      if (byLink) {
        const gym = await gymBySlug(term);
        setGyms(gym ? [gym] : []);
        return;
      }
      setGyms(await listGyms(term));
    } catch (e) {
      setGyms([]);
      toast.error(errorMessage(e));
    }
  }, []);

  useEffect(() => {
    void (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setSignedIn(!!session);
      if (session) setMine(new Set((await myGyms()).map((g) => g.gym_id)));
      await load(slug ?? '', !!slug);
    })();
  }, [load, slug]);

  // Typing filters the list; the search runs in the database (list_gyms).
  useEffect(() => {
    if (slug) return;
    const t = setTimeout(() => { void load(search); }, 250);
    return () => clearTimeout(t);
  }, [search, slug, load]);

  const findByCode = async () => {
    setCodeBusy(true);
    setCodeError(null);
    try {
      const gym = await gymByCode(code);
      if (!gym) { setCodeError('No gym has that code. Check it with your gym — codes can be changed.'); return; }
      // Its own address, which finds it whether or not it is listed.
      navigate(`/join/${gym.slug}${window.location.search.includes('ref=') ? `?ref=${new URLSearchParams(window.location.search).get('ref')}` : ''}`);
    } catch (e) {
      setCodeError(errorMessage(e));
    } finally {
      setCodeBusy(false);
    }
  };

  // A `?code=` link finds its gym straight away.
  useEffect(() => {
    if (!slug && new URLSearchParams(window.location.search).get('code')) void (async () => { await findByCode(); })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const join = async (gym: PublicGym) => {
    // A friend's code rides along from `/join/<slug>?ref=CODE` (0125).
    const ref = refFromUrl();
    if (!signedIn) {
      // No account yet: sign up into this gym, keeping the friend's code.
      // The slug rides along: a gym joined by link or code is not in the
      // public list Register would otherwise look it up in.
      navigate(`/register?gym=${encodeURIComponent(gym.id)}&join=${encodeURIComponent(gym.slug)}${ref ? `&ref=${ref}` : ''}`);
      return;
    }
    setBusy(gym.id);
    try {
      await requestToJoin(gym.id);
      // Named after the request, so the member row it needs already exists. A
      // code that does not apply is said, but the join itself has succeeded.
      if (ref) await claimReferral(gym.id, ref).catch((e: Error) => toast.info(e.message));
      await getGymContext(true);
      toast.success(`${gym.name} has your request. They will approve it at the desk.`);
      navigate('/choose-gym');
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Page>
      <PageTitle title="Find your gym" subtitle="Every gym on Core Fitness" back fallback="/choose-gym" />

      {/* A gym that is not listed — "only with your link or code" — is found
          here. Members who have the installed app and no link need this. */}
      {!slug && <form className="mb-4" onSubmit={(e) => { e.preventDefault(); void findByCode(); }}>
        <SectionHead title="Have a join code?" />
        <div className="flex gap-2 items-stretch">
          <TextInput className="flex-1 min-w-0"
            value={code}
            onChange={(e) => { setCode(e.target.value.toUpperCase()); setCodeError(null); }}
            placeholder="e.g. PPDSSJ"
            aria-label="Join code"
            autoCapitalize="characters"
            maxLength={12}
          />
          <NocButton type="submit" className="shrink-0" style={{ width: 96 }} disabled={!code.trim() || codeBusy}>{codeBusy ? 'Finding…' : 'Find'}</NocButton>
        </div>
        {codeError && <p className="mt-2 text-sm" style={{ color: 'var(--color-secondary)' }}>{codeError}</p>}
      </form>}

      {!slug && (
        <TextInput
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name"
          aria-label="Search gyms"
        />
      )}

      {gyms && gyms.length === 0 && (
        <EmptyState
          icon={Building2}
          title="No gym by that name"
          message={slug ? "Check the spelling, or ask your gym for their join link." : "Check the spelling, or type your gym’s join code above."}
        />
      )}

      {gyms && gyms.length > 0 && (
        <div>
          <SectionHead title={slug ? 'Your gym' : 'Gyms'} />
          {gyms.map((gym, i) => (
            <LineRow
              key={gym.id}
              // The gym's own mark, at the size the row already reserves. A gym
              // that uploaded none gets nothing here rather than the Core
              // Fitness logo: this is a list of gyms, and every one of them
              // wearing the platform's mark is the opposite of what it is for.
              gutter={gym.logo_url
                ? <img src={gym.logo_url} alt="" width={36} height={36}
                    style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover' }} />
                : undefined}
              gutterWidth={gym.logo_url ? 48 : undefined}
              title={gym.name}
              // The gym's own line when it wrote one — its pitch, not ours.
              // The state of *this* member's relationship to it wins, because
              // "you are already here" is the answer to the question they are
              // about to ask by tapping.
              meta={mine.has(gym.id) ? 'You are already here'
                : busy === gym.id ? 'Asking…'
                : gym.tagline || 'Tap to join'}
              dim={mine.has(gym.id)}
              onClick={mine.has(gym.id) ? undefined : () => void join(gym)}
              last={i === gyms.length - 1}
            />
          ))}
        </div>
      )}

      {signedIn === false && (
        <NocButton variant="ghost" onClick={() => navigate('/login')}>I already have an account</NocButton>
      )}
      <NocButton variant="ghost" onClick={() => navigate('/get-app')}>Install the app on your phone</NocButton>
    </Page>
  );
}
