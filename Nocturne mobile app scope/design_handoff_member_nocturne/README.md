# Handoff: Core Fitness member app — Nocturne restyle and restructure

## Overview

A redesign of the **member half** of `g-fitness-member` (the trainer pages and the admin app are out of scope). It does two things:

1. **Restyles** the app from the violet/amber + Anton palette onto the Nocturne design system: one accent used as line and glow, Inter at weight 500 for headings, 8px radii, hierarchy from size and space rather than colour.
2. **Restructures** navigation and three screens. The four-tab dock with the raised QR bump is gone; Home becomes an agenda; booking shows the whole week at once; Progress is one hub with five tabs; Membership, Payments and Rewards merge into a ledger.

Every figure, label and state in the prototype was taken from the running app or from `docs/`. No invented data.

## About the design files

`CoreFitness Member App.dc.html` in this bundle is a **design reference**, not production code. It is a single-file HTML prototype (a "Design Component" — inline styles plus one logic class, loaded by `support.js`). Do not port it verbatim.

**The task is to recreate these designs inside `g-fitness-member`'s existing environment** — React 19 + TypeScript + Vite + Tailwind v4, React Router, Framer Motion, Supabase — reusing that app's own components (`src/components/ui/*`), its `<Page>`/`<Section>` layout primitives, its `lib/api/*` data layer, its `pageCache` and `useScrollMemory` hooks. Nothing in this handoff changes what any screen fetches or writes.

Open the prototype by serving the bundle folder and loading the `.dc.html` (it needs `support.js` and `assets/` as siblings).

## Fidelity

**High-fidelity.** Colours, type sizes, spacing and radii are final and exact; the hex values below are what to implement. Interactions in the prototype are real and represent intended behaviour. Two things are deliberately illustrative rather than final: the prototype's data is fixtures, and its `Everything` menu is a flat list of routes that already exist.

## Design tokens

Replace the token block at the top of `src/index.css`. Keep the token *names* so call sites don't churn; change the values.

| Token | Current | New | Notes |
|---|---|---|---|
| `--color-bg` | `#08080E` | `#161826` | Nocturne ground |
| `--color-surface` | `#12121C` | `#232532` | the only card fill |
| `--color-surface-raised` | `#191826` | `#232532` | collapse to one surface — the design has **two** surfaces, page and card |
| `--color-surface-high` | `#221F33` | `#292b31` | inset tint only, never a third card |
| `--color-primary` | `#7C3AED` | `#9184d9` | the single accent |
| `--color-secondary` | `#F59E0B` | — | **delete.** Amber survives in exactly one place: the body map's magnitude ramp (below) |
| `--color-text-primary` | `#FFFFFF` | `#e9e9ed` | no pure white |
| `--color-text-secondary` | `#9CA3AF` | `#b2b6ca` | neutral-400 |
| `--color-text-muted` | `#6B7280` | `#9397ab` | neutral-500 — **do not go darker for text** |
| `--color-border` | `#26243A` | `rgba(233,233,237,.16)` | hairline; `rgba(233,233,237,.08)` for in-list separators |
| `--radius-card` | `16px` | `14px` | |
| `--radius-panel` | `24px` | `14px` | one radius, not two |
| `--radius-btn` | `99px` | `8px` | pills only for filter chips |
| `--shadow-panel` | `0 8px 28px rgba(0,0,0,.55)` | `0 0 0 1px #3f424d` | on a dark ground elevation is an edge, not a drop shadow |
| `--dock-clear` | `116px` | `104px` | see the bar, below |

Accent ramp (from Nocturne, use these rather than `color-mix` where you can): `--color-accent-300 #d2cefd` (accent-coloured text), `--color-accent-500 #968ae0`, `--color-accent-700 #5d5294` (tinted borders), `--color-accent-900 #2b2741`. Neutrals: `#f3f5fe 100 · #e4e7f5 200 · #cfd3e5 300 · #b2b6ca 400 · #9397ab 500 · #75798c 600 · #595d6c 700 · #3f424d 800 · #292b31 900`.

Accent tints in the prototype are written `color-mix(in srgb, #9184d9 12–18%, transparent)` over the ground — selected chips, active segments, the avatar disc.

**Contrast floor.** Text is never on neutral-600 or darker: neutral-700 `#595d6c` measures 2.7:1 on this ground. 12px meta text is `#b2b6ca` (neutral-400); `#9397ab` (neutral-500, 6.1:1) is the darkest text anywhere; `#75798c` is permitted only for 15px+ inactive interface chrome.

### Typography

- **Delete the Anton `.display` class and its `@import`.** Headings are Inter 500. This is the single biggest visual change and it is intentional: Nocturne forbids bolding headings past 500, and hierarchy comes from size and space.
- Scale as used: screen title 31px/1.04, letter-spacing −0.028em, with a second line of the same size in `#9397ab`; section heading 17px/500; hero numeral 40px, letter-spacing −0.035em; body 14–15px; meta 12–12.5px.
- Eyebrows: 11.5–12px, `letter-spacing: .09em–.14em`, uppercase, `#9397ab`. Some carry a 14×2px solid accent mark to their left.
- **The 12px type floor from `docs/DESIGN_SYSTEM.md` still holds.** Nothing in the design is smaller.
- Rules fade at their ends — a Nocturne signature: `height:1px; background:linear-gradient(to right, rgba(233,233,237,.16), rgba(233,233,237,.16) calc(100% - 48px), transparent)`. In-list separators stay solid at `.08` alpha.

### Icons

**Phosphor** (`@phosphor-icons/react`), replacing lucide-react. Regular weight at 20px in the bar and 15–18px inline; `ph-fill` for the active bar item only. Icons used: `house`, `barbell`, `user`, `dots-nine`, `qr-code`, `bell`, `arrow-left`, `arrow-right`, `arrow-up-right`, `caret-right`, `plus`, `minus`, `check`, `checks`, `check-circle`, `seal-check`, `circle-dashed`, `star`, `chart-line`, `clock`, `receipt`, `gift`, `sparkle`, `trophy`, `x`.

## The shell

Replaces `components/layout/Layout.tsx` + `BottomNav.tsx` + `ui/MobileMenuDock.tsx`.

**Delete** `MobileMenuDock`, the `.dock*` CSS block in `index.css`, and the `dock__fab` / `fabOffCentre` logic. The clipped-label, off-centre-bump and `overflow:visible` problems documented in `docs/DESIGN_SYSTEM.md` all belong to that component and go away with it.

Structure, top to bottom:

1. **Status bar** — prototype only; the real app is a PWA/TWA and the OS draws this.
2. **Header**, `flex: none`, `padding: 4px 20px 0`:
   - Title block: two lines at 31px/500/−0.028em, first `#e9e9ed`, second `#9397ab`. Per tab: `Tuesday / 16 September`, `This week / Sep 16 – 22`, `Your account / Premium`.
   - Eyebrow row, `margin-top: 14px`, `align-items: flex-end`, space-between: eyebrow text 12px uppercase `.12em` `#9397ab` (`Your day` / `Classes and 1-on-1` / `Membership and points`) and a 34×34 bell button (`border-radius:8px`, 1px `rgba(233,233,237,.14)`, icon 16px `#b2b6ca`) with a 7px accent dot at `top:7px right:8px`, `box-shadow: 0 0 8px #9184d9`, rendered only when unread > 0.
   - Fading rule, `margin-top: 12px`.
   - **Feature rail** — horizontal scroller, `margin: 0 -20px; padding: 12px 20px 2px`, scrollbar hidden, `gap: 8px`. Each item: `padding: 8px 13px`, `border-radius: 99px`, 1px `rgba(233,233,237,.16)`, 12.5px `#b2b6ca`, `white-space: nowrap`. Contents per tab are listed under *Routing*.
3. **Scroller** — `flex: 1; overflow-y: auto`, `padding: 14px 20px 104px`. The 104px is load-bearing: the bar is `position: absolute`, so the scroller must reserve its 88px plus a 16px gap. This is the same failure `--dock-clear` exists to prevent, at a new number. A screen with its own footer opts out exactly as `<Page dockClear={false}>` does today.
4. **Bottom bar** — `position:absolute; left:0; right:0; bottom:0; height:88px`, `background: #161826`, `border-top: 1px solid rgba(233,233,237,.12)`, `padding: 0 14px 22px`, `align-items: stretch`. Four `flex:1` items, each a column: a 16×2px mark (accent on the active item, transparent otherwise), a 20px icon, a 12px label. Active `#9184d9` + `ph-fill`; inactive `#9397ab`. Then a 1px vertical hairline (`margin: 16px 10px 4px`), then a 92px-wide accent block, `margin-top:12px`, `border-radius:10px`, 1px `#9184d9`, `box-shadow: 0 0 22px -9px #9184d9`, holding a 21px `qr-code` and a 12px label that reads `Check in` / `Checked in`.
   - Items: **Today** `house`, **Train** `barbell`, **You** `user`, **More** `dots-nine`.
   - No floating bump, nothing overlapping content, and the bar's width is not divided by a label that can shrink.
5. **Overlays** — pushed screens, the Everything menu, the check-in sheet, and a toast. All `position:absolute; inset:0` within the phone frame; in the app they are routes and portals as they are today. Keep the portal discipline from `docs/DESIGN_SYSTEM.md`: one always-mounted wrapper owning `pointer-events`, `createPortal` called on open only.

### Routing

Three roots plus a `More` sheet. Tab → route: `today → /member/home`, `train → /member/book-class`, `you → /member/membership`.

The rail under the header carries that tab's own screens, all of which are existing routes:

- **Today** — Updates, Announcements, Ask the coach, Log a reading, Track a lift
- **Train** — Progress, My bookings, Training plan, Free workouts, Coaches, Challenges, Achievements, Logged workouts, Goals, Charts, Coach notes
- **You** — Membership history, What Premium includes, Renew, Payments, Attendance, Spend points, How you earn, Edit profile, Settings

`More` opens **Everything**: a full-screen list titled at 31px with a 34px close button, grouped under four eyebrows (Today / Train / Progress / Account), each group's items a 15px row with a 15px `arrow-up-right` on the right and a `.08` separator. It is the discoverability surface for the whole app — 26 destinations.

Keep `tabSubPaths` in spirit: highlight Today only for home and notifications, Train for everything training-related, You for the money-and-access half. Add `/member/announcements` and `/member/membership-history` to the You group.

Two rules from the existing docs that still apply: back undoes a step (`window.history.length > 1 ? navigate(-1) : navigate('/member/home')`), and a pushed screen's header is a text `← Back` row (accent, 13px) above the title, never a hardcoded destination.

## Screens

Each entry names the repo file to change. Layout values are exact.

### 1. Today — `pages/Home.tsx`

Replaces the violet membership hero. The hero card was ~280px restating a date; plan and expiry now live in the header subtitle and in one panel line.

- **Month panel** — `border-radius:14px`, `box-shadow: 0 0 0 1px #3f424d`, `padding: 16px 16px 14px`, `background: radial-gradient(150% 120% at 8% 0%, rgba(145,132,217,.20) 0%, transparent 66%)`, with a top hairline inset 16px each side: `linear-gradient(to right, #9184d9, transparent)`. Inside: eyebrow `SEPTEMBER`; then a 40px/−0.035em numeral (`checkInsThisMonth`) with `of 12 sessions` at 14px `#b2b6ca`; right-aligned, the unread count at 12px `#b2b6ca` and `18 days left on Premium` at 12px `#9397ab`; then a 4px progress bar, track `#292b31`, fill `#9184d9` with `box-shadow: 0 0 12px #9184d9`. The fill is the month's sessions over the joined challenge's goal — **only ever drawn when a real goal exists**, per the existing rule against rings with no denominator.
- **Week marks** — seven `flex:1` columns, each a 30px block `border-radius:5px` over a 12px label. Trained `#9184d9`; today untrained `1px solid #9184d9` on `#292b31`; a planned day `1px dashed #5d5294`; otherwise `#292b31`. Labels `#d2cefd` for trained/today else `#9397ab`. This is `WeekRings` restated as bars; keep its four states and its reduced-motion behaviour.
- **Agenda** — a two-column list: a 44px gutter of 12px `#9397ab` time labels (`Now`, then weekday abbreviations), and a content column with `border-left: 1px solid rgba(233,233,237,.12)`, `padding-left: 16px`. Each entry gets a 7px dot on the rule, `left:-4px`; the live one is `#9184d9` with `box-shadow: 0 0 9px #9184d9`, the rest `#3f424d`. Entry rows: 15px/500 title, 12.5px `#9397ab` meta, and either an accent 12px action or an 11.5px `#d2cefd` status pill (`1px solid #5d5294`, `border-radius:4px`, `padding:2px 8px`).
  - Row 1 is the check-in state and opens the sheet: `Not checked in yet` / `The floor is open until 9 PM. Nothing booked today.` / `Show my code`, or after check-in `Checked in at 9:41` / `Twenty points added. Have a good session.`
  - Then the next booking, then the next event, then a closing `Nothing after this` row in `#9397ab` carrying the challenge nudge.
- **Two ghost buttons** — 46px, `border-radius:8px`, 1px `rgba(233,233,237,.16)`, `#b2b6ca`: `Track a lift`, `Ask the coach`.

### 2. Train — `pages/BookClass.tsx`

Replaces the six `NavTile`s, the `Bento` timetable, the `DateRail` and the filter chips. The bento was invented to stop a day of classes reading as a spreadsheet; a week matrix does that better by showing shape.

- **Filter row** — three text items, 12.5px, active `#e9e9ed` with `border-bottom: 2px solid #9184d9` and 5px padding, inactive `#b2b6ca`: Group classes / 1-on-1 / Events.
- **Week matrix** — `display:grid; grid-template-columns: 52px repeat(7, 1fr); gap: 5px`. Row 1 is weekday initials (12px, selected `#d2cefd` else `#9397ab`); rows 2–4 are labelled `AM`, `Mid`, `PM` in 12px `#9397ab`. Each cell is 38px, `border-radius:6px`: with classes `#232532`, empty `#1c1e2b`, selected column `color-mix(in srgb,#9184d9 16%,transparent)` + `1px solid #9184d9`. The count sits in the cell at 12px. A cell containing the member's own booking carries a 5px accent dot at `top:5px right:5px`. Tapping any cell or header selects that day.
- **Legend** — 12px `#b2b6ca`, three items: Classes on / Nothing on / Yours.
- **Day list** — fading rule, then the day's title at 17px/500 with a count at 12px `#9397ab`, then rows: 52px time gutter (13px `#9397ab`), title 14.5px, meta 12px `#b2b6ca`, trailing action 13px accent (`Book` / `Join` / `Wait` / `Booked`), `.08` separator between rows. A full class shows its title in `#9397ab` and `Wait`; a booked one shows `Booked` in `#d2cefd` and routes to My bookings instead of booking again.
- Booking is one tap in the prototype. If you want the two-step sheet (coach → slot) it exists in the earlier exploration; not part of this handoff.

### 3. Progress — `pages/progress/ProgressHub.tsx` and its `tabs/`

Same five tabs as today, but they sit under one screen title with a 12.5px text rail (active `#e9e9ed` + 2px accent underline, inactive `#b2b6ca`): **Body · Workouts · Goals · Charts · Coach**. `MY CORE`'s four-tile grid is dropped — those numbers are on Today and in the ledger.

- **Body** — front/back as two 12.5px text toggles, right-aligned. Figure at `width: 132px` beside a measurement column, `gap: 14px`. The figure **keeps everything from `ui/BodyMap.tsx`**: the two WebP illustrations, `viewBox="0 0 512 935"`, `isolation: isolate`, `mix-blend-mode: screen` tints, the violet→amber magnitude ramp scaled to the member's own largest movement with a 0.3 opacity floor, and the verbatim generated paths from `ui/bodyRegions.ts`. Do not redraw or simplify those paths — `docs/DESIGN_SYSTEM.md` records what approximating them cost (quads 37% outside the body). Measured groups are tinted and, when selected, get `stroke:#e9e9ed; stroke-width:4`; unmeasured groups render exactly as the component does today — transparent fill, `stroke: rgba(255,255,255,0.20)`, `stroke-dasharray: 5 7` — and remain tappable, routing to Log a reading.
  - Measurement column: one row per measured group, `padding: 9px 0`, `.08` separator, name and `NN cm` at 13.5px (selected `#e9e9ed`, else `#b2b6ca`), delta below at 12px (selected `#d2cefd`, else `#b2b6ca`). A final row names the unmeasured groups and reads `Not measured — tap one on the figure`.
  - Below a fading rule: `SHOWING · <label>` eyebrow in accent, then the verdict at 15px and the site note at 12.5px `#b2b6ca` — both straight from `utils/trainingFocus.ts` and `SITE_NOTE`, including their nulls. Then `Sessions that trained it` as three rows. Then two 46px buttons: `New reading` (accent outline) and `Chart` (ghost).
- **Workouts** — three inline stats (24px numeral over a 12px label: logged this month, all time, kg lifted), fading rule, then logged workouts as rows (name, `date · N exercises · N min · N kg lifted`, `Open`), then a 46px accent `Log a workout`.
- **Goals** — per goal: name 15px with the current value at 13.5px `#d2cefd`, a 4px accent bar filled `|have − start| / |goal − start|`, then the note at 12px and a `Remove` affordance. Empty state is a sentence, not a zero. Below, an `Add a goal` eyebrow and the unused presets as 12.5px pills.
- **Charts** — metric pills (Waist, Body weight, Bench press, Visits a month), then a six-column bar chart, bars `#292b31` with the latest in `#9184d9` + `0 0 14px -4px` glow, value above and month below at 12px, then a 13px sentence naming what actually happened and a 12px unit line.
- **Coach** — `trainer_feedback` notes as cards, the newest filled `#232532`, older ones transparent with the same 1px edge: author and date at 12px (author accent on the newest), body at 14px/1.55. Closing 12.5px line: notes are written after a session, this is not a chat.

### 4. You — `pages/MembershipHub.tsx`

Merges Membership, Payments and Rewards into one statement. Membership's four `NavTile`s go.

- **Identity row** — 46px avatar disc (`border-radius:50%`, 1px `#9184d9`, `color-mix(in srgb,#9184d9 14%,transparent)`, initials 15px `#d2cefd`) beside name 14px and `Member since … · Mamburao` at 12px `#9397ab`. Opens Edit profile.
- **Term** — `Premium` at 14px and `expires Oct 4` at 12.5px `#9397ab`; a 4px bar filled `daysLeft / termLength`; below, `18 of 30 days left` at 12px and an accent `Renew`. A frozen membership replaces the bar with the freeze sentence — the countdown is untrue while frozen (issue 0057).
- **Points band** — bounded top and bottom by `1px rgba(233,233,237,.12)`, `padding: 14px 0`. Left: `CORE points` at 12px over a 38px/−0.03em balance. Right, right-aligned: the cheapest affordable reward at 12.5px `#d2cefd`, the next unaffordable one with its shortfall at 12px `#b2b6ca`, and an accent `Spend points`.
- **Ledger** — `Activity` at 17px with `Balance NNN` at 12px, then one row per entry: 46px date gutter (12px `#b2b6ca`), title 14px, sub 12px `#b2b6ca`, amount right-aligned 13.5px — points in `#d2cefd`, spends in `#9397ab`, money in `#e9e9ed`. Sources: `attendance` (+20), `points` redemptions, `payments`, challenge joins. Newest first, `.08` separators.
- **Link row** — 13px accent links: What Premium includes, Membership history, Announcements, How you earn points, Payments, Attendance, Rewards, Settings, Updates, then `Log out` in `#b2b6ca`.

### 5. Supporting screens

All exist as routes today and need only the new styling: a `← Back` row, a 26px title with a 12.5px sub, then content. Row pattern throughout: 13px vertical padding, 14.5px title, 12px `#b2b6ca` meta, optional 13px accent trailing action, `.08` separator.

My bookings (upcoming with Cancel, past with Rate) · Free workouts · Training plan (three chosen days as 44px blocks over 12px labels, then the day rows, then `Rebuild my plan`) · Coaches and coach detail (credentials, availability, the anonymity note) · Challenges (joined card filled, open ones transparent; progress bar; Join/Leave) · Achievements (level bar, then earned rows with `seal-check` in accent and locked rows with `circle-dashed` in `#9397ab`) · Spend points · Payments · Attendance (a 28-cell month grid, future days at 0.35 opacity, then the visit rows) · What Premium includes (checks in accent; excluded items get `minus` in `#9397ab`) · Renew (three plans, the current one accent-outlined) · Membership history · How you earn · Updates · Announcements · Edit profile · Ask the coach.

**Flows that were dialogs and are now screens:**

- **Log a reading** — 52px −/+ buttons around a 46px value, half a centimetre a step, seeded from the member's own last reading, `Save reading` at the bottom, the site note below. Seeding-on-tap and never pre-filling are existing `BigNumberInput` rules; keep them.
- **Track a lift** — the same ± pattern for weight (2.5kg) and reps (1), `Save set`, then the session's saved sets. Native spinners stay suppressed.
- **Plan builder** — six questions, one per screen, over a segmented progress bar; `← Previous question` for steps 2+; answers are 52px full-width targets; the optional last step shows `Skip`; a summary screen ends with `Save this plan`. This is `StepFlow` with the app's own onboarding shape — omit `valid` on the optional step exactly as documented.
- **Rate a coach** — five 34px stars, an optional note, `Send rating`, and the line explaining the two-week window and the anonymity.
- **Cancel a booking** — four reasons as 50px rows; a reason is required; the copy states that cancelling more than two hours ahead does not count against you. Replaces `window.confirm`-style flows and matches `CancelBookingDialog`'s intent.
- **Check-in sheet** — bottom sheet, `border-radius: 20px 20px 38px 38px`, `background:#232532`, `box-shadow: 0 -1px 0 #595d6c, 0 -18px 44px rgba(0,0,0,.6)`, `padding: 12px 20px 34px`: 42×4 grabber, title 20px, 12.5px sub, a 224px QR on `#e9e9ed` with `box-shadow: 0 0 40px -10px #9184d9`, the code in monospace 19px `letter-spacing:.34em` `#d2cefd`, a 12px validity line, then a 48px action. After check-in the QR panel becomes `#292b31` with a 90px accent `check-circle`. Keep `CheckInSheet`'s refusals: no live code for an expired membership or someone already checked in.
- **Toast** — `position:absolute; left:20px; right:20px; bottom:104px`, `padding:12px 14px`, `border-radius:10px`, `#232532`, `box-shadow: 0 0 0 1px #595d6c, 0 10px 30px rgba(0,0,0,.6)`, 13px text, ~2.2s.

## Interactions and behaviour

- Tab and rail taps navigate; `More` opens Everything; the accent block opens the check-in sheet.
- Selecting a matrix cell or weekday swaps the day list. Booking marks the row `Booked`, files it under My bookings and raises a toast. Tapping a booked row goes to My bookings rather than rebooking.
- Tapping a muscle re-reads the whole lower half of the Body tab; an unmeasured muscle routes to Log a reading. Front/back swaps the label, never the measurement — one circumference covers both sides.
- Redeeming decrements the balance and writes a ledger row; an unaffordable reward is inert with its shortfall stated. Joining or leaving a challenge is immediate; joining is the whole-card tap, leaving stays a deliberate small control.
- Check-in adds 20 points, fills today's week mark, rewrites the first agenda row and posts to the ledger.
- `Mark all as read` clears the header dot.
- Animation is decoration only. Per `docs/DESIGN_SYSTEM.md`: nothing whose correctness matters may be gated on an animation having run — render the final value, then decorate. Transitions in the prototype are 150–200ms opacity only.
- Loading is `SkeletonList`, never a centred spinner; revisits paint from `pageCache` and refetch quietly.

## State

Nothing new in the database. Screen-level state: active tab, pushed route, `More` open, check-in sheet open and checked-in-today, the Train filter and selected day, Progress tab, body view and selected muscle, chart metric, goal set, builder step and answers, reading and set draft values, points balance and redemptions, joined challenges, unread count, notification prefs. All of it derives from existing tables (`attendance`, `bookings`, `pt_sessions`, `memberships`, `payments`, `points`, `challenges`, `progress`, `workout_sets`, `notifications`, `trainer_feedback`) through `lib/api/*`.

## Assets

- `assets/body-front.webp`, `assets/body-back.webp` — copied unchanged from `g-fitness-member/public/`. 76KB for the pair. Keep them in `public/` and keep `BODY_ART` pointing at them.
- Phosphor is a package, not a file.
- No other images. The prototype's QR is an icon standing in for the real `utils/qrCode.ts` output.

## Files in this bundle

- `CoreFitness Member App.dc.html` — the prototype. Design reference.
- `support.js` — the runtime it needs to open. Not for the app.
- `nocturne-styles.css` — the design system's token sheet and component layer; lift the `:root` values from it.
- `assets/body-front.webp`, `assets/body-back.webp`.
- `README.md` — this file.

## Suggested order

1. Tokens and type in `src/index.css`; delete Anton and `--color-secondary`; swap lucide for Phosphor.
2. The shell: new header, feature rail, bottom bar, `--dock-clear: 104px`; delete `MobileMenuDock` and the `.dock*` CSS.
3. `Page`, `Section`, `Card`, `Row`, `Tile`, `RingStat`, `StatCard`, `ListRow` restyled once — most screens then follow for free.
4. Today, Train, Progress, You in that order.
5. The supporting screens and the four flows.
6. Verify the bar clearance by scrolling each screen to its end and comparing the last text node's bottom against the bar's top — measured, not eyeballed, exactly as the existing docs require.
