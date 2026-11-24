import { Page, PageTitle } from '../components/ui/page';
import { PageHero } from '../components/ui/PageHero';
import BookClass from './BookClass';
import { useBookingModes } from '../hooks/useBookingModes';

/**
 * Book a session (simplify, 2026-10-28): the 1-on-1 booking that used to sit
 * at the top of Train → Coach, on its own page behind Coach's one button. A
 * coach's "Book" (router state `trainerId`) still opens that coach's hours.
 */
export default function BookSession() {
  const ptOff = useBookingModes()?.ptMode === 'off';
  if (ptOff) {
    return (
      <Page>
        <PageTitle back fallback="/member/book-class?tab=coach" title="Ask for a session" />
        <p data-pt-booking-off style={{ fontSize: 14, lineHeight: 1.55, color: 'var(--color-text-secondary)' }}>
          Your gym books 1-on-1 sessions at the front desk, not in the app. Ask at the desk, or message your coach.
        </p>
      </Page>
    );
  }
  return (
    <div className="flex flex-col">
      <Page className="has-page-hero">
        <PageTitle back fallback="/member/book-class?tab=coach" title="Ask for a session" />
        <PageHero label="1-on-1 coaching" kicker="1-on-1 coaching" lead="Your coach," accent="your time."
          text="Pick a coach, then one of their open times. They confirm it." art="/images/member-training.png" />
      </Page>
      <BookClass mode="pt" />
    </div>
  );
}
