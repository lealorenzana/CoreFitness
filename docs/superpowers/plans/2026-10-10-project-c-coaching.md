# Project C1/C2/C4 — Getting a coach, terms, stand-ins, who pays

**Spec:** `docs/superpowers/specs/2026-10-10-gym-workflows-redesign-design.md` §C1, §C2, §C4.
Done before this: C5 joining rules (0179), C3 booking approvals (0180).

## Model (migration 0181)
- `gym_settings.coaching_modes text[]` — any of `classes`, `pick_pt`, `pick_group`, `desk_assigns`,
  `coach_invites`. Default `{classes,pick_pt,desk_assigns,coach_invites}` (today's behaviour plus the
  new ways that need no money). `coaching_lengths int[]` (months, default `{1,3,6}`).
  `coaching_fee_mode`: `included` (default — the member's plan must allow 1-on-1, `can_book_pt`) /
  `gym_priced` (`coaching_prices` per kind × months; the desk confirms the payment, which writes a
  `payments` row) / `trainer_direct` (G Fitness: the member pays the coach; each coach lists
  `trainer_payment_methods`; **the coach taps Received**; the gym sees coach + until when, never money).
- `coachings` — one row per member per coaching term: kind `pt`|`group` (group rows share a room via
  `room_id`), months, status `invited → requested → awaiting_payment → payment_sent → active → ended`
  (or `declined`/`cancelled`), starts_on/ends_on (Manila dates), price snapshot, pay_reference (claimed
  once per gym), started_by `member|desk|coach`. One open coaching per member per kind (partial unique).
  RLS: read by the member, the coach, the desk; **no write policy** — definer functions only.
- `coaching_standins` — a stand-in coach for a date range (≤ 90 days) chosen by the member; the main
  coach stays theirs. `is_my_trainee()` also answers true for an active coaching and a current stand-in.
- Functions: `request_coaching`, `respond_coaching` (coach accepts/declines; member accepts an invite),
  `assign_coaching` (desk), `invite_coaching` (coach), `submit_coaching_payment` (member reference),
  `confirm_coaching_payment` (coach for trainer_direct, desk for gym_priced), `end_coaching`,
  `set_coaching_standin`, `set_coaching_settings` / `set_coaching_price` (owner), `coaching_sweep()`
  (ends expired terms, reminds 7 days before — page load, re-runnable), `my_coaching()`.
  Activation makes the 1-on-1 room (kind `pt`) or the group room + `room_members`.

## Screens
- Member `/member/coach`: no coach → coaches (photo, specialty, bio, rating, presence) → length → ask;
  then the state (waiting / pay the coach or gym with the reference / active until / renew, switch,
  end); coach on leave → pick a stand-in with the same specialty. Entry from Coaching hub + Today.
- Trainer: requests to accept, invites, Received, own payment methods (Profile), Home counts.
- Admin: Settings → Coaching (modes, lengths, fee mode, prices), setup step, drawer shows coach +
  until when and Assign, Bookings-like confirm for gym_priced payments.

## Checks
`scripts/sql/coaching.mjs`; `member-coach-term-check.js`, `trainer-coaching-check.js`,
`admin-coaching-check.js`.
