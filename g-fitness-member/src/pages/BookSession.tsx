import { Page, PageTitle } from '../components/ui/page';
import BookClass from './BookClass';

/**
 * Book a session (simplify, 2026-10-28): the 1-on-1 booking that used to sit
 * at the top of Train → Coach, on its own page behind Coach's one button. A
 * coach's "Book" (router state `trainerId`) still opens that coach's hours.
 */
export default function BookSession() {
  return (
    <div className="flex flex-col">
      <Page><PageTitle back fallback="/member/book-class?tab=coach" title="Book a session" /></Page>
      <BookClass mode="pt" />
    </div>
  );
}
