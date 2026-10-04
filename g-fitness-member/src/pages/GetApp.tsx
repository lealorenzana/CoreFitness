import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { AndroidLogo, AppleLogo, Compass, DotsThreeVertical, Export, PlusSquare } from '@phosphor-icons/react';
import { Page, PageTitle } from '../components/ui/page';
import { LineRow, NocButton, SectionHead, TextTabs } from '../components/ui/noc';

/** Where the signed Android package lives once it is copied into public/ (docs/DEPLOYMENT.md). */
const APK = '/core-fitness.apk';

interface InstallPrompt extends Event { prompt: () => Promise<void> }
type Platform = 'android' | 'iphone';

const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
const isIOS = /iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && typeof document !== 'undefined' && 'ontouchend' in document);
/** On iOS only Safari can add to the Home Screen; Chrome and others there are WebKit shells without it. */
const isIOSNotSafari = isIOS && /crios|fxios|edgios|opios/i.test(ua);

/**
 * Get the app — the page a gym sends members to: Android and iPhone, each
 * with exactly what works on it.
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

  return (
    <Page>
      <PageTitle title="Get the app" subtitle="For members and coaches of every gym on Core Fitness" back fallback="/" />

      <SectionHead title="1. Install it" />
      <TextTabs<Platform> label="Your phone" active={tab} onChange={setTab} tabs={[
        { id: 'android', label: 'Android', icon: <AndroidLogo size={16} weight="fill" /> },
        { id: 'iphone', label: 'iPhone', icon: <AppleLogo size={16} weight="fill" /> },
      ]} />

      {tab === 'android' ? (
        <div className="getapp-panel" role="tabpanel" aria-label="Android">
          {apk ? (
            <>
              <NocButton variant="fill" className="w-full" onClick={() => void download()} disabled={downloading}>
                {downloading ? 'Downloading…' : 'Download for Android'}
              </NocButton>
              <ol className="getapp-steps">
                <Step n={1} title="Download the app" text="The file is core-fitness.apk, about 2 MB." />
                <Step n={2} title="Allow the install" text="Android asks to allow installing from this browser. That is expected for an app that is not from the Play Store." />
                <Step n={3} title="Open Core Fitness" text="It is on your home screen, ready to sign in." />
              </ol>
            </>
          ) : apk === false ? (
            <p className="getapp-note">
              The Android app file is not uploaded yet. Install it from Chrome instead — it is the same app.
            </p>
          ) : null}

          {/* Chrome's own install, where the browser offers it — an alternative, never the iPhone way. */}
          {prompt ? (
            <div className="getapp-alt">
              <p>{apk ? 'Or install straight from Chrome' : 'Install from Chrome'}</p>
              <NocButton variant={apk ? 'structure' : 'fill'} className="w-full" onClick={() => void prompt.prompt()}>
                Install from this browser
              </NocButton>
            </div>
          ) : apk === false ? (
            <ol className="getapp-steps">
              <Step n={1} icon={<DotsThreeVertical size={16} weight="bold" />} title="Open Chrome's menu" text="The three dots at the top right." />
              <Step n={2} title='Tap "Install app" or "Add to Home screen"' text="It installs the same app." />
            </ol>
          ) : null}
        </div>
      ) : (
        <div className="getapp-panel" role="tabpanel" aria-label="iPhone">
          {isIOSNotSafari && (
            <p className="getapp-note getapp-note--action">
              Open this page in <b>Safari</b> first — on an iPhone, only Safari can add an app to the Home Screen.
            </p>
          )}
          <ol className="getapp-steps">
            <Step n={1} icon={<Compass size={16} weight="bold" />} title="Open this page in Safari" text="corefitness-gym.vercel.app/get-app" />
            <Step n={2} icon={<Export size={16} weight="bold" />} title="Tap Share" text="The square with an arrow, at the bottom of the screen (at the top on iPad)." />
            <Step n={3} icon={<PlusSquare size={16} weight="bold" />} title='Tap "Add to Home Screen"' text="Scroll down the list if you do not see it, then tap Add." />
            <Step n={4} title="Open Core Fitness" text="From your Home Screen. It opens full screen, like any app." />
          </ol>
          <p className="getapp-note">There is no App Store download: on iPhone the app installs from Safari, and it is the same app.</p>
        </div>
      )}

      <div className="mt-6">
        <SectionHead title="2. Join your gym" />
        <LineRow title="I have a link from my gym" meta="Open the link — it signs you up to that gym" />
        <LineRow title="I have a join code" meta="Type it on the next screen" onClick={() => navigate('/join')} />
        <LineRow title="I already have an account" meta="Sign in" onClick={() => navigate('/login')} last />
      </div>
    </Page>
  );
}

function Step({ n, title, text, icon }: { n: number; title: string; text: string; icon?: ReactNode }) {
  return (
    <li className="getapp-step">
      <span className="getapp-step__n" aria-hidden>{n}</span>
      <span className="min-w-0">
        <span className="getapp-step__title">{icon && <span className="getapp-step__icon">{icon}</span>}{title}</span>
        <span className="getapp-step__text">{text}</span>
      </span>
    </li>
  );
}
