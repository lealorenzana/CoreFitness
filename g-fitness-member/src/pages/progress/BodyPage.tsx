import { Page, PageTitle } from '../../components/ui/page';
import BodyProgressTab from './tabs/BodyProgressTab';

/** Body — weight and measurements, opened from You → Progress (simplify, 2026-10-28; it was a tab of the Progress section). */
export default function BodyPage() {
  return (
    <Page>
      <PageTitle back fallback="/member/membership?tab=progress" title="Body" subtitle="Weight and measurements" />
      <BodyProgressTab />
    </Page>
  );
}
