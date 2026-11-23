import { GuideButton } from '../components/guides/GuidePlayer';
import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import {
  AndroidLogo, AppleLogo, ArrowLeft, CaretRight, Compass, DotsThreeVertical, DownloadSimple, Export, Hash, LinkSimple, PlusSquare, SignIn,
} from '@phosphor-icons/react';
import { TextTabs } from '../components/ui/noc';

/** Where the signed Android package lives once it is copied into public/ (docs/DEPLOYMENT.md). */
const APK = '/core-fitness.apk';

interface InstallPrompt extends Event { prompt: () => Promise<void> }
type Platform = 'android' | 'iphone';

const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
const isIOS = /iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && typeof document !== 'undefined' && 'ontouchend' in document);
/** On iOS only Safari can add to the Home Screen; Chrome and others there are WebKit shells without it. */
const isIOSNotSafari = isIOS && /crios|fxios|edgios|opios/i.test(ua);
/**
 * A computer (the website's "Get the member app" opens here): it cannot install a phone app, so the page
 * offers a code that opens itself on the phone (2026-11-21). A wide screen with a mouse and no phone UA.
 */
const onComputer = typeof window !== 'undefined' && !isIOS && !/android|mobile/i.test(ua)
  && window.matchMedia('(pointer: fine) and (min-width: 768px)').matches;

/**
 * Get the app — the page a gym sends members to: Android and iPhone, each
 * with exactly what works on it.
 *
 * Redesigned 2026-11-21 (design/lessons/LESSONS.md): a real page at every width, not a phone column on a
 * monitor. On a phone: what it is, the steps for this phone, then how to join a gym. On a computer: the same,
 * beside a code that opens this page on the phone. No glow, no decoration; one action per platform.
 *
 * Android: the signed package (a TWA around this same website, docs/DEPLOYMENT.md
 * — one download for every gym, never updated for a code change), or Chrome's
 * own install where the browser offers one. iPhone: Safari's Share → Add to
 * Home Screen, the only way an iPhone installs a web app — there is no install
 * button on iOS, so the page never shows one there.
 *
 * Whether the package was uploaded is asked, not assumed: a button that 404s
 * is a broken promise. The download is a fetch, never a navigation, which the
 * service worker would answer with the app shell.
 */
export default function GetApp() {
  const navigate = useNavigate();
  const [apk, setApk] = useState<boolean | null>(null);
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [tab, setTab] = useState<Platform>(isIOS ? 'iphone' : 'android');

  useEffect(() => {
    let alive = true;
    void fetch(APK, { method: 'HEAD' })
      .then((r) => { if (alive) setApk(r.ok && !(r.headers.get('content-type') ?? '').includes('text/html')); })
      .catch(() => { if (alive) setApk(false); });
    const onPrompt = (e: Event) => { e.preventDefault(); setPrompt(e as InstallPrompt); };
    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => { alive = false; window.removeEventListener('beforeinstallprompt', onPrompt); };
  }, []);

  /**
   * Fetch the package and hand it to the browser as a file, rather than
   * navigating to it. A navigation is answered by the service worker's app
   * shell (an older installed copy may not yet skip .apk), which opened the app
   * at an unknown path and sent a signed-in member to Today. A fetch is never
   * a navigation, so it always reaches the real file.
   */
  const download = async () => {
    setDownloading(true);
    try {
      const r = await fetch(APK, { cache: 'no-store' });
      const type = r.headers.get('content-type') ?? '';
      if (!r.ok || type.includes('text/html')) throw new Error('not the package');
      const url = URL.createObjectURL(await r.blob());
      const a = document.createElement('a');
      a.href = url;
      a.download = 'core-fitness.apk';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      // Last resort: a plain link with download, which most browsers fetch directly.
      const a = document.createElement('a');
      a.href = APK;
      a.download = 'core-fitness.apk';
      a.click();
    } finally {
      setDownloading(false);
    }
  };

  const back = () => (window.history.length > 1 ? navigate(-1) : navigate('/'));
  const host = typeof window !== 'undefined' ? window.location.host : 'corefitness-gym.vercel.app';

  return (
    <div className="gp" data-getapp>
      {/* The website's title face, loaded only on this page (React hoists it into <head>). */}
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo+Black&display=swap" precedence="default" />
      <header className="gp-top">
        <button type="button" className="gp-back" onClick={back}><ArrowLeft size={18} aria-hidden />Back</button>
        <span className="gp-brand"><img src="/logo.png" alt="" width={26} height={26} />Core Fitness</span>
      </header>

      <div className="gp-grid">
        <main className="gp-main">
          <h1 className="gp-title">Get the app</h1>
          <p className="gp-lede">For members and coaches of every gym on Core Fitness. Your check-in code, your workouts, your coach and your gym’s news, in English or Filipino.</p>
          <ul className="gp-facts">
            <li>Free to install</li>
            <li>About 2 MB</li>
            <li>Updates itself</li>
          </ul>

          <section className="gp-install" aria-labelledby="gp-install-h">
            <div className="gp-head">
              <h2 id="gp-install-h">Install it</h2>
              <GuideButton id="install-app" label="Watch how" />
            </div>
            <TextTabs<Platform> label="Your phone" active={tab} onChange={setTab} tabs={[
              { id: 'android', label: 'Android', icon: <AndroidLogo size={16} weight="fill" /> },
              { id: 'iphone', label: 'iPhone', icon: <AppleLogo size={16} weight="fill" /> },
            ]} />

            {tab === 'android' ? (
              <div className="gp-panel" role="tabpanel" aria-label="Android">
                {apk ? (
                  <>
                    <button type="button" className="gp-cta" onClick={() => void download()} disabled={downloading} aria-busy={downloading}>
                      <DownloadSimple size={18} weight="bold" aria-hidden />{downloading ? 'Downloading…' : 'Download for Android'}
                    </button>
                    <ol className="gp-steps">
                      <Step n={1} title="Download the app" text="The file is core-fitness.apk, about 2 MB." />
                      <Step n={2} title="Allow the install" text="Android asks to allow installing from this browser. That is expected for an app that is not from the Play Store." />
                      <Step n={3} title="Open Core Fitness" text="It is on your home screen, ready to sign in. It updates itself, so you never download it again." />
                    </ol>
                  </>
                ) : apk === false ? (
                  <p className="gp-note">The Android app file is not uploaded yet. Install it from Chrome instead. It is the same app.</p>
                ) : <div className="gp-wait" aria-hidden />}

                {/* Chrome's own install, where the browser offers it: an alternative, never the iPhone way. */}
                {prompt ? (
                  <div className="gp-alt">
                    <p>{apk ? 'Or install straight from Chrome' : 'Install from Chrome'}</p>
                    <button type="button" className={apk ? 'gp-cta gp-cta--quiet' : 'gp-cta'} onClick={() => void prompt.prompt()}>
                      Install from this browser
                    </button>
                  </div>
                ) : apk === false ? (
                  <ol className="gp-steps">
                    <Step n={1} icon={<DotsThreeVertical size={15} weight="bold" />} title="Open Chrome's menu" text="The three dots at the top right." />
                    <Step n={2} title='Tap "Install app" or "Add to Home screen"' text="It installs the same app." />
                  </ol>
                ) : null}
              </div>
            ) : (
              <div className="gp-panel" role="tabpanel" aria-label="iPhone">
                {isIOSNotSafari && (
                  <p className="gp-note gp-note--action">
                    Open this page in <b>Safari</b> first. On an iPhone, only Safari can add an app to the Home Screen.
                  </p>
                )}
                <ol className="gp-steps">
                  <Step n={1} icon={<Compass size={15} weight="bold" />} title="Open this page in Safari" text={`${host}/get-app`} />
                  <Step n={2} icon={<Export size={15} weight="bold" />} title="Tap Share" text="The square with an arrow, at the bottom of the screen (at the top on iPad)." />
                  <Step n={3} icon={<PlusSquare size={15} weight="bold" />} title='Tap "Add to Home Screen"' text="Scroll down the list if you do not see it, then tap Add." />
                  <Step n={4} title="Open Core Fitness" text="From your Home Screen. It opens full screen, like any app." />
                </ol>
                <p className="gp-note">There is no App Store download. On iPhone the app installs from Safari, and it is the same app.</p>
              </div>
            )}
          </section>

          <section className="gp-join" aria-labelledby="gp-join-h">
            <h2 id="gp-join-h">Then join your gym</h2>
            <ul className="gp-rows">
              <li className="gp-row">
                <span className="gp-row__icon" aria-hidden><LinkSimple size={18} /></span>
                <span className="gp-row__body"><b>I have a link from my gym</b><span>Open the link. It signs you up to that gym.</span></span>
              </li>
              <li>
                <button type="button" className="gp-row" onClick={() => navigate('/join')}>
                  <span className="gp-row__icon" aria-hidden><Hash size={18} /></span>
                  <span className="gp-row__body"><b>I have a join code</b><span>Type it on the next screen.</span></span>
                  <CaretRight size={16} className="gp-row__go" aria-hidden />
                </button>
              </li>
              <li>
                <button type="button" className="gp-row" onClick={() => navigate('/login')}>
                  <span className="gp-row__icon" aria-hidden><SignIn size={18} /></span>
                  <span className="gp-row__body"><b>I already have an account</b><span>Sign in.</span></span>
                  <CaretRight size={16} className="gp-row__go" aria-hidden />
                </button>
              </li>
            </ul>
          </section>
        </main>

        {onComputer && (
          <aside className="gp-side" data-getapp-qr>
            <div className="gp-qr">
              <div className="gp-qr__code" aria-hidden><QRCodeSVG value={`${window.location.origin}/get-app`} size={188} level="M" marginSize={2} /></div>
              <p className="gp-qr__title">On a computer? Scan this with your phone.</p>
              <p className="gp-qr__text">The app installs on a phone. This code opens this page there, or type <b>{host}/get-app</b> in your phone’s browser.</p>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}

function Step({ n, title, text, icon }: { n: number; title: string; text: string; icon?: ReactNode }) {
  return (
    <li className="gp-step">
      <span className="gp-step__n" aria-hidden>{n}</span>
      <span className="gp-step__body">
        <span className="gp-step__title">{icon && <span className="gp-step__icon">{icon}</span>}{title}</span>
        <span className="gp-step__text">{text}</span>
      </span>
    </li>
  );
}
