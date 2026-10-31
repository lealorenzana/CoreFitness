import type { TourDef } from '../components/tour/Tour';

/**
 * The admin's tours, as data (guides G4, 2026-10-31): the part to light up, a
 * title, one line. Help → Tours lists them with Replay. A part not on the page
 * (switched off) is skipped.
 */
export const TOURS: TourDef[] = [
  { id: 'dashboard', app: 'admin', name: 'Dashboard', path: '/dashboard', steps: [
    { target: '[data-needs-you]', title: 'Needs you', text: 'Each row is something waiting for you. Its button opens the page that settles it.' },
    { target: '[data-month-numbers]', title: 'This month', text: 'Money, visits and members against the same days of last month.' },
    { target: '[data-today-sessions], [data-today-classes]', title: 'Today', text: 'Today’s sessions — or classes, when you run them.' },
    { target: 'aside', title: 'Every page', text: 'Personal training, payments, members and the rest are here. Hover a row to see what it is for.' },
  ] },
  { id: 'personal-training', app: 'admin', name: 'Personal training', path: '/personal-training', steps: [
    { target: '[data-pt-tabs]', title: 'Three tabs', text: 'To decide, every session, and every package.' },
    { target: '[data-to-decide]', title: 'To decide', text: 'Session requests you decide, package payments to confirm, and packages waiting on a coach.' },
  ] },
];

export const tourFor = (id: string): TourDef | undefined => TOURS.find((x) => x.id === id);
