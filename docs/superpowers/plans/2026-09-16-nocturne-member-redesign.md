# Nocturne member redesign — implementation plan

**Branch:** `nocturne-member-redesign` (not `main` — a full restyle and restructure
before a presentation belongs where it can be reviewed and abandoned).

**Spec:** `Nocturne mobile app scope/design_handoff_member_nocturne/README.md`, with
`CoreFitness Member App.dc.html` as the visual reference. Read both before a phase.

**Goal:** the member half of `g-fitness-member` restyled onto Nocturne's structure in Core Fitness colour (violet + amber,
Inter 500 headings, 8/14px radii, hairline elevation) and restructured to three tab
roots — Today, Train, You — plus More, with the check-in block in the bar.

## Global constraints

- **No feature is removed.** Every existing route stays reachable; the Everything
  menu is the index of all of them. PT booking keeps its coach → slot flow — the
  prototype books in one tap, and that is not a licence to drop a flow.
- **Nothing in the database changes.** Every figure comes from `lib/api/*`.
- **The prototype's copy is not data.** Its fixtures invented policy. Anything that
  states a rule is read from the table that holds the rule, or is left out.
- 12px type floor. Text never darker than `#9397ab` (neutral-500).
- Bar clearance is **measured**, not eyeballed, on every screen touched.
- Lint stays at or below the baseline (57); build clean; `audit-routes.py` clean.

## Colour: CoreFitness, not Nocturne's lavender (user direction, 2026-09-16)

The prototype's single desaturated accent (`#9184d9`) read as bland. **Keep the
brand**: violet `#7C3AED`, amber `#F59E0B`, the near-black ground. Nocturne supplies
the structure — layout, Inter 500 headings, type scale, radii, hairlines, glows —
and the brand supplies the colour, in the roles CLAUDE.md already documents:

- **Violet = where you are and what you have.** Active tab mark, rail underline,
  selected day, progress fills, the live agenda dot, state pills.
- **Amber = what you can do next.** Book, Renew, Spend points, Save, the check-in
  block in the bar.
- Violet `#7C3AED` is **3.5:1** on the ground (small text needs 4.5) — fills, borders, marks and glows
  only. Violet *text* is `--color-primary-300` `#c4b5fd`. Amber text is fine as is.
- Text ramp and hairlines follow Nocturne (`#e9e9ed` / `#b2b6ca` / `#9397ab`), which
  is legibility rather than identity: the old `#6B7280` muted text was 4.1:1.

## Decisions taken where the handoff is silent or unsafe

| Handoff says | Doing instead | Why |
|---|---|---|
| Delete `--color-secondary` | **Keep it — amber is the action colour** (see Colour above) | user direction; also 319 call sites, including all eight trainer pages |
| Delete the Anton `.display` class | Redefine `.display` as Inter 500, sentence case, tight tracking | 80 call sites; the same argument. Names stay, values change — the handoff's own rule for tokens |
| Swap lucide for Phosphor | Phosphor in the shell and in every screen as it is rebuilt; lucide removed from a file when that file is rebuilt | 82 files. A big-bang icon swap is the riskiest possible first step and changes nothing about layout |
| Trainer pages out of scope | They inherit the new token *values* (so the app is one palette), and keep their own layout and nav untouched | Tokens are global; scoping them per-role would split every portal and modal |
| Floating chat head | Removed from the member shell; the assistant stays at `/member/chatbot`, reached from the Today rail, Today's "Ask the assistant" button and Everything | "Nothing overlapping content" — and the audit measured it covering Home's View button by 40×48px |

## Prototype claims checked against the code

| Prototype says | The code says | Ship |
|---|---|---|
| "Twenty points a check-in" | `point_rules.checkin` = **10**, admin-editable (0051) | read the rule |
| "Nothing else earns points" | workout 15, class 25, PT 40, goal 100, challenge 250 | list every active rule |
| "Rate a coach for two weeks after a session" | `may_rate_trainer()` has **no window** (0042) | omit the sentence |
| "Cancelling >2h ahead doesn't count against you" | no such rule anywhere | omit |
| Cancel offers four reasons | `cancellation_reasons` filtered by `applies_to` (0081) | read the table |
| QR "refreshes every 60 seconds" | **true** — `QR_TTL_SECONDS = 60` and the sheet regenerates on its own | keep |
| Refunds "within seven days… before first check-in" | Terms: 100% in 7 days unused, pro-rata after (0073) | point at Terms |
| Premium Plus, three-month plan, guest passes | the gym sells Free Trial, Free Plan, Premium | render `membership_plans` |
| Settings: Push / Email me too / Sound | `notification_prefs`: sound + four categories (0022) | render the real columns |
| "Sessions that trained it" under a muscle | no link from a body region to a workout exists | omit unless one is found |

## Route map (existing routes only)

- **Today** `/member/home` — rail: Updates `/member/notifications`, Announcements `/member/events`, Ask the assistant `/member/chatbot`, Log a reading `/member/progress?tab=body`, Track a lift `/member/track`
- **Train** `/member/book-class` — rail: Progress, My bookings `/member/booking-history`, Training plan `/member/plan`, Free workouts, Coaches `/member/trainers`, Challenges, Achievements, Logged workouts `?tab=workouts`, Goals `?tab=goals`, Charts `?tab=dashboard`, Coach notes `?tab=feedback`
- **You** `/member/membership` — rail: Membership history, What your plan includes, Renew `/member/renew`, Payments, Attendance `/member/attendance-history`, Spend points `/member/rewards`, Edit profile `/member/profile/edit`, Settings
- `/member/profile` has no tab any more; it stays routed and in Everything.

## Phases

1. **Tokens and type** — `src/index.css` values, accent and neutral ramps, `.rule`/`.hair`/`.eyebrow`/`.rail`, `.display` redefined, brand colours kept with text-safe ramps, `--dock-clear: 104px`, Anton import dropped. Install `@phosphor-icons/react`.
2. **Shell** — new `Layout`: tab header (title / sub / eyebrow / bell / rail) on the three roots only, the 88px bar, the Everything sheet. Delete `MobileMenuDock`, `BottomNav`'s use of it, the `.dock*` CSS, `FloatingChathead` from the shell. `tabSubPaths` kept, one row per tab, in bar order.
3. **Primitives** — `Page`, `PageTitle` (text `← Back`), `Section`, `Card`, `Row`, `RingStat`, `Pill`, buttons, `Modal`, toast. Most screens follow from here.
4. **Roots** — Home → Today; BookClass → Train; MembershipHub → You; ProgressHub → one screen, five-tab text rail.
5. **Supporting screens and flows** — every remaining member route, then log a reading, track a lift, plan builder, rate, cancel, check-in sheet.
6. **Verify and document** — bar clearance measured per screen, lint, build, route audit, screenshots; CLAUDE.md and DESIGN_SYSTEM.md rewritten where they describe the old dock, amber and Anton.
