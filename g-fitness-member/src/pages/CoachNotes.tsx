import { Page, PageTitle } from '../components/ui/page';
import TrainerFeedbackTab from './progress/tabs/TrainerFeedbackTab';
import { useGymApp } from '../hooks/useGymApp';
import { word } from '../lib/gymApp';

/**
 * What your coach has written about your training — Coaching → Notes.
 *
 * It was Progress's fourth tab, a third route to the same notes beside the
 * Train rail's "Coach notes" and the Everything sheet; the coach, their notes,
 * your bookings and your rooms now sit together under Coaching. `?tab=feedback`
 * links on Progress land here.
 */
export default function CoachNotes() {
  const app = useGymApp();
  return (
    <Page>
      <PageTitle back fallback="/member/book-class" title={`${word(app, 'trainer', true)} notes`}
        subtitle="Feedback on your sessions and your progress" />
      <TrainerFeedbackTab />
    </Page>
  );
}
