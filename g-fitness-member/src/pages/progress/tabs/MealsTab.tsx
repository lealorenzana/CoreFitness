import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChatCircleDots } from '@phosphor-icons/react';
import MealGuide from '../../../components/MealGuide';
import { Eyebrow, NocButton, Panel } from '../../../components/ui/noc';
import { Skeleton } from '../../../components/ui/Skeleton';
import { myMealGuide, type MealSection } from '../../../lib/api/aiProposals';
import { errorMessage } from '../../../utils/errorMessage';
import { useT } from '../../../lib/i18n';

/**
 * Meals — the meal guide the member applied from the coach (0146).
 *
 * One guide, read-only here: the coach proposes it, the member applies it on the
 * card (and undoes it there), so this screen only shows what is in force. With no
 * guide it says so and points at the coach — never a sample plan. A failed read
 * says so, rather than reading as "no guide yet".
 */

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; sections: MealSection[] | null };

export default function MealsTab() {
  const navigate = useNavigate();
  const t = useT();
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const sections = await myMealGuide();
        if (alive) setState({ status: 'ready', sections });
      } catch (err) {
        if (alive) setState({ status: 'error', message: errorMessage(err, t('Your meal guide could not be loaded.')) });
      }
    })();
    return () => { alive = false; };
  }, [t]);

  if (state.status === 'loading') {
    return <div className="space-y-3"><Skeleton className="h-6" /><Skeleton className="h-24" /><Skeleton className="h-24" /></div>;
  }

  if (state.status === 'error') {
    return <p role="alert" style={{ fontSize: 13, lineHeight: 1.55, color: 'var(--color-secondary)' }}>{state.message}</p>;
  }

  if (!state.sections) {
    return (
      <Panel glow="structure">
        <Eyebrow>{t('Meal guide')}</Eyebrow>
        <p style={{ fontSize: 17, fontWeight: 700, marginTop: 8, color: 'var(--color-text-primary)' }}>
          {t('No meal guide yet. Ask the coach for one.')}
        </p>
        <p style={{ fontSize: 13, marginTop: 6, lineHeight: 1.55, color: 'var(--color-text-secondary)' }}>
          {t('The coach suggests everyday meals with portions by hand size, and nothing changes until you tap Apply.')}
        </p>
        <NocButton variant="action" className="w-full" style={{ marginTop: 14 }} icon={<ChatCircleDots size={15} />}
          onClick={() => navigate('/member/chatbot')}>
          {t('Ask the coach')}
        </NocButton>
      </Panel>
    );
  }

  return (
    <div className="flex flex-col" style={{ gap: 14 }}>
      <Eyebrow tone="structure">{t('Built with the coach')}</Eyebrow>
      <MealGuide sections={state.sections} />
    </div>
  );
}
