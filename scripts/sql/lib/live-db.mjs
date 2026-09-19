/**
 * The live schema in pglite: every migration in order, Supabase's own furniture
 * stubbed, Supabase's default grants reproduced. Shared by replay-migrations and
 * tenancy-isolation so neither drifts from the other.
 *
 * Only Supabase's own furniture is stubbed: the auth and storage schemas, the
 * roles, the realtime publication. Extensions pglite does not ship are turned
 * into no-ops; every migration here already treats pg_cron as optional.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

// Resolved from the working directory: see scripts/sql/README.md.
const requireFromCwd = createRequire(pathToFileURL(process.cwd() + '/'));
const { PGlite } = await import(pathToFileURL(requireFromCwd.resolve('@electric-sql/pglite')).href);

export const describe = (e) => [e.message, e.detail && `detail: ${e.detail}`, e.hint && `hint: ${e.hint}`,
  e.where && `where: ${e.where}`].filter(Boolean).join('\n   ');

const STUBS = `
create role anon; create role authenticated; create role service_role;
create role supabase_admin; create role authenticator; create role supabase_auth_admin;
create role supabase_storage_admin; create role dashboard_user;

create schema auth;
create table auth.users (
  instance_id uuid, id uuid primary key, aud text, role text, email text,
  encrypted_password text, email_confirmed_at timestamptz, invited_at timestamptz,
  confirmation_token text, confirmation_sent_at timestamptz, recovery_token text,
  recovery_sent_at timestamptz, email_change_token_new text, email_change text,
  email_change_sent_at timestamptz, last_sign_in_at timestamptz,
  raw_app_meta_data jsonb, raw_user_meta_data jsonb, is_super_admin boolean,
  created_at timestamptz, updated_at timestamptz, phone text unique, phone_confirmed_at timestamptz,
  phone_change text default '', phone_change_token text default '', phone_change_sent_at timestamptz,
  confirmed_at timestamptz, email_change_token_current text default '',
  email_change_confirm_status smallint default 0, banned_until timestamptz,
  reauthentication_token text default '', reauthentication_sent_at timestamptz,
  is_sso_user boolean not null default false, deleted_at timestamptz,
  is_anonymous boolean not null default false
);
create unique index users_email_partial_key on auth.users (email) where (is_sso_user = false);
create table auth.identities (
  id uuid primary key default gen_random_uuid(), user_id uuid references auth.users(id) on delete cascade,
  provider text, provider_id text, identity_data jsonb, created_at timestamptz, updated_at timestamptz
);
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create or replace function auth.role() returns text language sql stable as $$
  select nullif(current_setting('request.jwt.claim.role', true), '') $$;
create or replace function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
create or replace function auth.email() returns text language sql stable as $$
  select nullif(current_setting('request.jwt.claim.email', true), '') $$;

create schema storage;
create table storage.buckets (
  id text primary key, name text not null, owner uuid, public boolean default false,
  file_size_limit bigint, allowed_mime_types text[], avif_autodetection boolean default false,
  created_at timestamptz default now(), updated_at timestamptz default now()
);
create table storage.objects (
  id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id),
  name text, owner uuid, owner_id text, metadata jsonb, path_tokens text[],
  created_at timestamptz default now(), updated_at timestamptz default now(),
  last_accessed_at timestamptz default now(), version text
);
alter table storage.objects enable row level security;
create or replace function storage.foldername(name text) returns text[] language sql immutable as $$
  select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
create or replace function storage.filename(name text) returns text language sql immutable as $$
  select (string_to_array(name, '/'))[array_length(string_to_array(name, '/'), 1)] $$;
create or replace function storage.extension(name text) returns text language sql immutable as $$
  select reverse(split_part(reverse(name), '.', 1)) $$;

create schema extensions;
create publication supabase_realtime;
`;

// A real admin, as the live project has one. The sweep and the announcement
// history both look for admins.
const ADMIN = 'a0000000-0000-4000-9000-00000000ad01';
const ADMIN_FIXTURE = `
insert into auth.users (id, email, raw_user_meta_data) values ('${ADMIN}', 'admin@realgym.ph', '{}');
insert into profiles (id, role, first_name, last_name, email, status)
  values ('${ADMIN}', 'admin', 'Real', 'Admin', 'admin@realgym.ph', 'active')
  on conflict (id) do update set role = 'admin', status = 'active';
`;

// Extensions pglite cannot load become no-ops. Migrations already guard their
// use of pg_cron and pg_net behind existence checks.
const prep = (sql) => sql.replace(/create\s+extension[^;]*;/gi, 'select 1;');

// The demo seeds were written for, and pasted live on, the schema before
// tenancy (0097). They run at that point here too, so the tenancy backfills
// meet the demo rows exactly as they do live.
const SEEDS_BEFORE = '0097';

const GRANTS = `
  grant usage on schema public to anon, authenticated;
  grant all on all tables in schema public to anon, authenticated;
  grant all on all sequences in schema public to anon, authenticated;
  grant execute on all functions in schema public to authenticated;`;

/** Every migration, Supabase's grants, the real admin and the named seeds. Throws on the first failure. */
export async function liveDb(repo, { seeds = [], log = () => {} } = {}) {
  const MIG = `${repo}/supabase/migrations`;
  const db = await PGlite.create();
  await db.exec(STUBS);
  const files = readdirSync(MIG).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort();
  let seeded = false;
  const seed = async () => {
    // Supabase grants these by default; pglite does not, and without them a
    // test role can reach nothing, so every check passes for the wrong reason.
    // Execute goes to authenticated only: a blanket grant to anon would undo
    // each migration's `revoke ... from anon`; what anon may call, its
    // migration grants.
    await db.exec(GRANTS);
    await db.exec(ADMIN_FIXTURE).catch((e) => log('admin fixture: ' + describe(e)));
    for (const s of seeds) {
      try { await db.exec(readFileSync(`${repo}/scripts/demo-data/${s}`, 'utf8')); log(`SEED OK: ${s}`); }
      catch (e) { throw new Error(`SEED FAILED: ${s}
   ${describe(e)}`); }
    }
    seeded = true;
  };
  for (const f of files) {
    if (!seeded && f >= SEEDS_BEFORE) await seed();
    try { await db.exec(prep(readFileSync(`${MIG}/${f}`, 'utf8'))); }
    catch (e) { throw new Error(`MIGRATION FAILED: ${f}
   ${describe(e)}`); }
  }
  if (!seeded) await seed();
  await db.exec(GRANTS);   // again, for everything created after the seeds
  log(`applied ${files.length}/${files.length} migrations`);
  return db;
}
