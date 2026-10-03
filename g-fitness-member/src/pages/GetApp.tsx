import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Page, PageTitle } from '../components/ui/page';
import { LineRow, NocButton, SectionHead } from '../components/ui/noc';

/** Where the signed Android package lives once it is copied into public/ (docs/DEPLOYMENT.md). */
const APK = '/core-fitness.apk';

interface InstallPrompt extends Event { prompt: () => Promise<void> }

/**
 * Get the app — the page a gym sends members to, and the Android download.
 *
 * The APK is a TWA (docs/DEPLOYMENT.md): a shell around this same website, so
 * one download serves every gym and never needs updating for a code change.
 * The gym is chosen afterwards, by its link or its join code.
 *
 * Whether the file has been uploaded is asked, not assumed: a download button
 * that 404s is a broken promise, so without the file the page offers the
 * browser install, which gives the same app.
 */
export default function GetApp() {
  const navigate = useNavigate();
  const [apk, setApk] = useState<boolean | null>(null);
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);

  useEffect(() => {
    let alive = true;
    void fetch(APK, { method: 'HEAD' })
      .then((r) => { if (alive) setApk(r.ok && !(r.headers.get('content-type') ?? '').includes('text/html')); })
      .catch(() => { if (alive) setApk(false); });
    const onPrompt = (e: Event) => { e.preventDefault(); setPrompt(e as InstallPrompt); };
    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => { alive = false; window.removeEventListener('beforeinstallprompt', onPrompt); };
  }, []);

  const android = /android/i.test(navigator.userAgent);

  return (
    <Page>
      <PageTitle title="Get the app" subtitle="For members of every gym on Core Fitness" back fallback="/" />

      <SectionHead title="1. Install it" />
      {apk && (
        <NocButton variant="fill" onClick={() => window.location.assign(APK)}>Download for Android</NocButton>
      )}
      {apk && (
        <p className="mt-2 text-sm" style={{ color: 'var(--color-text-muted)' }}>
          Android will ask you to allow installing from this browser — that is expected for an app
          that is not from the Play Store.
        </p>
      )}
      {prompt && (
        <div className="mt-3">
          <NocButton variant={apk ? 'structure' : 'fill'} onClick={() => void prompt.prompt()}>
            Install from this browser
          </NocButton>
        </div>
      )}
      {!prompt && apk === false && (
        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
          {android
            ? 'Open the browser menu (⋮) and tap "Install app" or "Add to Home screen". It installs the same app.'
            : 'On an iPhone, tap Share, then "Add to Home Screen". On Android, open the browser menu (⋮) and tap "Install app".'}
        </p>
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
