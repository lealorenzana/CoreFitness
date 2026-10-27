/**
 * Every module that sends a kind of outbox job (lib/outbox.ts), loaded at start.
 *
 * A sender registers when its module loads, and some of these load lazily with
 * their page — so a member who reopens the app on Today, with a message still
 * waiting, would have nothing to send it with. Importing them here, from
 * main.tsx, means the senders exist before the first flush.
 */
import './api/chat';
import './api/rooms';
import './api/progress';
import './api/profiles';
import './api/members';
import './api/trainers';
import './api/routines';
import './offlineSets';
