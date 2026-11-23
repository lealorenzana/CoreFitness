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

  // ---- 2026-11-23: how THIS gym runs, the real tabs, and readings ----
  const g = await page.evaluate(async () => {
    const m = await import('/src/data/memberAssistant.ts');
    // Core Fitness Lab's own settings (read 2026-11-23), and the same gym with classes off.
    const row = { closed_days: [0], coaching_approval: 'coach', coaching_lengths: [1, 3, 6], coaching_modes: ['classes', 'coach_invites', 'desk_assigns', 'pick_pt'],
      coaching_fee_mode: 'included', day_pass_on: true, day_pass_price: '150.00', pack5_price: '650.00', pack10_price: '1200.00',
      max_freeze_days_per_year: 60, max_freeze_days_at_once: 30, refund_processing_fee: '0.00', pt_cancel_minutes: 0 };
    const on = (keys) => (k) => keys.includes(k);
    const lab = m.toGymSetup(row, on(['classes', 'coaching', 'requests', 'slots']), { classMode: 'coach_desk', ptMode: 'coach_desk' });
    const ptOnly = m.toGymSetup(row, on(['coaching', 'requests']), { classMode: 'coach_desk', ptMode: 'coach' });
    const ctx = (setup) => ({ ...m.EMPTY_CONTEXT, gym: { name: 'Core Fitness Lab', address: null, phone: null, email: null, openingTime: '06:00', closingTime: '23:00' }, setup });
    const Q = "ehats the difference of session, bookings and packages in this gym core fitness lab?";
    return {
      fallback: m.RULE_FALLBACK,
      diffCoach: m.answerFor(Q, ctx(lab), { coach: true }),
      diffLab: m.answerFor(Q, ctx(lab)),
      diffPt: m.answerFor(Q, ctx(ptOnly)),
      bookPt: m.answerFor('How do I book a session?', ctx(ptOnly)),
      bookCoachOn: m.answerFor('How do I book a class?', ctx(lab), { coach: true }),
      hours: m.answerFor('What time do you open?', ctx(lab)),
      freeze: m.answerFor('How do I freeze my membership?', ctx(lab)),
      pass: m.answerFor('How much is a day pass?', ctx(lab)),
      zumba: m.answerFor('Do you have zumba?', ctx(ptOnly)),
      chips: m.suggestionsFor(ctx(ptOnly)),
      fromCoach: m.readingFromValues({ weight_kg: 72, bmi: 22, waist_cm: 5, calf_cm: '38' }, 'today'),
      fromCoachNone: m.readingFromValues({ weight_kg: 1000 }, 'today'),
      readings: [
        ['log my weight 72 kg', m.readingFrom('log my weight 72 kg')],
        ['I weigh 68.5 today', m.readingFrom('I weigh 68.5 today')],
        ['record waist 80 cm and chest 101 cm', m.readingFrom('record waist 80 cm and chest 101 cm')],
        ['my body fat is 18% and forearm 30cm', m.readingFrom('my body fat is 18% and forearm 30cm')],
        ['how do I log my weight?', m.readingFrom('how do I log my weight?')],
        ['log my weight 160 lbs', m.readingFrom('log my weight 160 lbs')],
        ['log arms 45 minutes', m.readingFrom('log arms 45 minutes')],
        ['log my weight 900', m.readingFrom('log my weight 900')],
        ['save my weight yesterday 71', m.readingFrom('save my weight yesterday 71')],
      ],
    };
  });
  const tick = (label, ok) => out.push(`${label}: ${ok ? 'yes' : 'NO'}`);
  tick('coach on, "difference of session, bookings and packages" goes to the coach', g.diffCoach === g.fallback);
  tick('coach off, the difference is answered from the gym, on the real tabs', /Ask your coach for a session/.test(g.diffLab)
    && /A package/.test(g.diffLab) && /A booking/.test(g.diffLab) && /coach says yes first, then the front desk/.test(g.diffLab)
    && /1, 3 or 6 months/.test(g.diffLab) && /Train → Classes/.test(g.diffLab) && !/Book a Session|bottom bar/.test(g.diffLab));
  tick('a personal-training-only gym is never sent to classes', !/class/i.test(g.diffPt.replace(/classes/g, '')) && !/Train → Classes/.test(g.diffPt) && !/Train → Classes/.test(g.bookPt));
  tick('a plain fact still stays with the rules while the coach is on', g.bookCoachOn !== g.fallback && /Train → Coach/.test(g.bookCoachOn));
  tick('hours carry the closed day', /6:00 AM to 11:00 PM/.test(g.hours) && /Closed on \*\*Sunday\*\*/.test(g.hours));
  tick('freezing names Pause or cancel and the gym\'s limits', /You → Membership → Pause or cancel/.test(g.freeze) && /30 days/.test(g.freeze) && /60 days/.test(g.freeze));
  tick('a day pass is priced from settings', /₱150/.test(g.pass) && /₱650/.test(g.pass) && /₱1,200/.test(g.pass));
  tick('a named class at a gym without classes says so', /does not run group classes/.test(g.zumba));
  tick('the chips offer a session, not a class, without classes', g.chips.includes('How do I book a session?') && !g.chips.includes('How do I book a class?'));
  tick('the coach\'s reading keeps only known fields in range', JSON.stringify(g.fromCoach?.values) === '{"weight_kg":72}' && g.fromCoachNone === null);
  const R = Object.fromEntries(g.readings);
  tick('"log my weight 72 kg" is a 72 kg reading', R['log my weight 72 kg']?.values.weight_kg === 72);
  tick('"I weigh 68.5 today" is a 68.5 kg reading', R['I weigh 68.5 today']?.values.weight_kg === 68.5);
  tick('waist and chest together', R['record waist 80 cm and chest 101 cm']?.values.waist_cm === 80 && R['record waist 80 cm and chest 101 cm']?.values.chest_cm === 101);
  tick('body fat and forearm, never read as arms', R['my body fat is 18% and forearm 30cm']?.values.body_fat_pct === 18
    && R['my body fat is 18% and forearm 30cm']?.values.forearm_cm === 30 && R['my body fat is 18% and forearm 30cm']?.values.arms_cm == null);
  tick('a how-to question is not a reading', R['how do I log my weight?'] === null);
  tick('pounds are never converted', R['log my weight 160 lbs'] === null);
  tick('minutes are not a measurement', R['log arms 45 minutes'] === null);
  tick('an impossible number is not saved', R['log my weight 900'] === null);
  tick('"yesterday" is yesterday', R['save my weight yesterday 71']?.measuredOn === 'yesterday' && R['save my weight yesterday 71']?.values.weight_kg === 71);
  return out.join('\n');
}
