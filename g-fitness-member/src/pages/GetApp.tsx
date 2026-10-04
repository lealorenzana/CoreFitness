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
  const [downloading, setDownloading] = useState(false);

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
      <PageTitle title="Get the app" subtitle="For members of every gym on Core Fitness" back fallback="/" />

      <SectionHead title="1. Install it" />
      {apk && (
        <NocButton variant="fill" onClick={() => void download()} disabled={downloading}>
          {downloading ? 'Downloading…' : 'Download for Android'}
        </NocButton>
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
