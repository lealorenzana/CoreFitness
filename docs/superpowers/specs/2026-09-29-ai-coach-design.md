# The AI Coach — design

2026-09-29. Approved in conversation: diet option B, Claude Sonnet 5.5 first,
injury → referral kept, the coach reads a member's data only after they opt in (apart from what they tell it during setup),
nothing changes without **Apply**, everything can be undone.

## What it is

A coach inside the member app, for members whose plan includes `ai_model`
(Premium), at gyms whose `assistant` switch is on. It:

1. **Onboards** a member in conversation — goal, experience, days a week,
   minutes a session, equipment they can use, what they enjoy, what to avoid —
   and keeps the answers as their coaching profile.
2. **Builds and changes their training** — routines (exercises, sets, reps,
   rest) and the weekly schedule — as *proposals* the member applies or
   discards. Applied changes can be undone.
3. **Sets goals** (the existing `fitness_goals`), numbers settled by SQL as now.
4. **Gives meal guidance, option B** — meal ideas and portion guidance by hand
   size ("a palm of protein, a fist of rice"). **Never** a calorie, kcal, macro
   or gram target. The database refuses one.
5. **Answers fitness questions** in context ("why am I sore", "swap squats, the
   rack is always busy").

It does **not**: state this gym's prices, hours, schedule or policies (the
existing rules in `data/memberAssistant.ts` still answer those first, from the
database); change anything because of an injury or condition (it refers them to
a coach or doctor — CLAUDE.md's rule, unchanged); read PAR-Q or waiver answers
(desk-only, Privacy says so); give medical advice; act for another member;
book, pay, freeze or cancel.

## Cost and money

Anthropic API, prepaid credit bought by the gym owner with a card at
console.anthropic.com, pay per token, **monthly spend limit set in the
console**. Members pay the gym for Premium as today; they never pay the AI
provider. Sonnet 5.5 ($2 / $10 per million tokens) ≈ ₱0.90 a message, ≈ ₱35 a
month for a member sending 40. No caching saving is assumed: the system prompt
(~350 tokens) is below the minimum cacheable prefix. Model is a secret (`COACH_MODEL`, default `claude-sonnet-5-5`),
so moving to Haiku 4.5 or Opus 5.5 is a secret change.

Two in-system limits, so the console cap is never the only brake:
- **Per member per day** — `gym_settings.ai_daily_messages`, default 30.
- **Per gym per month** — `gym_settings.ai_monthly_messages`, default 1,500.
  Hitting either says so plainly and the rules-based assistant keeps answering.

## Architecture

```
member app ──(JWT)──▶ Edge Function `ai-coach` ──▶ Anthropic Messages API
   ▲   streams text        │  tool loop (server side)
   │                       ├─ read tools  → Supabase REST *as the member* (their JWT, RLS applies)
   │                       ├─ write tools → create_ai_proposal()  (as the member)
   │                       └─ usage       → ai_record_usage()     (service role only)
   └── Apply / Discard / Undo ──▶ apply_ai_proposal() / undo_ai_proposal()  (SQL, as the member)
```

- **New function `ai-coach`**, Anthropic TypeScript SDK (`npm:@anthropic-ai/sdk`
  in Deno), manual tool loop (so every tool call is checked and logged), adaptive
  thinking at low effort, streamed to the phone
  as server-sent events. `fitness-assistant` stays as it is (unused once the
  coach is on; removed in a later cleanup, not here).
- **Every tool runs as the member.** The function forwards the member's own
  JWT to Supabase, so RLS decides what it can read and write — the AI can never
  reach another member's rows, because the member could not. The service-role
  key is used for one thing only: writing usage, which a member must not forge.
- **Gates, checked by the function before any model call** and again in SQL:
  signed in; `plan_allows(me, 'ai_model')`; `gym_module_on(gym, 'assistant')`;
  under both limits; the key configured. A failed check never falls through to
  free model access (the existing function's rule).
- **Write tools only propose.** `create_ai_proposal(kind, payload)` validates and
  stores a pending proposal; the phone renders it as a card (what will change,
  before/after); **Apply** runs `apply_ai_proposal(id)`, which re-validates,
  snapshots what it replaces, and writes; **Undo** restores the snapshot.

## Data — migration 0143 (Phase 2 adds 0144, the setup profile)

| Table | Holds | Who reads | Who writes |
|---|---|---|---|
| `ai_coach_profiles` | one row per member per gym: `consent_reads_data`, `consented_at`, onboarding answers (`goal`, `experience`, `days_per_week`, `minutes`, `equipment[]`, `likes`, `avoid`, `has_injury bool`) | the member | the member (via `save_ai_coach_profile()`) |
| `assistant_conversations` / `assistant_messages` (0046, reused; 0143 adds a `source` column, no new `ai_conversations`/`ai_messages` tables) | the chat, per member; role, text, tool calls, token counts. `ai_claim_message()` counts a message against the limits when it is claimed, before the model call | **the member only** — not trainer, desk or owner (like coach chat, 0131) | the function, as the member |
| `ai_proposals` | kind, payload, status (`pending`/`applied`/`discarded`/`undone`), `undo` snapshot, timestamps | the member; trainer sees *that* a routine came from the coach | proposals via `create_ai_proposal()`; status only via apply/undo/discard functions |
| `ai_meal_guides` | the member's current meal guidance (text sections) | the member | only `apply_ai_proposal()` |
| `ai_usage_days` | per member per Manila day: messages, input/output tokens | the member (own), owner (gym totals via a function) | **service role only** — no policy for any role |

Columns added: `workout_routines.source` and `gym_plans.source`
(`'member' | 'coach'`, default `'member'`), so the trainer's member sheet and the
member's own list can say "Built with the coach". `gym_settings.ai_daily_messages`,
`ai_monthly_messages`.

All tables gym-tagged (`gym_id default current_gym_id()`), RLS on, written only
through definer functions — the project's standing shape.

### Proposal kinds (validated in SQL)

- `routine.create` / `routine.replace` — name ≤ 40, ≤ 12 exercises, each an
  exercise id **visible to this gym** (the library + gym overlay) or a custom
  name; the existing column checks bound sets/reps/rest.
- `schedule.set` — day → routine (or rest) for the week, into `gym_plans`.
- `goal.create` — into `fitness_goals`, a recognised metric or custom.
- `meals.set` — sections of text; **refused if any contains** a calorie, kcal,
  macro or gram-of-protein/carb/fat figure (regex, tested by running it).
- Nothing else. A kind not on the list is refused.

## Privacy and consent

The first time a member opens the coach, one screen: what it reads (goals,
workouts, routines, schedule, measurements they logged, their coaching answers),
what it never reads (health/PAR-Q answers, payments, chat with coaches, photos),
that messages go to Anthropic to be answered, and a switch. Off means the coach
still talks and can still propose, but is given nothing from their history.
Revocable on Settings. **Privacy page updated in the same commit** (CLAUDE.md:
legal pages change with the rule), and `lib/memberDataExport.ts` (both apps)
gains the coach profile, proposals and meal guides.

## Screens

- **Member — Coach** (the existing `/member/chatbot` route, rebuilt): streamed
  replies; onboarding as a guided first conversation with quick-reply chips;
  proposal cards (Apply / Discard, then Undo); "today X of 30 messages";
  a clear locked state for non-Premium (0049: lock and explain) and "not at this
  gym" when the switch is off (0141). Gym facts still come from the rules first.
- **Member — routines, schedule, meals**: a coach-built routine carries a small
  "Built with the coach" mark; a **Meals** section appears under Progress once a
  guide exists, with the no-numbers note.
- **Trainer — member sheet**: routines show their source; nothing from the
  conversation is visible.
- **Admin — Your app**: the assistant switch (exists), the two limits, and this
  month's messages and estimated cost for the gym. Never any member's messages.
- **Platform — Usage**: coach messages and tokens per gym (counts only, 0140).

## Error handling

Unconfigured key → 503, the app says "The coach isn't set up at this gym yet"
and keeps the rules assistant. Limit reached → 429 with which limit. Upstream
429/5xx/timeout → "The coach is busy, try again in a minute"; the member's
message is kept. A refusal (`stop_reason: refusal`) → a plain apology, no
retry. A tool error returns `is_error` to the model so it can explain or
correct, never a crash. A proposal that no longer applies (routine deleted
since) → Apply says so and changes nothing.

## Testing

- `scripts/sql/ai-coach.mjs` (pglite, `authenticated` role): member A cannot
  read B's conversation, profile, proposals or usage; trainer/desk/owner cannot
  read messages; usage has no write path for any role; apply writes and undo
  restores exactly; a stale proposal is refused; unknown kind refused; an
  exercise from another gym refused; the meal regex refuses "1800 kcal",
  "150g protein", "macros" and allows "a palm of chicken"; consent off →
  `ai_coach_context()` returns no history; limits refuse at the boundary.
- Edge function: a Deno test against a stubbed Anthropic client — gate order,
  tool dispatch, is_error path, usage written once per turn.
- `member-coach-check.js` (Playwright fixture, the function routed): consent
  screen, streamed reply, a proposal card → Apply → the routine appears with its
  mark → Undo → gone; locked for a free plan; limit message.
- `admin-coach-usage-check.js`: limits save, usage shows counts and cost, no
  message text anywhere.
- Mutation: removing the meal regex and the member-only policy each fail a check.

## Phases (each shipped and tested before the next)

1. **Foundation** — 0143 tables/functions, `ai-coach` function with no tools,
   streamed chat, consent screen, limits, usage. *Live with a key: a Premium
   member chats.*
2. **Onboarding** — the profile, the guided first conversation. *Done 2026-09-29 (0144, `CoachSetup.tsx`); not yet live until 0144 is pasted.*
3. **Training tools** — read tools, routine/schedule/goal proposals,
   Apply/Undo, the "Built with the coach" mark, trainer sheet. *Done 2026-10-03 (0145, six tools, a tool loop, proposal cards, the Changes sheet; not yet live until 0145 is pasted). The cards in the conversation show for the current visit; the Changes sheet keeps them.*
4. **Meals** — `meals.set`, the Meals section, the regex. *Done 2026-10-03 (0146, `propose_meals`, a Meals tab under Progress, the trainer's compact read-only guide; not yet live until 0146 is pasted).*
5. **Owner and platform** — Your app limits and usage, platform Usage row. *Done 2026-10-03 (0147: the owner sets the two limits and sees this month's totals and an estimated cost on Your app; the platform sees a coach column and a spend tile on Usage; not yet live until 0147 is pasted).*

**The AI coach is complete** (Phases 1-5). What remains is the owner's: the Anthropic key, deploying `ai-coach`, and pasting 0146 and 0147.

## What the owner does (things only they can do)

Create the Anthropic account, add credit and set a monthly spend limit; set the
secret `ANTHROPIC_API_KEY` on the Supabase project (dashboard → Edge Functions →
Secrets, or `supabase secrets set`); paste each migration. The key is a
credential — it is typed by the owner, never by the assistant building this.
