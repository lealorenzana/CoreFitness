/**
 * The assistant's routing while the AI coach can talk (`answerFor(q, ctx, { coach: true })`).
 *
 * Seen live: "propose a Mon/Wed/Fri schedule" was answered by the booking help
 * text, "set a goal to work out 3 times a week" by the goals help, "propose a
 * training plan" by the PRICE list, "make me a meal plan" by the diet tip —
 * keywords in the rule table caught requests meant for the coach. With the
 * coach on, a request to make or change something and the general form/eating
 * questions fall through (the fallback is what sends a message to the coach);
 * facts, and the injury referral, stay the rules'. With the coach off nothing
 * may change: the popup and members without the coach answer exactly as before.
 *
 * No login: the module is imported through the member dev server (:5173).
 */
async (page) => {
  await page.goto('http://localhost:5173/login', { waitUntil: 'domcontentloaded' });
  const r = await page.evaluate(async () => {
    const m = await import('/src/data/memberAssistant.ts');
    if (typeof m.answerFor !== 'function' || !m.EMPTY_CONTEXT) return { missing: true };
    const ctx = m.EMPTY_CONTEXT;
    const toCoach = [
      'Please propose a Mon/Wed/Fri schedule using that routine with a 6:30 AM reminder',
      'Also set a goal to work out 3 times a week',
      'propose a training plan for me',
      'make me a meal plan',
      'how do I fix my squat technique?',
      'what should I eat after training?',
      'Can you build me a 3 day split?',
    ];
    const facts = [
      'What time do you open?',
      'How much is the premium plan?',
      'What is my check-in code?',
      'When does my membership expire?',
      'How do I book a class?',
      'Where are you located?',
      'my knee hurts when I squat',
      'How do I earn points?',
    ];
    const row = (q) => {
      const plain = m.answerFor(q, ctx);
      return {
        q,
        plain,
        off: m.answerFor(q, ctx, { coach: false }),
        on: m.answerFor(q, ctx, { coach: true }),
      };
    };
    return {
      toCoach: toCoach.map(row),
      facts: facts.map(row),
      isFallback: [...toCoach, ...facts].map((q) => [q, m.isRuleFallback(m.answerFor(q, ctx))]),
      fallback: m.RULE_FALLBACK,
    };
  });
  if (r.missing) return 'memberAssistant exports: MISSING answerFor or EMPTY_CONTEXT';

  const out = [];
  const fb = (a) => a === r.fallback;
  for (const x of r.toCoach) {
    out.push(`coach on, "${x.q}" → ${fb(x.on) ? 'the coach' : 'NO: a rule answered — ' + x.on.slice(0, 60)}`);
  }
  for (const x of r.facts) {
    const injury = /hurts/.test(x.q);
    const ok = !fb(x.on) && x.on === x.plain
      && (!injury || /doctor or physiotherapist/.test(x.on));
    out.push(`coach on, "${x.q}" → ${ok ? 'the rules, as before' : 'NO: ' + (fb(x.on) ? 'sent to the coach' : 'a different answer — ' + x.on.slice(0, 60))}`);
  }
  for (const x of [...r.toCoach, ...r.facts]) {
    out.push(`coach off, "${x.q}" → ${x.off === x.plain ? 'unchanged' : 'NO: the default path changed'}`);
  }
  // Pin the old behaviour of the live examples: without the coach these were
  // (and must still be) answered by a rule, not the fallback.
  const before = new Map(r.isFallback);
  for (const q of ['Please propose a Mon/Wed/Fri schedule using that routine with a 6:30 AM reminder',
    'Also set a goal to work out 3 times a week', 'propose a training plan for me', 'make me a meal plan',
    'how do I fix my squat technique?', 'what should I eat after training?']) {
    out.push(`coach off, "${q}" still a rule's: ${before.get(q) === false ? 'yes' : 'NO'}`);
  }
  return out.join('\n');
}
