# AI in this system — what exists, what it costs, and what is left to do

Written 2026-09-15, answering the review's section 4. Read
[CLAUDE.md](../CLAUDE.md)'s *Levels, achievements and what a trainer may see*
first: the vocabulary rule there ("the AI features are deterministic and
rule-based, not model calls") is the reason this document exists at all.

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
