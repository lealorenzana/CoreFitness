import { Page, PageTitle } from '../components/ui/page';
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
        <PageTitle back fallback="/member/book-class?tab=coach" title="Book a session" />
        <p data-pt-booking-off style={{ fontSize: 14, lineHeight: 1.55, color: 'var(--color-text-secondary)' }}>
          Your gym books 1-on-1 sessions at the front desk, not in the app. Ask at the desk, or message your coach.
        </p>
      </Page>
    );
  }
  return (
    <div className="flex flex-col">
      <Page><PageTitle back fallback="/member/book-class?tab=coach" title="Book a session" /></Page>
      <BookClass mode="pt" />
    </div>
  );
}
