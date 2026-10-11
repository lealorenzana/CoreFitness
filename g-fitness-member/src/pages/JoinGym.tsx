import { signupState } from '../lib/api/google';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Building2 } from 'lucide-react';
import { Page, PageTitle } from '../components/ui/page';
import { LineRow, NocButton, SectionHead } from '../components/ui/noc';
import EmptyState from '../components/ui/EmptyState';
import { TextInput } from '../components/ui/Field';
import { toast } from '../components/ui/Toast';
import { errorMessage } from '../utils/errorMessage';
import {
  cleanSlug, directionsUrl, distanceKm, gymByCode, gymBySlug, gymFinder, gymJoinRules, osmGymsNear, requestToJoin, suggestGym,
  type FinderGym, type OsmGym, type PublicGym,
} from '../lib/api/gyms';
import { getHere, locationGranted, tileCentre, type Here } from '../lib/here';
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
 *
 * The list (0182) is every gym on Core Fitness, nearest first once the member
 * lets the phone say where it is (asked once, kept on the phone), and each row
 * says what to do: Join (listed), Have a code? (code only), Directions (front
 * desk only). Gyms OpenStreetMap knows that are not on Core Fitness come after,
 * each with Suggest. The legend is the map's alone (/join/map).
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
  const [gyms, setGyms] = useState<FinderGym[] | null>(null);
  const [here, setHere] = useState<Here | null>(null);
  const [canAsk, setCanAsk] = useState(true);
  const [osm, setOsm] = useState<OsmGym[]>([]);
  const [suggested, setSuggested] = useState<Set<string>>(new Set());
  const [mine, setMine] = useState<Set<string>>(new Set());
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  /** Signed in (Google, 0190) but in no gym: still a new member, who finishes signing up. */
  const [newAccount, setNewAccount] = useState(false);
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
        setGyms(gym ? [{ ...gym, join_policy: 'open', latitude: null, longitude: null, address: null }] : []);
        return;
      }
      setGyms(await gymFinder(term));
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
      // Signed in with Google and in no gym yet (0190): joining is the sign-up form, finished without a password.
      if (session) setNewAccount(((await signupState())?.gyms ?? 1) === 0);
      await load(slug ?? '', !!slug);
    })();
  }, [load, slug]);

  // Where the phone is — only when the browser already allows it, so opening
  // the page never pops a prompt; "Use my location" asks.
  useEffect(() => {
    if (slug) return;
    void (async () => {
      const h = await getHere(false);
      if (h) setHere(h);
      else setCanAsk(!(await locationGranted()) && 'geolocation' in navigator);
    })();
  }, [slug]);
  useEffect(() => {
    if (!here) return;
    void osmGymsNear(tileCentre(here).lat, tileCentre(here).lng).then(setOsm);
  }, [here]);
  const askHere = async () => {
    const h = await getHere(true);
    if (h) setHere(h);
    else { setCanAsk(false); toast.info('Location is off — search by name or town instead.'); }
  };

  // Typing filters the list; the search runs in the database (gym_finder).
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

  const suggest = async (g: OsmGym) => {
    try {
      await suggestGym(g);
      setSuggested((x) => new Set(x).add(g.osm_id));
      toast.success(`Thanks — Core Fitness will reach out to ${g.name ?? 'that gym'}.`);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const join = async (gym: PublicGym) => {
    // A friend's code rides along from `/join/<slug>?ref=CODE` (0125).
    const ref = refFromUrl();
    // A gym that signs members up only at the desk takes a request only from a
    // friend a member invited (0179). Said here, before a form is filled in
    // that the database would refuse at the end.
    const rules = await gymJoinRules(gym.id);
    if (rules?.policy === 'closed' && !ref) {
      toast.info(`${gym.name} creates its members' accounts at the front desk. Visit the gym, or ask a member to invite you.`);
      return;
    }
    if (!signedIn || newAccount) {
      // No account yet: sign up into this gym, keeping the friend's code.
      // The slug rides along: a gym joined by link or code is not in the
      // public list Register would otherwise look it up in.
      navigate(`/register?gym=${encodeURIComponent(gym.id)}&join=${encodeURIComponent(gym.slug)}${ref ? `&ref=${ref}` : ''}`);
      return;
    }
    setBusy(gym.id);
    try {
      // Found by its own link (or a code, which lands on the link) or in the list.
      const way = await requestToJoin(gym.id, slug ? 'link' : 'list', null, ref);
      // Named after the request, so the member row it needs already exists. A
      // code that does not apply is said, but the join itself has succeeded.
      if (ref) await claimReferral(gym.id, ref).catch((e: Error) => toast.info(e.message));
      await getGymContext(true);
      toast.success(way === 'auto' ? `You have joined ${gym.name}.` : `${gym.name} has your request. They will approve it at the desk.`);
      navigate('/choose-gym');
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  // Nearest first when the phone said where it is; pinned gyms before unpinned.
  const sorted = [...(gyms ?? [])].sort((a, b) => {
    if (!here) return 0;
    const da = a.latitude != null && a.longitude != null ? distanceKm(here, { lat: a.latitude, lng: a.longitude }) : Infinity;
    const db = b.latitude != null && b.longitude != null ? distanceKm(here, { lat: b.latitude, lng: b.longitude }) : Infinity;
    return da - db;
  });
  // OpenStreetMap's gyms near the phone that are not a Core Fitness gym already
  // (one within 150 m of a pinned gym is taken to be that gym), nearest first.
  const nearbyOsm = here ? osm
    .filter((o) => !(gyms ?? []).some((g) => g.latitude != null && g.longitude != null
      && distanceKm({ lat: g.latitude, lng: g.longitude }, { lat: o.latitude, lng: o.longitude }) < 0.15))
    .filter((o) => !search.trim() || (o.name ?? '').toLowerCase().includes(search.trim().toLowerCase()))
    .sort((a, b) => distanceKm(here, { lat: a.latitude, lng: a.longitude }) - distanceKm(here, { lat: b.latitude, lng: b.longitude }))
    .slice(0, 10) : [];

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
          placeholder="Search by name or town"
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

      {!slug && (
        <div className="flex" style={{ gap: 8 }}>
          {canAsk && !here && (
            <NocButton variant="ghost" className="flex-1" onClick={() => void askHere()}>Use my location</NocButton>
          )}
          <NocButton variant="structure" className="flex-1" onClick={() => navigate('/join/map', { state: { here } })}>Map</NocButton>
        </div>
      )}

      {sorted.length > 0 && (
        <div data-finder>
          <SectionHead title={slug ? 'Your gym' : here ? 'Nearest first' : 'Gyms'} />
          {sorted.map((gym, i) => {
            const km = here && gym.latitude != null && gym.longitude != null
              ? distanceKm(here, { lat: gym.latitude, lng: gym.longitude }) : null;
            const ref = refFromUrl();
            const action = mine.has(gym.id) ? undefined
              : gym.join_policy === 'closed' && !ref ? 'Directions'
              : gym.join_policy === 'code' && !slug ? 'Have a code?'
              : busy === gym.id ? 'Asking…' : 'Join';
            const onClick = mine.has(gym.id) ? undefined
              : action === 'Directions' ? () => window.open(directionsUrl(gym), '_blank', 'noopener')
              : action === 'Have a code?' ? () => document.querySelector<HTMLInputElement>('input[aria-label="Join code"]')?.focus()
              : () => void join(gym);
            return (
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
                // Where it is and how far, then the gym's own line. "You are
                // already here" wins: it answers the question a tap would ask.
                meta={mine.has(gym.id) ? 'You are already here'
                  : [km != null ? `${km < 10 ? km.toFixed(1) : Math.round(km)} km` : null,
                     gym.join_policy === 'closed' ? 'Joins at the front desk' : gym.join_policy === 'code' ? 'Joins with its code' : null,
                     gym.tagline || gym.address].filter(Boolean).join(' · ') || undefined}
                action={action}
                dim={mine.has(gym.id)}
                onClick={onClick}
                last={i === sorted.length - 1}
              />
            );
          })}
        </div>
      )}

      {!slug && nearbyOsm.length > 0 && (
        <div data-osm>
          <SectionHead title="Not on Core Fitness yet" />
          {nearbyOsm.map((g, i) => (
            <LineRow key={g.osm_id} title={g.name ?? 'A gym'} last={i === nearbyOsm.length - 1}
              meta={[here ? `${(() => { const k = distanceKm(here, { lat: g.latitude, lng: g.longitude }); return k < 10 ? k.toFixed(1) : Math.round(k); })()} km` : null, g.address].filter(Boolean).join(' · ') || undefined}
              action={suggested.has(g.osm_id) ? 'Suggested' : 'Suggest'} actionTone={suggested.has(g.osm_id) ? 'muted' : 'action'}
              onClick={suggested.has(g.osm_id) ? undefined : () => void suggest(g)} />
          ))}
          <p style={{ fontSize: 12, marginTop: 6, color: 'var(--color-text-muted)' }}>Gym data © OpenStreetMap contributors.</p>
        </div>
      )}

      {signedIn === false && (
        <NocButton variant="ghost" onClick={() => navigate('/login')}>I already have an account</NocButton>
      )}
      <NocButton variant="ghost" onClick={() => navigate('/get-app')}>Install the app on your phone</NocButton>
    </Page>
  );
}
