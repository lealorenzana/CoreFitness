import { useLocation, useNavigate } from 'react-router-dom';
import { Buildings, FileText, PlayCircle, ShieldCheck } from '@phosphor-icons/react';
import { Page, PageTitle } from '../components/ui/page';
import { LineRow, SectionHead } from '../components/ui/noc';
import { replayTour } from '../components/tour/Tour';
import { TOURS } from '../lib/tours';
import { useT } from '../lib/i18n';

/**
 * Help (guides G4, 2026-10-31) — for members at /member/help (More → Help) and
 * coaches at /trainer/help (You → Help): every tour of this app with Replay,
 * then how to reach the gym, and the terms and privacy.
 */
export default function Help() {
  const t = useT();
  const navigate = useNavigate();
  const coach = useLocation().pathname.startsWith('/trainer');
  const app = coach ? 'coach' : 'member';
  const tours = TOURS.filter((x) => x.app === app);
  const settings = coach ? '/trainer/settings' : '/member/settings';

  return (
    <Page>
      <PageTitle back fallback={coach ? '/trainer/home' : '/member/home'} title={t('Help')} subtitle={t('Short tours of each screen, and how to reach your gym')} />
      <section aria-label={t('Tours')} data-help-tours>
        <SectionHead title={t('Tours')} />
        {tours.map((x, i) => (
          <LineRow key={x.id} icon={PlayCircle} tone="act" title={t(x.name)} meta={`${x.steps.length} ${t('steps')}`}
            action={t('Replay')} last={i === tours.length - 1}
            onClick={() => { replayTour(x.id); navigate(x.path); }} />
        ))}
      </section>
      <section aria-label={t('Your gym')}>
        <SectionHead title={t('Your gym')} />
        <LineRow icon={Buildings} title={t('Contact your gym')} meta={t('Hours, phone and email')} onClick={() => navigate(`${settings}?section=gym`)} />
        <LineRow icon={FileText} title={t('Terms of service')} meta={t('Refunds, freezes and the rest of the rules')} onClick={() => navigate('/terms')} />
        <LineRow icon={ShieldCheck} title={t('Privacy policy')} meta={t('How your data is handled')} onClick={() => navigate('/privacy')} last />
      </section>
    </Page>
  );
}
