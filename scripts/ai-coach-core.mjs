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
check('the rules are in the prompt', /never state this gym's prices/i.test(core.SYSTEM_PROMPT)
  && /calorie/i.test(core.SYSTEM_PROMPT) && /injur/i.test(core.SYSTEM_PROMPT));

check('the profile injury rule is in the prompt', /has_injury is true/.test(core.SYSTEM_PROMPT));
check('sse frames one JSON line', core.sse({ type: 'text', text: 'a\nb' }) === 'data: {"type":"text","text":"a\\nb"}\n\n');
check('an empty question is refused', !core.validQuestion('   ') && !core.validQuestion(42));
check('a 1001-character question is refused', !core.validQuestion('x'.repeat(1001)) && core.validQuestion('x'.repeat(1000)));

console.log(failed ? `\n${failed} FAILED` : '\nai-coach core: all checks passed');
process.exit(failed ? 1 : 0);
