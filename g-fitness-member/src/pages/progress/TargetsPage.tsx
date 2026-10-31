import { Page, PageTitle } from '../../components/ui/page';
import GoalsTab from './tabs/GoalsTab';

/** Targets — what you are working towards, opened from You → Progress (simplify, 2026-10-28; it was a tab of the Progress section). */
export default function TargetsPage() {
  return (
    <Page>
      <PageTitle back fallback="/member/membership?tab=progress" title="Targets" subtitle="What you are working towards" />
      <GoalsTab />
    </Page>
  );
}
