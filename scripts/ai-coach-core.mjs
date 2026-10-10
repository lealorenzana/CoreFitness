// node --experimental-strip-types scripts/ai-coach-core.mjs
const core = await import(new URL('../supabase/functions/ai-coach/core.ts', import.meta.url).href);
let failed = 0;
const check = (label, ok, detail = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : '  — ' + detail}`); if (!ok) failed++; };
const base = { gym_id: 'g', allowed: true, reason: null, used_today: 0, daily_limit: 30, used_month: 0, monthly_limit: 1500, consent: null };

check('allowed → no error response', core.statusToHttp(base) === null);
check('no plan → 403', core.statusToHttp({ ...base, allowed: false, reason: 'no_plan' })?.status === 403);
check('switched off → 403', core.statusToHttp({ ...base, allowed: false, reason: 'switched_off' })?.status === 403);
check('daily limit → 429 and says the number',
  core.statusToHttp({ ...base, allowed: false, reason: 'daily_limit', used_today: 30 })?.status === 429
  && /30/.test(core.statusToHttp({ ...base, allowed: false, reason: 'daily_limit', used_today: 30 }).body.message));
check('an unknown reason still refuses', core.statusToHttp({ ...base, allowed: false, reason: 'weird' })?.status === 403);

const noCtx = core.buildRequest('How do I brace?', [], null);
check('the question is the last user turn', noCtx.messages.at(-1).role === 'user' && noCtx.messages.at(-1).content === 'How do I brace?');
check('no context → the prompt says it knows nothing about them', /do not know anything about this member/i.test(noCtx.system));
const withCtx = core.buildRequest('Plan my week', [{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'hello' }],
  { first_name: 'Lea', goals: ['Squat my bodyweight'] });
check('context is included when given', /Lea/.test(withCtx.system) && /Squat my bodyweight/.test(withCtx.system));
const profOnly = core.buildRequest('Plan my week', [], { profile: { goal: 'muscle' } });
check('a profile-only context is labelled as what they told the coach, not as shared training',
  /WHEN SETTING UP/.test(profOnly.system) && /muscle/.test(profOnly.system) && !/agreed to share/.test(profOnly.system));
const both = core.buildRequest('q', [], { profile: { goal: 'muscle' }, goals: ['Squat'] });
check('profile plus history gets both labels, history with the consent note',
  /WHEN SETTING UP/.test(both.system) && /FROM THEIR TRAINING \(they agreed to share it\)/.test(both.system) && /Squat/.test(both.system));
check('history keeps order and is capped at 10 turns',
  core.buildRequest('q', Array.from({ length: 30 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: String(i) })), null)
    .messages.length <= 11);
check('history never starts with an assistant turn',
  core.buildRequest('q', [{ role: 'assistant', content: 'x' }, { role: 'user', content: 'y' }], null).messages[0].role === 'user');
// 0177: gym facts come only from get_gym_info, and anything it does not say is "I don't know".
check('the rules are in the prompt', /ONLY from get_gym_info/.test(core.SYSTEM_PROMPT) && /say you do not know/i.test(core.SYSTEM_PROMPT)
  && /calorie/i.test(core.SYSTEM_PROMPT) && /injur/i.test(core.SYSTEM_PROMPT));

check('the profile injury rule is in the prompt', /has_injury is true/.test(core.SYSTEM_PROMPT));
check('sse frames one JSON line', core.sse({ type: 'text', text: 'a\nb' }) === 'data: {"type":"text","text":"a\\nb"}\n\n');
check('an empty question is refused', !core.validQuestion('   ') && !core.validQuestion(42));
check('a 1001-character question is refused', !core.validQuestion('x'.repeat(1001)) && core.validQuestion('x'.repeat(1000)));

// ---- Phase 3: the tools ----
const tools = core.TOOLS ?? [];
const names = tools.map((t) => t.name).sort().join(',');
check('the thirteen tools are defined',
  names === 'find_exercises,get_gym_info,get_my_bookings,get_my_progress,get_my_routines,get_my_schedule,propose_booking,propose_cancel_booking,propose_goal,propose_log,propose_program,propose_routine,propose_schedule', names);
// Every object in a strict schema must close its properties and require every one of them.
const closed = (s) => {
  if (!s || typeof s !== 'object') return true;
  if (s.type === 'object' || (Array.isArray(s.type) && s.type.includes('object'))) {
    const keys = Object.keys(s.properties ?? {});
    if (s.additionalProperties !== false) return false;
    if (keys.slice().sort().join(',') !== (s.required ?? []).slice().sort().join(',')) return false;
    if (!keys.every((k) => closed(s.properties[k]))) return false;
  }
  if (s.items) return closed(s.items);
  return true;
};
check('every tool is strict, closed, and requires every property',
  tools.length === 13 && tools.every((t) => t.strict === true && t.input_schema?.additionalProperties === false && closed(t.input_schema)));
check('MAX_ROUNDS is 6', core.MAX_ROUNDS === 6);
// 0177: the new tools map to their readers and proposals, and nothing else.
const tc = (n, i) => core.toolCall(n, i);
check('get_gym_info reads ai_coach_gym_info', tc('get_gym_info', {}).rpc === 'ai_coach_gym_info');
check('get_my_progress reads ai_coach_progress', tc('get_my_progress', {}).rpc === 'ai_coach_progress');
check('propose_booking becomes a booking.create proposal',
  tc('propose_booking', { summary: 'Book HIIT', class_id: 'c1' }).args?.p_kind === 'booking.create');
check('propose_program becomes a program.create proposal', tc('propose_program', { summary: 'A program', name: 'P', weeks: 4, deload_every: null, notes: null,
  sessions: [{ day_of_week: 1, name: 'Legs', exercises: [{ exercise_id: 'e', target_sets: 3, target_reps: 8, target_weight_kg: 40, target_seconds: null, rest_seconds: 90, progress_kind: 'weight', progress_step: 2.5 }] }] }).args?.p_kind === 'program.create');
check('progress without consent says so, not an error', /not let you read/.test(core.toolResultText('ai_coach_progress', null)));
// Nullable values are anyOf [{ type }, { type: 'null' }] — never a type array, anywhere.
const typeArrays = [];
const nullables = [];
const walk = (s, at) => {
  if (!s || typeof s !== 'object') return;
  if (Array.isArray(s.type)) typeArrays.push(at);
  if (Array.isArray(s.anyOf) && s.anyOf.some((b) => b.type === 'null')) nullables.push(at);
  for (const [k, v] of Object.entries(s)) if (v && typeof v === 'object') walk(v, `${at}.${k}`);
};
for (const t of tools) walk(t.input_schema, t.name);
check('no schema uses a type array; nullables are anyOf with a null branch',
  typeArrays.length === 0 && nullables.length >= 12, JSON.stringify({ typeArrays, n: nullables.length }));
check('an anyOf-nullable still refuses the wrong type (a number for a string id)',
  typeof core.toolCall('find_exercises', { muscle_group: 7, equipment: null }).error === 'string'
  && typeof core.toolCall('find_exercises', { equipment: null }).error === 'string');
check('the prompt says a proposed routine has no id until applied',
  core.SYSTEM_PROMPT.includes('A routine you propose has no id until the member applies it — propose the routine first, and propose a schedule that uses it only after they have applied it.'));

const ex = { exercise_id: '11111111-1111-4111-8111-111111111111', custom_name: null, target_sets: 3, target_reps: 10,
  target_weight_kg: null, target_seconds: null, rest_seconds: 90 };
const routine = { summary: 'A three-day full-body routine.', replace_routine_id: null, name: 'Full body A', notes: null,
  exercises: [ex, { exercise_id: null, custom_name: 'Farmer carry', target_sets: 2, target_reps: null,
    target_weight_kg: 20, target_seconds: 40, rest_seconds: 60 }] };
const hasNull = (v) => v === null || (typeof v === 'object' && Object.values(v).some(hasNull));
const rc = core.toolCall('propose_routine', routine);
check('propose_routine with no id → create_ai_proposal, kind routine.create',
  rc.rpc === 'create_ai_proposal' && rc.args.p_kind === 'routine.create' && rc.args.p_summary === routine.summary, JSON.stringify(rc));
check('…and the payload has no summary and no null keys, at any depth',
  rc.args && !('summary' in rc.args.p_payload) && !('replace_routine_id' in rc.args.p_payload) && !hasNull(rc.args.p_payload)
  && rc.args.p_payload.exercises.length === 2 && rc.args.p_payload.exercises[1].custom_name === 'Farmer carry'
  && !('routine_id' in rc.args.p_payload), JSON.stringify(rc.args?.p_payload));
const rr = core.toolCall('propose_routine', { ...routine, replace_routine_id: '22222222-2222-4222-8222-222222222222' });
check('propose_routine with an id → routine.replace with routine_id in the payload',
  rr.args?.p_kind === 'routine.replace' && rr.args.p_payload.routine_id === '22222222-2222-4222-8222-222222222222', JSON.stringify(rr));
const sc = core.toolCall('propose_schedule', { summary: 'Train Monday and Thursday.',
  days: [{ day_of_week: 1, routine_id: null, remind_at: '17:00' }, { day_of_week: 4, routine_id: null, remind_at: null }] });
check('propose_schedule → schedule.set, nulls dropped from each day',
  sc.rpc === 'create_ai_proposal' && sc.args.p_kind === 'schedule.set' && sc.args.p_payload.days.length === 2
  && !hasNull(sc.args.p_payload) && sc.args.p_payload.days[0].remind_at === '17:00' && !('summary' in sc.args.p_payload), JSON.stringify(sc));
const gc = core.toolCall('propose_goal', { summary: 'Train three times a week.', title: 'Three a week', metric: 'workouts_per_week',
  start_value: null, target_value: 3, target_date: null });
check('propose_goal → goal.create with the nulls dropped',
  gc.args?.p_kind === 'goal.create' && gc.args.p_payload.target_value === 3 && !hasNull(gc.args.p_payload)
  && !('summary' in gc.args.p_payload), JSON.stringify(gc));
const fe = core.toolCall('find_exercises', { muscle_group: 'chest', equipment: null });
check('find_exercises → ai_coach_exercises with p_muscle / p_equipment',
  fe.rpc === 'ai_coach_exercises' && fe.args.p_muscle === 'chest' && fe.args.p_equipment === null, JSON.stringify(fe));
check('get_my_routines / get_my_schedule → their readers, no arguments',
  core.toolCall('get_my_routines', {}).rpc === 'ai_coach_routines' && core.toolCall('get_my_schedule', {}).rpc === 'ai_coach_schedule');
check('an unknown tool → an error', typeof core.toolCall('delete_everything', {}).error === 'string');
check('a malformed input → an error, never an rpc',
  typeof core.toolCall('propose_routine', { ...routine, exercises: 'lots' }).error === 'string'
  && typeof core.toolCall('propose_goal', { summary: 'x', title: 'x', metric: 'x', start_value: 'ten', target_value: null, target_date: null }).error === 'string'
  && typeof core.toolCall('propose_schedule', { summary: 'x', days: [{ day_of_week: 1.5, routine_id: null, remind_at: null }] }).error === 'string'
  && typeof core.toolCall('find_exercises', null).error === 'string'
  && typeof core.toolCall('propose_routine', { ...routine, summary: '' }).error === 'string');
check('the prompt says nothing changes until Apply', /nothing changes until they tap Apply/.test(core.SYSTEM_PROMPT));
check('the prompt keeps the injury rule for proposals', /Never propose a change because of an injury or pain\./.test(core.SYSTEM_PROMPT));
check('sse frames a proposal as one JSON line',
  core.sse({ type: 'proposal', id: 'p1', kind: 'goal.create', summary: 's', payload: { title: 't' } })
    === 'data: {"type":"proposal","id":"p1","kind":"goal.create","summary":"s","payload":{"title":"t"}}\n\n');

// ---- Meal guides were retired (0166, 2026-10-05) ----
check('the coach has no meal tool and its prompt never mentions meals',
  !tools.some((t) => t.name === 'propose_meals') && !/meal/i.test(core.SYSTEM_PROMPT));
check('a propose_meals call is not a tool', typeof core.toolCall('propose_meals', { summary: 'x', sections: [] }).error === 'string');

console.log(failed ? `\n${failed} FAILED` : '\nai-coach core: all checks passed');
process.exit(failed ? 1 : 0);
