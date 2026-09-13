/**
 * Does the consent the member ticks actually reach the database (0079)?
 *
 * The SQL half is proved by replaying the trigger; this is the other half —
 * that `registerMember()` puts `terms_accepted` in the sign-up metadata the
 * trigger reads. A mismatch between the two names would leave every consent
 * NULL with nothing failing anywhere, which is the failure this file exists to
 * catch: the checkbox would still block the form, the page would still say
 * "I agree", and the gym would still have no record.
 *
 * Runs the real module through the dev server (`await import('/src/...')`),
 * with the network routed, so nothing reaches Supabase and no account is made.
 *
 * Playwright runner's `filename` argument, member dev server on :5173.
 */
async (page) => {
  await page.unrouteAll({ behavior: 'ignoreErrors' });

  const REF = 'ifwxtekyjgeljerslnzr';
  const signups = [];

  await page.route(`**://${REF}.supabase.co/**`, async (route) => {
    const req = route.request();
    const path = req.url().replace(/^https?:\/\/[^/]+/, '').split('?')[0];
    const cors = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };

    if (path.startsWith('/auth/v1/signup')) {
      let body = null;
      try { body = JSON.parse(req.postData() || 'null'); } catch { body = null; }
      signups.push(body);
      // No session, as with email confirmation on — registerMember's own
      // `signedIn: false` path, which is what really happens here.
      return route.fulfill({ status: 200, headers: cors, body: JSON.stringify({
        user: { id: 'new-user', email: body?.email ?? null }, session: null }) });
    }
    return route.fulfill({ status: 200, headers: cors, body: '[]' });
  });

  await page.goto('http://localhost:5173/login', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);

  const run = async (termsAccepted) => page.evaluate(async (accepted) => {
    const mod = await import('/src/lib/api/members.ts');
    try {
      await mod.registerMember({
        email: `consent-${accepted}@corefitness-test.com`,
        password: 'not-a-real-password',
        firstName: 'Consent', lastName: 'Check',
        termsAccepted: accepted,
      });
      return 'ok';
    } catch (e) {
      return String(e && e.message ? e.message : e);
    }
  }, termsAccepted);

  const results = [];
  const rec = (id, name, pass, detail) => results.push({ id, name, pass, detail });

  const outYes = await run(true);
  const yes = signups[signups.length - 1];
  rec('C1', 'Sign-up was attempted at all', signups.length === 1, `returned: ${outYes}`);
  rec('C2', 'The metadata carries terms_accepted',
    !!yes && yes.data && 'terms_accepted' in yes.data,
    yes && yes.data ? `keys: ${Object.keys(yes.data).join(', ')}` : 'no metadata');
  rec('C3', "A ticked box sends exactly 'true' — the string the trigger compares",
    !!yes && yes.data && yes.data.terms_accepted === 'true',
    yes && yes.data ? `got ${JSON.stringify(yes.data.terms_accepted)}` : '');

  await run(false);
  const no = signups[signups.length - 1];
  rec('C4', "An unticked box sends 'false', not nothing",
    !!no && no.data && no.data.terms_accepted === 'false',
    no && no.data ? `got ${JSON.stringify(no.data.terms_accepted)}` : '');

  // The point of C5: the trigger stamps on the string 'true' only. Anything
  // else — a boolean, a 1, a missing key — silently records no consent.
  rec('C5', 'It is a string, so `meta->>\'terms_accepted\' = \'true\'` matches',
    !!yes && yes.data && typeof yes.data.terms_accepted === 'string',
    yes && yes.data ? `typeof ${typeof yes.data.terms_accepted}` : '');

  const failed = results.filter((r) => !r.pass);
  const lines = results.map((r) => `${r.pass ? 'PASS' : 'FAIL'}  ${r.id}  ${r.name}${r.detail ? ' — ' + r.detail : ''}`);
  return `${lines.join('\n')}\n\n${results.length - failed.length}/${results.length} passed`;
}
