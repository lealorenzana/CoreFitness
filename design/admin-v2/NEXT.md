# NEXT (2026-11-27): History and Notifications B are DONE and live (ROADMAP, first entry)
Open: admin-ops-redesign-check fails on Payments' "coming to renew" line (failed before this work too); Needs you with
items was not seen on screen (no fixture rows): add sign-ups and renewal requests to admin-inbox-check's fixtures.

# Design V2: where it stands and what is next (2026-11-23)

Everything below is live on corefitness-admin.vercel.app and pushed to main (last commit 9949ea73).
What each step did is in docs/ROADMAP.md, "Design V2, step 1" to "step 6", "The day line, redrawn" and
"Design V2 pilot: Dashboard and Members". Owner's choices: design/admin-v2/DECISIONS.md. Rules: design/lessons/LESSONS.md.

## Owner's rules for this work
- Never remove a feature unless the owner names it. No mock-ups unless asked. Both light and dark.
- No dashes in UI text (rewrite the sentence; a lone "—" for an empty value is fine).
- One action colour (`--v2-act`); the gym colour only on what is selected and on data marks.
- Status is a dot and a word (`Badge` and `Pill` both do this now).
- Don't call work a "pilot": it ships live to every gym.
- Checks: admin-light-check, admin-ops-redesign-check, and the check for each screen touched. Run them with
  `node scripts/ci/run-ui-checks.mjs <name>` from a folder that has playwright (C:\Users\USER\Documents\CoreFitness-Staging-Tests\v2run).
  For a check not in the manifest, or to change its timeout, copy the runner with its own ui-checks.json (repo path hard-coded).
- `git push` sometimes hangs here: use `GIT_TERMINAL_PROMPT=0 timeout 500 git push origin main` in the background.
  Deploy: `cd g-fitness-admin && npx vercel deploy --prod --yes`, then compare the live `assets/index-*.js` with `dist/`.

## The new kit pieces (components/ui/rd.tsx, styles at the end of v2.css)
`CountUp` (whole numbers up to 999 count up, CSS only, real number in an sr-only span), `Skel` (grey shape while
loading), `Spark` (trend line over a dashed comparison, draws in), `MiniBars` (a few bars, latest in the gym colour).
The header's section tabs have a sliding underline (Header.tsx). All motion is off under reduced motion.

## Next: Attendance and everything its buttons open (owner, 2026-11-23)
Page `pages/Attendance.tsx` + `pages/attendance/att.css` (Design V2 blocks at the end). Seen in the owner's screenshot:
- the right rail's texts are cut off ("Members scan their own QR on a tablet by the ...", "Today's classes, ...",
  "The owner turns it on in Settings → Gy..."); "Checked in today" has a dashed flat line and "▲ 0 vs last Monday";
- an empty log is a big blank table with one sentence.
Bring it to the Dashboard's level: CountUp on the figures, Skel while loading, real trend lines where data exists,
rows that arrive and leave smoothly, no cut-off words. Then every page its buttons open: Today · Walk-ins
(`pages/WalkIns.tsx`) · History (`pages/AttendanceHistory.tsx`), Scan QR (the camera dialog), View all
(`FloatingWindow`), the tag chips and More…, Export, Open kiosk (`/kiosk`), Open lobby TV, How it works (guide,
already flat), Coaches can check in too. Known failing check before this work: admin-door-check (log room at 1440x900).

## Still open from earlier
- Dashboard: the "now" line can cross a class label; let the label step aside.
- Dashes remain in dialogs and settings tabs not yet reviewed; the birthday date picker still has a filled box;
  certificate cards in the coach drawer still have coloured borders.
- admin-setup-check fails on its Run chapter line (before this work); admin-gym-app-check fails on Publish (before).
- admin-people-check's credential lines are flaky (pass on rerun); admin-dashboard-check fails for the first
  15 minutes after Manila midnight (its "done" class runs 12:00 to 12:15 am).

## Queue from the owner (2026-11-23, evening): redesign these, clean and easy to navigate
Done already: dark mode is "Claude dark", one step darker (v2.css end: ground #121211, cards #191918, sidebar #0E0E0D;
a gym's premium theme still wins); SkelRows replaces every "Loading…" in admin, member/trainer and platform; Settings
search no longer gets the email autofilled.
Still to do, the owner's screenshots in that chat:
- **The layout to copy is Discord's settings** (owner's reference): a left list of sections with sub-items under the
  open one (a line marks the current), one centred content column (~720px) of headings and rows: label and help on the
  left, the control (toggle, select) on the right, hairline between rows, no boxes inside boxes. First on
  **Your app** (DONE 2026-11-23, `.ya-*` in att.css: reuse that pattern; was: Look, Words, What you run, Joining, AI assistant, Payments, Lobby TV, Celebrations; keep the
  live phone preview on the right), then **Settings** (same pattern; it already has a left list).
- **Plans** (Money → Plans): too many boxes; the "New plan" form shows on the right AND a New plan button AND a dashed
  New plan card. Keep one way in. Dashes in copy ("if everyone renews —").
- **Engage → Challenges** (Challenges, Gym goal, Squads, Goals members pick): four big description cards as tabs; the
  "New challenge" button duplicates the form already open on the right. Big empty boxes when nothing runs.
- **Engage → Rewards** (Monthly season tiers, Waiting at the desk) and **Achievements** (members/coaches; "New
  achievement" duplicates the open form).
- **Library → Programs** (program editor, Workouts list + editor with a big empty area).
- Rule from the owner: remove buttons that do nothing because their content is already on the page; never remove a
  feature; smooth CSS transitions; no dashes; check one screen quickly, full checks only before shipping.
- Sidebar: light mode wears the gym colour (white words), dark stays plain near-black (owner, 2026-11-23).
