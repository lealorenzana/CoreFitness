# Reading business documents (OCR), phase 1

Status: PLAN, decisions settled (end of file). Nothing is built.

## Goal
When an applicant attaches one of the six business documents on the site, the system reads it,
fills in the expiry date for them to confirm, and shows the platform owner what it read next to
the file, with warnings when something does not add up. **A person still clicks Verified.** The
reading suggests; it never verifies, never rejects and never blocks an upload.

## Acceptance criteria
Testable:
1. Attaching a readable permit, barangay clearance or ID fills the expiry field with the read date;
   the applicant can change it before attaching. An unreadable photo says so at once ("We could
   not read this. A sharper photo helps.") and still lets them attach and type the date.
2. If the reading service is down, unset or over its limit, upload works exactly as it does today.
3. The platform's application review shows, per document: what was read (business name, owner
   name, TIN or registration number, issue and expiry dates) and these warnings:
   - the document looks like a different kind than its slot (a clearance in the BIR slot);
   - the business name differs from the application's gym name;
   - the name on the owner's ID differs from the application's owner name;
   - the typed expiry differs from the read expiry;
   - the Mayor's permit is not for this year;
   - the file could not be read.
4. An applicant cannot read, write or fake a reading: the table has RLS on and no policy, writes
   come only from the Edge Function with the service key, reads only through a platform definer
   function. Red team suite stays green.
5. Readings are capped per application (abuse costs the platform API money).
6. Readings disappear with the application (cascade), so 0225's account deletion still erases all.

Needs the owner's judgment: whether the warnings are useful or noisy on real Philippine documents.

## What exists (read 2026-11-27)
- `application_documents` (0187, 0223): `kind` in permit, dti_sec, bir_2303, barangay, owner_id,
  front_photo; `expires_on` typed by the applicant; status draft → pending → verified/rejected/requested.
- Bucket `applications`, private, 10 MB, jpeg/png/webp/pdf; path `<application id>/<kind>-<ms>.<ext>`.
- Site `corefitness-site/src/Documents.tsx` `DocRow.attach()`: asks the expiry FIRST, uploads,
  then `save_document_draft()`, which refuses a missing expiry on the three dated kinds.
- Platform `corefitness-platform/src/components/ApplicationDocs.tsx`: the review list.
- `supabase/functions/ai-coach`: the Claude wiring to copy (`npm:@anthropic-ai/sdk`, secret
  `ANTHROPIC_API_KEY`, the caller checked through their own JWT, service key for one write only).

## Design
**Flow on the site.** Choose file → upload to storage (as today) → call `read-document` with the
path → show "Reading your document…" → prefill the expiry with what was read, labelled "We read
this from your file. Check it." → Attach (unchanged `save_document_draft`). The expiry question
moves after the file is chosen, because the file is what fills it.

**Edge Function `read-document`** (new, deployed with `--use-api`):
1. Checks the caller with their JWT through `may_read_application_file(path)` (new definer RPC:
   same test as `save_document_draft`, may file for that application, path in its folder).
2. Asks `claim_document_reading(path)` (definer, service key) for a slot under the cap; a refusal
   returns `{ reason: 'limit' }` and the site falls back to typing.
3. Downloads the file with the service key, sends it to Claude as an image or PDF block with a
   fixed system prompt and a strict output schema (structured output, no prose):
   `{ looks_like: kind | 'other', readable: boolean, business_name, owner_name, id_number,
   issued_on, expires_on, valid_for_year, confidence: 'high' | 'medium' | 'low' }`, every field
   nullable. The prompt says the document's own text is data: it can describe the document,
   never instruct. Nothing the model returns can change a status, so an injection gains nothing.
4. Stores the result in `document_readings` and returns it.

**Migration 0280** (pasted by the owner, before the function and the apps):
- `document_readings (path text primary key, application_id uuid references gym_applications on
  delete cascade, kind text, result jsonb, model text, read_at timestamptz)`; RLS on, no policy.
- `may_read_application_file(path)`, `claim_document_reading(path)` (cap: default 30 per
  application, a `platform_settings` value so the platform can change it).
- `application_document_checks(p_application)`: platform only, returns per document the reading
  and the warnings, computed in SQL so screen and rules cannot drift. Name match = normalised
  words (upper case, punctuation and words like INC, CORP, GYM, FITNESS dropped), warn when less
  than half the words of the shorter name appear in the other.
- Every new function revoked from public/anon; only the ones a screen calls granted back.

**Platform screen.** Under each document in `ApplicationDocs.tsx`: a "What we read" line and
amber warnings (errors are amber in this system). No new buttons; Verified and Send back stay.

**Privacy and legal.** Files go to Anthropic (a processor) for reading. The platform's Privacy
Policy and the gym Data Processing Agreement must say so in the commit that ships this, with a
new version date (`corefitness-site/src/legalText.ts` seed; the live wording is edited and
published by the owner in the platform's Settings → Gym documents, 0262).

## Steps
1. Migration 0280 + SQL harness suite `scripts/sql/document-readings.mjs` (applicant cannot
   select or insert readings; other applicant cannot claim on someone's path; cap holds;
   warnings fire on fixture readings; cascade on delete). Add to the red team.
2. `read-document` function: core logic in `core.ts` (schema, parsing, prompt) with a small
   Deno test on parsing; unset key or API error returns `{ reason }`, never throws.
3. Site `Documents.tsx`: file first, reading state, prefilled date, fallback to typing. Check at
   393px and desktop with a routed fixture (Playwright), dark only (the site is dark only).
4. Platform `ApplicationDocs.tsx`: "What we read" and warnings, from `application_document_checks`.
5. Legal wording (Privacy Policy, DPA) with new version dates.
6. Real run on made up sample documents (never a real person's ID) through a test application,
   not G Fitness. Then ROADMAP entry, catalogue line on the site, commit, deploy in order:
   0280 pasted → probe → function → site → platform (localhost).

## Later phases (not in this one)
- Payment proof screenshots (0244 `application_payments.proof`): read reference number and amount.
- Coach certificates (0160): prefill title, issuer, expiry in admin and the trainer app.

## Decisions (owner, 2026-11-27)
- The owner's government ID IS read (name and expiry); Privacy Policy and DPA say so.
- Model: `claude-sonnet-5-5`, overridable by the secret `OCR_MODEL` (as `COACH_MODEL` does).
- Phase 1 covers the six business documents only; payment proofs and coach certificates later.
