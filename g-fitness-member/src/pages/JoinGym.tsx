import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Building2 } from 'lucide-react';
import { Page, PageTitle } from '../components/ui/page';
import { LineRow, NocButton, SectionHead } from '../components/ui/noc';
import EmptyState from '../components/ui/EmptyState';
import { TextInput } from '../components/ui/Field';
import { toast } from '../components/ui/Toast';
import { errorMessage } from '../utils/errorMessage';
import { listGyms, requestToJoin, type PublicGym } from '../lib/api/gyms';
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

  const load = useCallback(async (term: string) => {
    try {
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
      await load(slug ?? '');
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
              title={gym.name}
              meta={mine.has(gym.id) ? 'You are already here' : busy === gym.id ? 'Asking…' : 'Tap to join'}
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
