import { signupState } from '../lib/api/google';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Building2 } from 'lucide-react';
import { ArrowLeft, DeviceMobile, MagnifyingGlass, MapTrifold, NavigationArrow } from '@phosphor-icons/react';
import { Page } from '../components/ui/page';
import './joinGym.css';
import EmptyState from '../components/ui/EmptyState';
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
  /** 0227: already a member somewhere — joining another gym is a switch. */
  const [memberAt, setMemberAt] = useState<string | null>(null);
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
      if (session) {
        const list = await myGyms();
        setMine(new Set(list.map((g) => g.gym_id)));
        setMemberAt(list.find((g) => g.role === 'member' && (g.status === 'active' || g.status === 'pending_approval'))?.name ?? null);
      }
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
    // A member belongs to one gym at a time (0227): this is a switch, with its own screen.
    if (memberAt) {
      navigate('/switch-gym', { state: { gym: { id: gym.id, name: gym.name }, via: slug ? 'link' : 'list', ref } });
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
    <Page className="gp fg" dockClear={false}>
      {/* Mock-up 02 look (2026-11-24): the website's title face, loaded only here (React hoists it into <head>). */}
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo+Black&display=swap" precedence="default" />
      <button type="button" className="fg-back" onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/choose-gym'))}>
        <ArrowLeft size={18} aria-hidden />Back</button>

      <header className="fg-hero">
        <img className="fg-mascot" src="/mockup-art/phone-journey-mascot.webp" alt="" width={132} height={132} />
        <p className="fg-eyebrow">Core Fitness</p>
        <h1 className="gp-title fg-title">Find your gym</h1>
        <p className="fg-lede">Every gym on Core Fitness. Join with your gym’s code, search by name or town, or look on the map.</p>
      </header>

      {/* A gym that is not listed ("only with your link or code") is found here. Members who have the installed app and no link need this. */}
      {!slug && <form className="fg-card" onSubmit={(e) => { e.preventDefault(); void findByCode(); }}>
        <h2 className="fg-h2">Have a join code?</h2>
        <div className="fg-code">
          <input className="fg-input fg-input--code"
            value={code}
            onChange={(e) => { setCode(e.target.value.toUpperCase()); setCodeError(null); }}
            placeholder="e.g. PPDSSJ"
            aria-label="Join code"
            autoCapitalize="characters"
            maxLength={12}
          />
          <button type="submit" className="gp-cta fg-pill" disabled={!code.trim() || codeBusy}>{codeBusy ? 'Finding…' : 'Find'}</button>
        </div>
        {codeError && <p className="fg-error">{codeError}</p>}
      </form>}

      {!slug && (
        <div className="fg-card">
          <h2 className="fg-h2">Or look for it</h2>
          <label className="fg-search"><MagnifyingGlass size={18} aria-hidden />
            <input className="fg-input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name or town" aria-label="Search gyms" />
          </label>
          <div className="fg-two">
            {canAsk && !here && (
              <button type="button" className="gp-cta gp-cta--quiet fg-pill" onClick={() => void askHere()}><NavigationArrow size={16} aria-hidden />Use my location</button>
            )}
            <button type="button" className="gp-cta gp-cta--quiet fg-pill" onClick={() => navigate('/join/map', { state: { here } })}><MapTrifold size={16} aria-hidden />Map</button>
          </div>
        </div>
      )}

      {gyms && gyms.length === 0 && (
        <EmptyState
          icon={Building2}
          title="No gym by that name"
          message={slug ? "Check the spelling, or ask your gym for their join link." : "Check the spelling, or type your gym’s join code above."}
        />
      )}

      {sorted.length > 0 && (
        <section className="fg-list" data-finder>
          <h2 className="fg-h2 fg-h2--out">{slug ? 'Your gym' : here ? 'Nearest first' : 'Gyms'}</h2>
          <ul>
          {sorted.map((gym) => {
            const km = here && gym.latitude != null && gym.longitude != null
              ? distanceKm(here, { lat: gym.latitude, lng: gym.longitude }) : null;
            const ref = refFromUrl();
            const action = mine.has(gym.id) ? undefined
              : gym.join_policy === 'closed' && !ref ? 'Directions'
              : gym.join_policy === 'code' && !slug ? 'Have a code?'
              : busy === gym.id ? 'Asking…' : memberAt ? 'Switch' : 'Join';
            const onClick = mine.has(gym.id) ? undefined
              : action === 'Directions' ? () => window.open(directionsUrl(gym), '_blank', 'noopener')
              : action === 'Have a code?' ? () => document.querySelector<HTMLInputElement>('input[aria-label="Join code"]')?.focus()
              : () => void join(gym);
            // Where it is and how far, then the gym's own line. "You are already here" wins: it answers the question a tap would ask.
            const meta = mine.has(gym.id) ? 'You are already here'
              : [km != null ? `${km < 10 ? km.toFixed(1) : Math.round(km)} km` : null,
                 gym.join_policy === 'closed' ? 'Joins at the front desk' : gym.join_policy === 'code' ? 'Joins with its code' : null,
                 gym.tagline || gym.address].filter(Boolean).join(' · ');
            const body = (<>
              {/* The gym's own mark. A gym that uploaded none gets its initial, never the Core Fitness logo: this is a list of gyms. */}
              {gym.logo_url
                ? <img className="fg-logo" src={gym.logo_url} alt="" width={44} height={44} />
                : <span className="fg-logo fg-logo--initial" aria-hidden>{gym.name.trim().charAt(0).toUpperCase()}</span>}
              <span className="fg-row__body">
                <b>{gym.name}{gym.is_demo && <em className="fg-demo">Demo</em>}</b>
                {meta && <span>{meta}</span>}
              </span>
              {action && <span className={`fg-go ${action === 'Join' || action === 'Switch' ? 'fg-go--main' : ''}`}>{action}</span>}
            </>);
            return (
              <li key={gym.id}>
                {onClick ? <button type="button" className="fg-row" onClick={onClick}>{body}</button>
                  : <div className="fg-row fg-row--dim">{body}</div>}
              </li>
            );
          })}
          </ul>
        </section>
      )}

      {!slug && nearbyOsm.length > 0 && (
        <section className="fg-list" data-osm>
          <h2 className="fg-h2 fg-h2--out">Not on Core Fitness yet</h2>
          <ul>
          {nearbyOsm.map((g) => {
            const meta = [here ? `${(() => { const k = distanceKm(here, { lat: g.latitude, lng: g.longitude }); return k < 10 ? k.toFixed(1) : Math.round(k); })()} km` : null, g.address].filter(Boolean).join(' · ');
            const done = suggested.has(g.osm_id);
            const body = (<>
              <span className="fg-logo fg-logo--initial fg-logo--osm" aria-hidden>{(g.name ?? 'A').trim().charAt(0).toUpperCase()}</span>
              <span className="fg-row__body"><b>{g.name ?? 'A gym'}</b>{meta && <span>{meta}</span>}</span>
              <span className={`fg-go ${done ? '' : 'fg-go--main'}`}>{done ? 'Suggested' : 'Suggest'}</span>
            </>);
            return <li key={g.osm_id}>{done ? <div className="fg-row fg-row--dim">{body}</div> : <button type="button" className="fg-row" onClick={() => void suggest(g)}>{body}</button>}</li>;
          })}
          </ul>
          <p className="fg-fine">Gym data © OpenStreetMap contributors.</p>
        </section>
      )}

      <div className="fg-foot">
        {signedIn === false && (
          <button type="button" className="gp-cta gp-cta--quiet fg-pill" onClick={() => navigate('/login')}>I already have an account</button>
        )}
        <button type="button" className="gp-cta gp-cta--quiet fg-pill" onClick={() => navigate('/get-app')}><DeviceMobile size={16} aria-hidden />Install the app on your phone</button>
      </div>
    </Page>
  );
}
