import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { SignOut } from '@phosphor-icons/react';
import { Building2 } from 'lucide-react';
import { Page, PageTitle } from '../components/ui/page';
import { LineRow, NocButton, SectionHead, StatusPill } from '../components/ui/noc';
import EmptyState from '../components/ui/EmptyState';
import {
  getGymContext, homeFor, myGyms, switchGym, type MyGym,
} from '../lib/gymContext';
import { logout } from '../utils/auth';
import { useGymApp } from '../hooks/useGymApp';
import { word } from '../lib/gymApp';
import GymMark from '../components/ui/GymMark';
import { ACCENTS, type AccentKey } from '../lib/gymTheme';
import { errorMessage } from '../utils/errorMessage';
import { toast } from '../components/ui/Toast';

/**
 * Which gym am I using? Shown when a person belongs to more than one — at
 * sign-in, and any time from More → Gyms. One gym never sees this screen on
 * the way in; they reach it only to join another gym.
 *
 * A gym you are waiting on, or one that suspended you, is listed and says so
 * rather than quietly vanishing: not seeing your gym at all reads as "the app
 * lost it" (docs/TENANCY.md).
 */
export default function ChooseGym() {
  const navigate = useNavigate();
  // The words of the gym they are *currently* in. Another gym in the list may
  // call its coaches something else; this screen cannot know that without a
  // read per gym, so it uses the neutral role name for the rest.
  const gymApp = useGymApp();
  const [gyms, setGyms] = useState<MyGym[] | null>(null);
  const [current, setCurrent] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [list, ctx] = await Promise.all([myGyms(), getGymContext()]);
    setGyms(list);
    setCurrent(ctx?.gymId ?? null);
  }, []);

  useEffect(() => { void (async () => { await load(); })(); }, [load]);

  const choose = async (gym: MyGym) => {
    const landing = homeFor(gym.role);
    if (gym.status !== 'active' || !landing) return;
    setBusy(gym.gym_id);
    try {
      await switchGym(gym.gym_id, landing);
    } catch (e) {
      setBusy(null);
      toast.error(errorMessage(e));
    }
  };

  const label = (gym: MyGym) => {
    if (gym.status === 'pending_approval') return 'Waiting for the gym to approve you';
    if (gym.status === 'suspended') return 'Suspended here — ask the gym';
    if (gym.role === 'admin' || gym.role === 'staff') return 'You run this gym — use the admin app';
    // Only the row for the gym they are actually in gets that gym's words.
    // Every other row is a gym whose vocabulary this app has not read, and
    // labelling it with this gym's word would be a confident wrong answer.
    const own = gym.gym_id === current;
    if (gym.role === 'trainer') return own ? word(gymApp, 'trainer', true) : 'Coach';
    return own ? word(gymApp, 'member', true) : 'Member';
  };

  return (
    <Page>
      <PageTitle title="Your gyms" subtitle="Pick the one you are training at" />

      {gyms && gyms.length === 0 && (
        <EmptyState
          icon={Building2}
          title="You have not joined a gym yet"
          message="Join one to see your membership, classes and progress."
          cta={{ label: 'Find your gym', onClick: () => navigate('/join') }}
        />
      )}

      {gyms && gyms.length > 0 && (
        <div>
          <SectionHead title="Signed in as" />
          {gyms.map((gym, i) => (
            <LineRow
              key={gym.gym_id}
              // The one screen whose entire job is "which of these is mine",
              // and until 0116 it could not draw a gym's mark: my_gyms()
              // returned no logo. A gym with none gets a monogram in its own
              // colour — never the Core Fitness mark, which would put the
              // platform's badge on somebody's gym.
              gutter={<GymMark name={gym.name} logoUrl={gym.logo_url}
                accent={ACCENTS[(gym.accent ?? 'violet') as AccentKey]?.base} size={38} />}
              gutterWidth={50}
              title={gym.name}
              meta={label(gym)}
              action={
                gym.gym_id === current ? <StatusPill label="Current" tone="structure" />
                  : busy === gym.gym_id ? 'Switching…' : undefined
              }
              dim={gym.status !== 'active' || gym.role === 'admin' || gym.role === 'staff'}
              onClick={gym.status === 'active' && homeFor(gym.role) ? () => void choose(gym) : undefined}
              last={i === gyms.length - 1}
            />
          ))}
        </div>
      )}

      <NocButton variant="action" onClick={() => navigate('/join')}>Join another gym</NocButton>
      <NocButton
        variant="ghost"
        icon={<SignOut size={18} />}
        onClick={() => void (async () => { await logout(); navigate('/login'); })()}
      >
        Sign out
      </NocButton>
    </Page>
  );
}
