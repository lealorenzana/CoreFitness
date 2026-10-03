# AI in this system — what exists, what it costs, and what is left to do

## Update 2026-09-29 — the AI coach supersedes `fitness-assistant`

For members, the **AI coach** (`supabase/functions/ai-coach/`, migration 0143) now
replaces `fitness-assistant`. It is a real Claude model (Claude Sonnet 5.5), not a rule
set, and it is gated in SQL. The rest of this document is kept below as history.

- **What is sent to Anthropic, and when.** Only questions the assistant's rules cannot
  answer. With the question goes the member's setup answers (goal, experience, days a
  week, minutes, equipment, likes, avoid, and an injury yes/no), whether or not they let
  the coach read their training. If they said yes to that, the question also carries
  first name, experience level, open goals, routine names, the 30-day workout count
  and their current meal guide (0146). Nothing else leaves the system.
- **The setup profile (0144, Phase 2).** The coach's first conversation is a guided
  setup (`CoachSetup.tsx`); `save_ai_coach_profile()` stores the answers: goal,
  experience, days a week, minutes, equipment, likes, avoid, and `has_injury` as a
  **yes/no only** (no injury details are ever asked for or stored). The profile is given to the coach
  **without** the history consent, because the member typed it for the coach; the
  workout history still needs the consent. An injury never changes an exercise: prompt
  rule 6 makes the coach refer the member to a professional. The Privacy page says so.
- **Training tools (0145, Phase 3).** The coach has six tools: `find_exercises`,
  `get_my_routines` and `get_my_schedule` (the last two need the history consent),
  and `propose_routine`, `propose_schedule`, `propose_goal`. **Nothing changes
  without the member's Apply**: a proposal is a row in `ai_proposals`, written by
  SQL, and only `apply` touches routines, schedule or goals. A member can discard a
  proposal or **undo** an applied one. Undo **never overwrites anything real**, and
  refuses in a plain sentence when: they have already trained with the routine
  ("already trained"); a newer coach change is in the way ("a newer change... undo
  that first"); they have **changed it themselves since** — a routine edited after
  the coach's last write to it (its `updated_at`, which 0145 also moves on any
  exercise edit), or plan days that are no longer exactly the set apply wrote; a
  goal they reached ("it stays"); or a routine they deleted since. A goal is refused
  outright at a gym that switched progress off. At most 10 proposals wait at once.
  The tool loop runs up to 6 rounds and is **one counted message per member
  question**, however many tool rounds it takes — so **one counted message may use
  up to 6 model calls** (the cost below is per call on a plain answer; a message
  that builds a routine costs a few times that). Routines and schedules it made
  carry "Built with the coach" / "Set by the coach" in the member app, the trainer's
  member sheet and the admin member drawer. The "Changes from the coach" sheet keeps
  **every waiting change plus 30 days of decided ones**, and stays reachable at the
  message limits and without the plan (apply/undo do not spend messages); the cards
  in the conversation show for the current visit.
- **Meal guides (0146, Phase 4).** The coach has a seventh tool, `propose_meals`: a
  guide is a short summary plus sections of meal ideas and portions **by hand**
  ("a palm of chicken, a fist of rice, half a plate of vegetables"), applied from a
  card like any other proposal and undoable. **A guide never carries a number
  target.** `meal_text_ok()` refuses, in the database, at create and again at apply:
  any calorie, kcal, kJ or kilojoule word, and an energy unit straight after a figure
  ("1800 cal", "2000kcal"); "macro" or "macros"; a nutrient beside a figure on either
  side ("Protein: 150", "150 protein a day", "150 grams of protein"); and any amount
  by weight or share ("150g", "1 kg", "6 oz", "1 lb", "40%", "40 percent"). A count of
  things is fine: "2 eggs", "1 cup of rice", "2 eggs for protein". **What the rule
  binds:** the stored guide (every section title and item) and the card's summary.
  **The coach's chat reply is not checked by the database** — it relies on the
  prompt alone (rule 3 and the MEALS block, which forbid the figures and say food
  first, role after). With the history consent the coach also reads the member's
  current guide (`ai_coach_context()`'s `meal_guide`). Progress → Meals and its More
  link show only when the member has a guide or the coach is theirs. The card carries a
  fixed line that this is general guidance, not a diet prescription. The member
  reads their guide under **Progress → Meals**. **Who sees it:** the member; and their
  own trainer, read-only and compact with a coach pill, only while the member shares
  goals with trainers (`trainee_meal_guide()`). The desk and the owner never see it
  (`trainer_may_see` alone would let them through, so the policy asks for the trainer
  role first). A gym that switched progress off cannot apply one. The Privacy page
  says so.
- **Two limits**, both set in `gym_settings`: 30 messages a day per member and 1500 a
  month per gym. A message is counted when it is **claimed** (`ai_claim_message()`),
  before the model call, so a failed or abandoned call still counts.
- **Cost.** About PHP 0.90 a message on Claude Sonnet 5.5, so a full gym month at the
  1500 limit is roughly PHP 1,350.
- **The key and the function are the owner's to set up**: an Anthropic account with a
  spend limit, the `ANTHROPIC_API_KEY` secret, and deploying `ai-coach`. Until then the
  app falls back to the rules' answers.

---

## History — written 2026-09-15

Written 2026-09-15, answering the review's section 4. Read
[CLAUDE.md](../CLAUDE.md)'s *Levels, achievements and what a trainer may see*
first: the vocabulary rule there ("the AI features are deterministic and
rule-based, not model calls" — superseded by the AI coach, see above) is the reason this document exists at all.

## The finding

**The integration is already built.** `supabase/functions/fitness-assistant/`
is a complete, provider-agnostic, safety-scoped Edge Function. It is
**undeployed and unconfigured**, which is a supported state, not a broken one —
the app falls back silently.

So the honest answer to "investigate whether a free AI can be integrated" is:
one already can, the design work is done, and what remains is a provider key and
a deploy. Both are the gym's to do; neither is a code change.

## Where a model actually earns its place

The review says not to add AI for its own sake, so this is the part that matters.

`data/memberAssistant.ts` is a 631-line rule table that answers from the
database: prices, opening hours, your membership, your check-in code, your next
booking, how points work. **CLAUDE.md records that the rules answer about 98% of
what members ask.** Those answers are correct by construction and a model would
make them worse — this project has already shipped a chatbot citing gyms,
coaches and prices that do not exist.

The remaining ~2% is general fitness knowledge: *how deep should I squat*,
*why am I sore for three days*, *is it fine to train twice in a day*. The rules
cannot answer those and should not try. That gap is the only place in this
system where a model is the right tool.

Everything else the review lists as a candidate is already better served without
one:

| Suggested | Why a model is not used |
|---|---|
| Workout plans | `planBuilder.ts` is deterministic — same answers, same plan, and it uses the equipment this gym actually has. A model would vary between runs and invent kit. |
| Trainer/member matching | 0083's `suggest_trainers_for_session()` filters on real availability. A model cannot know who is free. |
| Booking assistance | The booking rules are SQL triggers. A model guessing at quota or clashes would contradict them. |
| Reports and summaries | Analytics return zero rather than a plausible invention. That rule and generative text do not mix. |
| Feedback analysis | Four trainers and a few dozen ratings. There is nothing to mine that reading them does not answer. |

## What the function already does

- **Provider-agnostic.** Three secrets — `ASSISTANT_API_URL`,
  `ASSISTANT_API_KEY`, `ASSISTANT_MODEL` — against any OpenAI-compatible
  `/chat/completions`. Switching provider is three secret changes and no code,
  which matters because free tiers change and this gym cannot afford a rewrite
  when one does.
- **The key never reaches a browser.** It is an Edge Function secret, for the
  same reason the service-role key is.
- **Callers are verified**, against Supabase's auth endpoint rather than by
  decoding the JWT — decoding proves the shape, not the validity.
- **Plan-gated** via the same `plan_allows()` RLS calls, and a failure to *ask*
  is treated as a refusal, so an outage cannot become free model access.
- **Scoped by a hard system prompt**: never state this gym's prices, hours,
  schedule, trainers or policies; never give medical advice; never give calorie
  or macro targets; nothing outside fitness.
- **Degrades to the rules.** 503 unconfigured, 403 not entitled, 502 upstream
  down and the 20s timeout all arrive at the client as `null`, and the app shows
  its own answer. A member never sees a failure.

## Choosing a provider

Verified September 2026. All three speak the same API shape, so the choice is
about quota, not code.

| Option | Free tier | Key needed | Runs locally |
|---|---|---|---|
| **Groq** (recommended) | 30 requests/min, 14,400 requests/day, no credit card. Llama 3.1 8B Instant is the most generous model on it. | Yes | No |
| OpenRouter | A rotating set of `:free` models; limits move, and a model can disappear. | Yes | No |
| Ollama | Unlimited — it is your own machine. | No | Yes, but see below |

**Groq, for this gym.** 14,400 requests a day against a membership of roughly
150 people who mostly ask the rules-answered 98% is not a limit anyone will
reach. Limits are org-level, so extra keys do not help — worth knowing, not
worth worrying about here.

**Ollama cannot be the deployed answer, and it is worth saying why.** A Supabase
Edge Function runs in Supabase's cloud and cannot reach a machine sitting in a
gym in Mamburao. Self-hosting would mean the *admin desktop* calling Ollama
directly, which is a different architecture and only ever helps the one PC at
the front desk — not the phone app, which is the thing members use. It is a good
local development tool and not a deployment option.

## Limits, honestly

- **A rate limit looks like an outage to a member.** A 429 becomes the same
  "unavailable right now" as any other upstream failure, and they get the
  rule-based answer instead. That is the right member-facing behaviour; the
  status is logged for the gym.
- **No per-member throttle.** The 500-character cap stops one enormous request,
  not many small ones. Auth and the plan gate mean only entitled members can
  spend quota, which for one gym is sufficient. If the ceiling is ever reached,
  a per-member daily count is the next step, not a bigger tier.
- **Cost is zero until it is not.** If the gym outgrows Groq's free tier the
  same three secrets point somewhere paid. Nothing in the app assumes free.

## Privacy

The model is sent **the question and up to three prior turns, and nothing else**.
No name, no member id, no membership, no measurements, no booking history. That
is not a configuration choice — the function never loads any of it, so there is
nothing to leak even by mistake.

This is also why the system prompt forbids gym facts: a model that had no gym
data but was asked for a price would invent one. Refusing is the fallback.

## What is left, and who does it

1. **Get a Groq key** (console.groq.com, no card). The gym's, not a developer's.
2. **Set three secrets** on the project:
   `ASSISTANT_API_URL=https://api.groq.com/openai/v1/chat/completions`,
   `ASSISTANT_API_KEY=…`, `ASSISTANT_MODEL=llama-3.1-8b-instant`.
3. **Deploy** `supabase functions deploy fitness-assistant`.
4. Ask the assistant something the rules cannot answer — "how sore is too
   sore?" — and confirm it replies. Ask it the membership price and confirm it
   points at the app rather than guessing.

Steps 1 and 2 involve a credential and are the gym's to perform; step 3 is a
deploy, which needs explicit sign-off per this project's rules.
