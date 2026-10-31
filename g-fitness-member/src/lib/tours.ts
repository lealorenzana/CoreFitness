import type { TourDef } from '../components/tour/Tour';

/**
 * Each main screen's tour, as data (guides G4, 2026-10-31): the part to light
 * up (a selector already on the screen), a title, one line. A part the gym
 * switched off is simply not there, and its step is skipped. Every title and
 * line is translated through `t()` — `scripts/i18n-missing.py` checks them.
 *
 * Help lists these in this order, with Replay.
 */
export const TOURS: TourDef[] = [
  // ── The member app ──
  { id: 'today', app: 'member', name: 'Today', path: '/member/home', steps: [
    { target: '[data-today-workout]', title: 'Your workout for today', text: 'Tap Start and the app walks you through each set.' },
    { target: '[data-today-timeline]', title: 'What is next', text: 'Your sessions and what the gym has for you today, in order.' },
    { target: '[data-points-chip]', title: 'Your points', text: 'Earned for coming in and training. Spend them in Rewards.' },
    { target: 'nav[aria-label="Main"] [aria-label$="Show my code"]', title: 'Check in here', text: 'Show this code at the desk or the kiosk when you arrive.' },
  ] },
  { id: 'train', app: 'member', name: 'Train', path: '/member/book-class', steps: [
    { target: '[data-your-plan]', title: 'Your plan', text: 'Your training days, today’s workout with one Start, and your saved workouts.' },
    { target: '[data-library]', title: 'The library', text: 'Free workouts anyone can do, and programs to follow week by week.' },
    { target: '[role="tablist"]', title: 'Your coach is one tab away', text: 'Coach has your package, your sessions and Book a session.' },
  ] },
  { id: 'coach', app: 'member', name: 'Coach', path: '/member/book-class?tab=coach', steps: [
    { target: '[data-my-package]', title: 'Your package', text: 'Its chat, how far through you are, and paying for it.' },
    { target: '[data-coach-sessions]', title: 'Your sessions', text: 'Coming and past. Tap one to chat with that coach.' },
  ] },
  { id: 'you', app: 'member', name: 'You', path: '/member/membership', steps: [
    { target: '[data-trophy-level]', title: 'Your level', text: 'Earned by training days and steady weeks — what it takes to reach the next one.' },
    { target: '[role="tablist"]', title: 'Progress, badges, membership', text: 'Your body and targets, what you have earned, and your plan and payments.' },
  ] },
  // ── The coach app ──
  { id: 'today', app: 'coach', name: 'Today', path: '/trainer/home', steps: [
    { target: '[data-rail-today]', title: 'Today', text: 'Requests to decide, your day, and who needs you — start here.' },
    { target: '[data-rail-pt]', title: 'Personal training', text: 'Everyone you train, with their chat.' },
    { target: '[data-you-button]', title: 'You', text: 'Your status, your schedule, your hours, packages and the rest.' },
  ] },
  { id: 'pt', app: 'coach', name: 'Personal training', path: '/trainer/home?view=pt', steps: [
    { target: '[data-pt-section="package"]', title: 'On a package', text: 'Members on a monthly package — each has a place with chat, classwork and progress.' },
    { target: '[data-pt-section="single"]', title: 'Single sessions', text: 'Members who book a session now and then. Their chat is here too.' },
    { target: '[data-rail-offer]', title: 'Start coaching someone', text: 'Offer a member a package.' },
  ] },
  { id: 'schedule', app: 'coach', name: 'Schedule', path: '/trainer/schedule', steps: [
    { target: '[data-week-tab]', title: 'This week', text: 'Requests to decide, then each day’s sessions. Cancel one here with a reason.' },
    { target: '[role="tablist"]', title: 'Your hours', text: 'Set the hours members can book you.' },
  ] },
];

export const tourFor = (app: TourDef['app'], id: string): TourDef | undefined => TOURS.find((x) => x.app === app && x.id === id);
