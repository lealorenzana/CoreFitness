import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Building2 } from 'lucide-react';
import { Page, PageTitle } from '../components/ui/page';
import { LineRow, NocButton, SectionHead } from '../components/ui/noc';
import EmptyState from '../components/ui/EmptyState';
import { TextInput } from '../components/ui/Field';
import { toast } from '../components/ui/Toast';
import { errorMessage } from '../utils/errorMessage';
import { gymBySlug, listGyms, requestToJoin, type PublicGym } from '../lib/api/gyms';
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
  const { slug } = useParams();
  const [search, setSearch] = useState('');
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

  const join = async (gym: PublicGym) => {
    if (!signedIn) {
      // No account yet: sign up into this gym.
      navigate(`/register?gym=${encodeURIComponent(gym.id)}`);
      return;
    }
    setBusy(gym.id);
    try {
      await requestToJoin(gym.id);
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
          message="Check the spelling, or ask your gym for their join link."
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
    </Page>
  );
}
