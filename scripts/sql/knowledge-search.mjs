/**
 * 0282: the assistants' search. Keyword and meaning rankings merged; with no question embedding the
 * keyword ranking answers alone; a question with no shared words is found by meaning; members read
 * member texts, the desk adds staff texts, the owner adds the plans; a gym's waiver and house rules
 * reach only its own people; stale embeddings are listed, saved and never used once the words change;
 * nobody but the service role writes. Embeddings here are made-up unit vectors (the real gte-small
 * runs only in Edge Functions): this proves the SQL, not the model.
 *
 *   node <repo>/scripts/sql/knowledge-search.mjs "<repo>"   (from a dir with pglite + pglite-pgvector)
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { liveDb, describe } from './lib/live-db.mjs';

const REPO = process.argv[2];
const db = await liveDb(REPO);
const GYM = 'c0f1e55e-0000-4000-8000-000000000001';
const GYM2 = 'c0f1e55e-0000-4000-8000-000000000282';
const id = (n) => `a2820000-0000-4000-8000-0000000000${n}`;
const M = id('0a'), DESK = id('0b'), OWN = id('0c'), M2 = id('0d'), NOGYM = id('0e');
let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : '  — ' + detail}`);
  if (!ok) failures++;
};
const one = async (sql) => (await db.query(sql)).rows[0];
const all = async (sql) => (await db.query(sql)).rows;
const tryExec = async (sql) => { try { await db.exec(sql); return null; } catch (e) { return describe(e); } };
const as = (uid) => db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid}', false); set role authenticated;`);
const service = () => db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false); set role service_role;`);
const owner = () => db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
/** A 384-number unit vector pointing along axis i. */
const axis = (i) => `'[${Array.from({ length: 384 }, (_, k) => (k === i ? 1 : 0)).join(',')}]'::extensions.vector`;

await owner();
await db.exec(`
  insert into gyms (id, slug, name) values ('${GYM2}', 'other-0282-gym', 'Other Gym') on conflict do nothing;
  insert into gym_settings (gym_id, gym_name) select '${GYM2}', 'Other Gym' where not exists (select 1 from gym_settings where gym_id = '${GYM2}');
  ${[['m', M, GYM, 'member'], ['desk', DESK, GYM, 'staff'], ['own', OWN, GYM, 'admin'], ['m2', M2, GYM2, 'member'], ['nogym', NOGYM, null, null]].map(([k, u, g, r]) => `
    insert into auth.users (id, email, raw_user_meta_data) values ('${u}', '${k}@0282-test.com', '{}');
    insert into profiles (id, first_name, last_name, email, status, role, active_gym_id)
      values ('${u}', '${k}', 'T', '${k}@0282-test.com', 'active', 'member', ${g ? `'${g}'` : 'null'}) on conflict (id) do nothing;
    delete from gym_roles where user_id = '${u}';
    ${g ? `insert into gym_roles (gym_id, user_id, role, status) values ('${g}', '${u}', '${r}', 'active') on conflict do nothing;` : ''}`).join('\n')}
  insert into gym_waivers (gym_id, version, title, body, published_at) values
    ('${GYM}', 1, 'Liability waiver', 'I accept the risks of training with barbells and kettlebells at this gym.\n\nI will tell the coach about any injury before a session.', now()),
    ('${GYM2}', 1, 'Other waiver', 'Zorbex clause: members of the other gym swim at their own risk in the pool.', now());
`);

const texts = readFileSync(join(REPO, 'supabase', 'knowledge', 'texts.sql'), 'utf8');
let err = await tryExec(texts);
check('the generated texts load', err === null, err);
const n = Number((await one(`select count(*) n from knowledge_chunks`)).n);
check('…every Terms and Privacy section and guide step', n > 60, String(n));
check('…and record which texts are live', /^[0-9a-f]{16}$/.test((await one(`select knowledge_texts_hash() h`)).h ?? ''));

// ---- keyword only ----------------------------------------------------------------------------------
await as(M);
const kw = await all(`select ref from search_knowledge('photography of other people', null)`);
check('keyword search finds the clause by its words, with no embedding', kw[0]?.ref === 'terms:using', JSON.stringify(kw));
check('a member reads Terms citations with a link', (await one(`select link from search_knowledge('photography', null) limit 1`)).link === '/terms#using');

// ---- meaning ---------------------------------------------------------------------------------------
await service();
const stale = await all(`select ref from knowledge_stale(100)`);
check('every text starts stale (nothing embedded yet)', stale.length >= 25, String(stale.length));
await owner();
// Every shared text points one way, the freeze clause another; the question points like the freeze clause.
await db.exec(`update knowledge_chunks set embedding = ${axis(200)}, embedded_hash = body_hash`);
await db.exec(`update knowledge_chunks set embedding = ${axis(5)} where id = 'terms:freezing'`);
await as(M);
const mean = await all(`select ref from search_knowledge('pwede ba i-pause', ${axis(5)})`);
check('a question sharing no words with the clause finds it by meaning', mean[0]?.ref === 'terms:freezing', JSON.stringify(mean));
const both = await all(`select ref, score from search_knowledge('photography', ${axis(5)})`);
check('both rankings merge: the keyword hit and the meaning hit both come back',
  both.some((r) => r.ref === 'terms:using') && both.some((r) => r.ref === 'terms:freezing'), JSON.stringify(both));
await owner();
await db.exec(`update knowledge_chunks set body = body || ' Changed.' where id = 'terms:freezing'`);
await as(M);
check('changed words make an embedding unusable until it is made again',
  !(await all(`select ref from search_knowledge('pwede ba i-pause', ${axis(5)})`)).some((r) => r.ref === 'terms:freezing'));
await service();
check('…and list it as stale', (await all(`select ref from knowledge_stale(100)`)).some((r) => r.ref === 'terms:freezing'));
await owner();
const h = (await one(`select body_hash from knowledge_chunks where id = 'terms:freezing'`)).body_hash;
await service();
check('the service role saves the new embedding', (await one(`select knowledge_save_embedding('terms:freezing', null, '${h}', ${axis(5)}) ok`)).ok === true);
check('…but not one made from older words', (await one(`select knowledge_save_embedding('terms:freezing', null, 'oldhash', ${axis(9)}) ok`)).ok === false);

// ---- who reads what --------------------------------------------------------------------------------
const refs = async (uid, q) => { await as(uid); return (await all(`select ref from search_knowledge('${q}', null, 10)`)).map((r) => r.ref); };
check('a member does not read the owner guides', !(await refs(M, 'PayMongo secret key')).some((r) => r.startsWith('guide:online-pay')));
check('the desk reads the owner guides', (await refs(DESK, 'PayMongo secret key')).some((r) => r.startsWith('guide:online-pay')));
check('only the owner reads Core Fitness plans', (await refs(OWN, 'plans gym month')).includes('platform:plans')
  && !(await refs(DESK, 'plans gym month')).includes('platform:plans') && !(await refs(M, 'plans gym month')).includes('platform:plans'));
check('everyone in a gym can find how to reach Core Fitness', (await refs(M, 'reach about app')).includes('platform:contact'));
check('a member reads their gym\'s waiver', (await refs(M, 'kettlebells injury')).some((r) => r.startsWith('waiver:')));
check('another gym\'s waiver never reaches them', !(await refs(M, 'Zorbex pool swim')).some((r) => r.startsWith('waiver:')));
check('…while that gym\'s member finds it', (await refs(M2, 'Zorbex pool swim')).some((r) => r.startsWith('waiver:')));
await as(NOGYM);
check('no gym, no search', /Sign in to a gym/.test(await tryExec(`select * from search_knowledge('freeze', null)`) ?? ''));

// ---- nobody but the service role writes or reads the tables ----------------------------------------
await as(OWN);
check('an owner cannot read the library directly', !!(await tryExec(`select * from knowledge_chunks`)));
check('…nor write it', !!(await tryExec(`update knowledge_chunks set body = 'x'`)));
check('…nor save embeddings', !!(await tryExec(`select knowledge_save_embedding('terms:using', null, 'x', ${axis(1)})`)));
check('…nor list stale texts', !!(await tryExec(`select * from knowledge_stale(5)`)));
await db.exec(`reset role; set role anon`);
check('a visitor cannot search', !!(await tryExec(`select * from search_knowledge('freeze', null)`)));
check('the probe marker answers a visitor', (await one(`select migration_0282_applied() ok`)).ok === true);

// ---- a new waiver version: old paragraphs' vectors are swept, never returned -------------------------
await service();
const w = (await all(`select ref, gym_id, body_hash from knowledge_stale(100) where ref like 'waiver:%'`));
for (const r of w) await db.exec(`select knowledge_save_embedding('${r.ref}', ${r.gym_id ? `'${r.gym_id}'` : 'null'}, '${r.body_hash}', ${axis(7)})`);
await owner();
await db.exec(`insert into gym_waivers (gym_id, version, title, body, published_at) values ('${GYM}', 2, 'Liability waiver', 'A whole new version of the waiver text for version two.', now())`);
await service();
check('a new waiver version sweeps the old paragraphs\' vectors', (await one(`select knowledge_sweep() n`)).n >= 1);

await owner();
check('0282 can run twice', (await tryExec(readFileSync(join(REPO, 'supabase', 'migrations', '0282_knowledge_search.sql'), 'utf-8'))) === null);
check('the texts can be pasted twice', (await tryExec(texts)) === null);

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
