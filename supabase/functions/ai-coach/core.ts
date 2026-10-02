// The parts of the coach that are pure: its rules, the request it sends, the
// frames it streams, and what each gate says. No imports, so node can test it
// (scripts/ai-coach-core.mjs) and Deno can serve it unchanged.

export type Turn = { role: 'user' | 'assistant'; content: string };

export type CoachStatus = {
  gym_id: string; allowed: boolean; reason: string | null;
  used_today: number; daily_limit: number; used_month: number; monthly_limit: number;
  consent: boolean | null;
};

export const SYSTEM_PROMPT = `You are the coach inside a gym's member app in the Philippines. You help one gym member train well: technique, how to structure training, recovery, motivation, and everyday eating habits.

RULES YOU MUST NEVER BREAK
1. Never state this gym's prices, plans, opening hours, address, class schedule, coaches' names or policies. You do not have them. Say the app shows them (Membership, Book a session) or the front desk can help.
2. Never give medical advice. If the member mentions pain, an injury, illness, medication, pregnancy or a health condition: tell them to stop anything that hurts and to see a coach at the gym or a doctor or physiotherapist, and do not change or substitute exercises because of it.
3. Never give a calorie, kcal, macro or gram target, or a weight-loss number. Eating advice is about habits, food choices and portions by hand size (a palm of protein, a fist of rice, a thumb of fat), never numbers.
4. Stay on fitness, training, recovery and everyday eating. Politely decline anything else.
5. Never claim to be a person, a doctor or a dietitian. You are the gym's AI coach.
6. If the member's profile says has_injury is true, do not plan or change exercises around it. Say once, kindly, that a coach at the gym or a physiotherapist should look at it first, then help with everything else.

HOW YOU WRITE
Warm, direct, short: a few sentences or a short list. Use the member's first name now and then if you know it. Philippine context. When the honest answer is "ask a coach at the gym", say so.

HOW YOU CHANGE THINGS
You can look up exercises this gym has, and — if the member let you read their training — their routines and weekly schedule. You never change anything yourself: you propose a change with a propose tool, and the member decides on a card with Apply or Discard. Propose only after you know their goal, days and equipment (from their setup or by asking). Use exercises from find_exercises; use a custom name only when nothing fits. Keep routines to what fits their usual session. Write each summary as one short sentence the member will read on the card. After proposing, tell them briefly what you proposed and that nothing changes until they tap Apply. Never propose a change because of an injury or pain.`;

// ---- the tools ------------------------------------------------------------------------------
// Each is strict: every object closes its properties and requires all of them, and an optional
// value is nullable instead of absent. The database checks every value again (0145's
// ai_proposal_check) and its refusals are written for people, so ranges live there, not here.
export const MAX_ROUNDS = 6;

const str = (description: string) => ({ type: 'string', description });
const strOrNull = (description: string) => ({ type: ['string', 'null'], description });
const intOrNull = (description: string) => ({ type: ['integer', 'null'], description });
const numOrNull = (description: string) => ({ type: ['number', 'null'], description });
const obj = (properties: Record<string, unknown>) => ({
  type: 'object', properties, required: Object.keys(properties), additionalProperties: false,
});
const SUMMARY = str('One short sentence the member reads on the card, e.g. "A three-day full-body routine for your dumbbells."');

export const TOOLS = [
  {
    name: 'find_exercises',
    description: "Lists exercises this gym's catalogue has (up to 80, by name), with each one's id, muscle group, equipment and whether it is timed. Filters match the catalogue's own words, ignoring case; pass null to leave a filter off. Use the ids you get here in propose_routine.",
    strict: true,
    input_schema: obj({
      muscle_group: strOrNull('A muscle group exactly as the catalogue names it, or null for all.'),
      equipment: strOrNull('Equipment exactly as the catalogue names it, or null for all.'),
    }),
  },
  {
    name: 'get_my_routines',
    description: "The member's saved routines with their exercises (ids, sets, reps, weight, rest). Returns a note instead if the member has not let you read their training.",
    strict: true,
    input_schema: obj({}),
  },
  {
    name: 'get_my_schedule',
    description: "The member's weekly schedule: which days (0 Sunday to 6 Saturday) they train, the routine for each day, and the reminder time. Returns a note instead if the member has not let you read their training.",
    strict: true,
    input_schema: obj({}),
  },
  {
    name: 'propose_routine',
    description: 'Proposes a new routine, or a new version of one of their routines (replace_routine_id). Nothing changes until the member taps Apply on the card.',
    strict: true,
    input_schema: obj({
      summary: SUMMARY,
      replace_routine_id: strOrNull("The id of one of the member's routines (from get_my_routines) to replace, or null for a new routine."),
      name: str('The routine name, 1 to 40 characters.'),
      notes: strOrNull('A short note for the member, up to 280 characters, or null.'),
      exercises: {
        type: 'array',
        description: '1 to 12 exercises, in order.',
        items: obj({
          exercise_id: strOrNull('The id from find_exercises, or null with a custom_name.'),
          custom_name: strOrNull('A name (1 to 60 characters) only when nothing in find_exercises fits; otherwise null.'),
          target_sets: { type: 'integer', description: 'Sets, 1 to 20.' },
          target_reps: intOrNull('Reps per set, 1 to 200, or null for a timed exercise.'),
          target_weight_kg: numOrNull('Weight in kg, 0 to 1000, or null.'),
          target_seconds: intOrNull('Seconds per set for a timed exercise, 1 to 7200, or null.'),
          rest_seconds: { type: 'integer', description: 'Rest between sets in seconds, 0 to 600.' },
        }),
      },
    }),
  },
  {
    name: 'propose_schedule',
    description: "Proposes the member's whole weekly schedule (it replaces their current one when applied). Nothing changes until the member taps Apply on the card.",
    strict: true,
    input_schema: obj({
      summary: SUMMARY,
      days: {
        type: 'array',
        description: '1 to 7 training days, each day of the week at most once.',
        items: obj({
          day_of_week: { type: 'integer', enum: [0, 1, 2, 3, 4, 5, 6], description: '0 Sunday … 6 Saturday.' },
          routine_id: strOrNull("The id of one of the member's routines for that day, or null."),
          remind_at: strOrNull('A reminder time as HH:MM in 24 hours, e.g. "17:00", or null.'),
        }),
      },
    }),
  },
  {
    name: 'propose_goal',
    description: 'Proposes a goal for the member. Nothing changes until the member taps Apply on the card.',
    strict: true,
    input_schema: obj({
      summary: SUMMARY,
      title: str('The goal, 1 to 80 characters.'),
      metric: {
        type: 'string', enum: ['weight_kg', 'body_fat_pct', 'waist_cm', 'workouts_per_week', 'custom'],
        description: 'What the goal measures.',
      },
      start_value: numOrNull('Where they are now, under 10,000, or null.'),
      target_value: numOrNull('Where they want to be, under 10,000, or null.'),
      target_date: strOrNull('A date YYYY-MM-DD between today and two years from now, or null.'),
    }),
  },
] as const;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => v !== null && typeof v === 'object' && !Array.isArray(v);

// Checks one value against its schema (types and required only) — the model's input is
// untrusted even with strict on. Returns a plain message, or null when it fits.
function mismatch(schema: Obj, v: unknown, at: string): string | null {
  const types = ([] as unknown[]).concat(schema.type);
  if (v === null) return types.includes('null') ? null : `${at} is missing.`;
  if (Array.isArray(v)) {
    if (!types.includes('array')) return `${at} has the wrong type.`;
    for (let i = 0; i < v.length; i++) {
      const m = mismatch(schema.items as Obj, v[i], `${at}[${i}]`);
      if (m) return m;
    }
    return null;
  }
  if (typeof v === 'object') {
    if (!types.includes('object')) return `${at} has the wrong type.`;
    const props = (schema.properties ?? {}) as Record<string, Obj>;
    for (const k of Object.keys(props)) {
      if (!(k in (v as Obj))) return `${at === 'input' ? k : `${at}.${k}`} is missing.`;
      const m = mismatch(props[k], (v as Obj)[k], at === 'input' ? k : `${at}.${k}`);
      if (m) return m;
    }
    return null;
  }
  const ok = (typeof v === 'string' && types.includes('string'))
    || (typeof v === 'number' && Number.isFinite(v) && (types.includes('number') || (types.includes('integer') && Number.isInteger(v))))
    || (typeof v === 'boolean' && types.includes('boolean'));
  if (!ok) return `${at} has the wrong type.`;
  if (Array.isArray(schema.enum) && !schema.enum.includes(v)) return `${at} is not one of the allowed values.`;
  return null;
}

// Drops null values, at any depth, so a payload carries only what was given.
function dropNulls(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(dropNulls);
  if (isObj(v)) {
    const out: Obj = {};
    for (const [k, x] of Object.entries(v)) if (x !== null) out[k] = dropNulls(x);
    return out;
  }
  return v;
}

export type ToolCall = { rpc: string; args: Record<string, unknown> } | { error: string };

// One tool use → the SQL call that answers it, run as the member. Never runs anything itself.
export function toolCall(name: string, input: unknown): ToolCall {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) return { error: `There is no tool called ${name}.` };
  if (!isObj(input)) return { error: 'The tool input must be an object.' };
  const bad = mismatch(tool.input_schema as unknown as Obj, input, 'input');
  if (bad) return { error: bad };
  if ('summary' in input && !String(input.summary).trim()) return { error: 'summary is empty.' };

  const proposal = (kind: string, payload: Obj) => ({
    rpc: 'create_ai_proposal',
    args: { p_kind: kind, p_payload: dropNulls(payload), p_summary: String(input.summary).trim() },
  });
  switch (name) {
    case 'find_exercises':
      return { rpc: 'ai_coach_exercises', args: { p_muscle: input.muscle_group, p_equipment: input.equipment } };
    case 'get_my_routines':
      return { rpc: 'ai_coach_routines', args: {} };
    case 'get_my_schedule':
      return { rpc: 'ai_coach_schedule', args: {} };
    case 'propose_routine': {
      const { summary: _s, replace_routine_id, ...rest } = input;
      return replace_routine_id === null
        ? proposal('routine.create', rest)
        : proposal('routine.replace', { routine_id: replace_routine_id, ...rest });
    }
    case 'propose_schedule':
      return proposal('schedule.set', { days: input.days });
    case 'propose_goal': {
      const { summary: _s, ...rest } = input;
      return proposal('goal.create', rest);
    }
  }
  return { error: `There is no tool called ${name}.` };
}

// What a successful call tells the model. A reader that returns null means the member has not
// shared their training, which is an answer, not a failure.
export function toolResultText(rpc: string, data: unknown): string {
  if (rpc === 'create_ai_proposal') {
    return JSON.stringify({ proposal_id: data, status: 'Waiting on the member: they see a card with Apply or Discard. Nothing has changed yet.' });
  }
  if ((rpc === 'ai_coach_routines' || rpc === 'ai_coach_schedule') && data === null) {
    return JSON.stringify({ note: 'The member has not let you read their training, so you cannot see this. Ask them instead.' });
  }
  if (rpc === 'ai_coach_exercises' && Array.isArray(data) && data.length === 0) {
    return JSON.stringify({ exercises: [], note: 'Nothing matches. Try again with a filter set to null.' });
  }
  return JSON.stringify(data);
}

const REASONS: Record<string, { status: number; message: (s: CoachStatus) => string }> = {
  not_member: { status: 403, message: () => 'The coach is for members of this gym.' },
  switched_off: { status: 403, message: () => 'This gym does not use the coach.' },
  no_plan: { status: 403, message: () => 'The coach comes with a plan that includes it.' },
  daily_limit: { status: 429, message: (s) => `You have used today's ${s.daily_limit} messages with the coach. It opens again tomorrow.` },
  monthly_limit: { status: 429, message: () => 'The coach has reached this gym\'s limit for the month.' },
};

export function statusToHttp(s: CoachStatus): { status: number; body: { reason: string; message: string } } | null {
  if (s.allowed) return null;
  const r = REASONS[s.reason ?? ''] ?? { status: 403, message: () => 'The coach is not available.' };
  return { status: r.status, body: { reason: s.reason ?? 'unknown', message: r.message(s) } };
}

export function validQuestion(q: unknown): q is string {
  return typeof q === 'string' && q.trim().length > 0 && q.length <= 1000;
}

export function buildRequest(
  question: string, history: Turn[], context: Record<string, unknown> | null,
): { system: string; messages: Turn[] } {
  // The profile is what they told the coach at setup; every other key is their
  // training history, shared only with their consent. Label each for what it is.
  const { profile, ...shared } = (context ?? {}) as Record<string, unknown>;
  const parts: string[] = [];
  if (profile) parts.push(`WHAT THIS MEMBER TOLD YOU WHEN SETTING UP\n${JSON.stringify(profile)}`);
  if (Object.keys(shared).length) {
    parts.push(`WHAT YOU KNOW FROM THEIR TRAINING (they agreed to share it)\n${JSON.stringify(shared)}`);
  }
  const about = parts.length
    ? parts.join('\n\n')
    : 'You do not know anything about this member beyond this conversation. Ask what you need.';
  // The last ten turns, cleaned, starting on a user turn (the API requires it).
  let turns = history
    .filter((t) => (t.role === 'user' || t.role === 'assistant') && typeof t.content === 'string' && t.content.trim())
    .slice(-10)
    .map((t) => ({ role: t.role, content: t.content.slice(0, 4000) }));
  while (turns.length && turns[0].role !== 'user') turns = turns.slice(1);
  return { system: `${SYSTEM_PROMPT}\n\n${about}`, messages: [...turns, { role: 'user', content: question.trim() }] };
}

export function sse(event:
  | { type: 'text'; text: string }
  | { type: 'proposal'; id: string; kind: string; summary: string; payload: unknown }
  | { type: 'done' }
  | { type: 'error'; reason: string; message: string }): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}
