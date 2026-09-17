# Design system

How the two apps are styled, and the traps that have already cost time. CLAUDE.md keeps only the
load-bearing rules; this is the full picture.

## Two different Tailwind majors

- **Admin — Tailwind v3** via `@tailwind` directives. `postcss.config.js` points at
  `tailwind.config.cjs`; the sibling `tailwind.config.js` and `test-out.css` are dead and not
  loaded. v3 has **no cascade layers** — ordering is plain source order + specificity.
- **Member — Tailwind v4** via `@import "tailwindcss"`, no `@config`, **no config file at all**.
  It was deleted because it was silently ignored: every class defined only there emitted *no CSS*,
  so `bg-dark` / `text-yellow` / `primary-start` rendered transparent or inherited white for
  months. v4 orders layers `theme, base, components, utilities`, and **unlayered author CSS beats
  every layer regardless of specificity**.

**If a class looks like it does nothing, it probably does nothing.** Verify against the built
bundle, not the source:

```bash
npm run build && grep -o '\.the-class[^{]*{[^}]*}' dist/assets/*.css
```

## Tokens

CSS custom properties in each app's `src/index.css`. Used as
`style={{ color: 'var(--color-primary)' }}` or `className="bg-[var(--color-surface)]"`. Never
reach for `brand-*` / `dark-*` classes — they do not exist.

| Token | Value | Note |
|---|---|---|
| `--color-primary` | `#7C3AED` | violet |
| `--color-secondary` | `#F59E0B` | amber |
| `--color-bg` | `#08080E` member, `#0F0F1A` admin | member is deeper on purpose |
| `--color-surface` / `-raised` / `-high` | `#12121C` / `#191826` / `#221F33` | member; `-high` is for a card on a raised panel |
| `--color-border` | `#26243A` | lifted with the surfaces |
| `--radius-card` / `-panel` / `-btn` | `16px` / `24px` / `99px` | |
| `--shadow-panel` | `0 8px 28px rgba(0,0,0,.55)` | cards read as lifted, not outlined |

The apps' backgrounds differ deliberately. The reference design gets its separation from white
cards on light grey; the dark equivalent needs the background pushed down and the cards lifted, or
every surface merges into one.

## Member layout: one rhythm, one edge, two surfaces

Added 2026-09-14, after a screen-by-screen pass at 393x852. The member app had
no shared page structure and it showed: `space-y-6 pb-4` on Home, `space-y-5` on
Profile, `space-y-3` inside Rewards; section labels that were uppercase Anton on
one screen and small bold sentence case on the next; and content running under
the floating dock because the scroller reserved 24px for a bar 90px tall.

**The four rules, and where they live:**

| Rule | Enforced by |
|---|---|
| One rhythm — `--stack` between sections, `--stack-tight` within one | `<Page>`, `<Section>` in `components/ui/page.tsx` |
| One left edge — the gutter is set once, in the layout | `Layout.tsx`, `--gutter` |
| Two surfaces — page, then card. An inset is a **tint**, not a third card | `insetStyle` in `Card.tsx` |
| One clearance above the dock | `<Page>`, `--dock-clear` |

**`--dock-clear` is the load-bearing one.** The nav floats above the scroll
container, so the scroller must end above it — 64px of bar, the check-in bump
that rises out of it, and the home indicator. A screen with its own footer
(Track, the assistant) passes `dockClear={false}` rather than fighting it.

**When two blocks cannot share a left edge, draw the line.** On a 393px screen
there is no room to indent a card's body to clear a 48px emblem, so
`LevelProgressCard` puts a hairline under its header band instead. An
almost-alignment reads as a mistake; a stated boundary does not.

**The trainer app is on the same system** (2026-09-15). It had been left on the
old spacing when the member screens moved over, so the two halves of one binary
had different gutters and the trainer's dock still sat on their content. All
eight trainer pages use `<Page>`, and `TrainerLayout` takes its gutter from
`--gutter` like the member shell.

**`createPortal` is called when the modal opens, never on every render.**
`document.getElementById('modal-root')!` from a render body throws *"Target
container is not a DOM element"* on a cold load into that route — the root
belongs to PhoneChassis, an ancestor, and nothing is committed yet. The member
screens got away with it by writing `{open && createPortal(...)}`; the trainer's
Settings and Availability called it unconditionally and **crashed to a blank
screen on a refresh**. Guard on the dialog's own flag.

**The type floor is 12px and 66 places were under it** — 10px and 11px labels,
one at 9px. This is read at arm's length, in a gym, often mid-set.

### The bento grid — `Bento` / `BentoCell`

Added 2026-09-15 for Book a Session, which was a stack of identical full-width
rows: honest, and completely flat. Every class looked exactly as important as
every other, so a fortnight of timetable read as a spreadsheet. A bento gives a
screen a hierarchy it can state in **layout**, which matters here because the
palette is deliberately two colours and cannot carry emphasis on its own.

- **Two columns, never three.** At 393px with a 20px gutter a third column
  leaves ~105px a cell, which is narrower than "Intermediate" at the 12px floor.
  The floor does not move; the column count does. (The PT slot grid is the one
  exception at three columns — a slot is a time and a length and nothing else.)
- **`wide` is an inline `gridColumn`, not `col-span-2`.** A class name has
  emitted no CSS in this app before, and a span that silently does nothing
  leaves a grid that is merely ugly rather than broken — so it would ship.
- **Hierarchy has to be real.** On the timetable the wide cell is the day's
  *first* class, because the next thing happening is what a member opened the
  screen for. It is deliberately **not** the recommended class: a filter can
  empty "recommended", and a day always has a first.
- **Never end a grid half empty.** With an odd tail, the last cell widens. A
  half-width hole at the bottom of a day reads as a missing class.
- **Cells stretch to the tallest in the row** (grid's default), so push each
  cell's action to its own bottom with `mt-auto` and a row of buttons lines up
  however unevenly the names above them wrap.
- `RingStat` takes `wide` too, so a gauge can sit in a bento — and its existing
  contract holds: **omit `fraction` and the ring is a bare track**, because a
  roster has no ceiling to be a fraction of.
- **`cols={3}` only for icon-and-label cells** (`NavTile`), where 110px is
  plenty and three-up is what stops six destinations from taking three rows.
  Both column counts are literal class names in a conditional, never
  `grid-cols-${n}` — Tailwind emits CSS only for names it can see, so the
  template would produce a grid with no columns at all.

**A rail was the wrong shape for a fixed set of six.** Book a Session carried
its six sibling destinations as a scrolling chip rail; two sat off the right
edge with the second sliced down the middle, which reads as a screen that has
not finished loading rather than as something you can swipe. Six is a number you
can simply show: three across, two rows, `NavTile`, violet because navigation is
structure and amber on that screen belongs to Book. A rail still earns its place
where the set is genuinely open-ended (`CategoryRail`), where the cut tile is
the affordance rather than a defect. `LinkRail` was deleted with its last
caller.

### A tile that only labels a destination is a tap that teaches nothing

The Membership tab was four `NavTile`s on an otherwise empty screen: My plan,
Payments, Attendance, CORE Points. It named its four destinations and stated
nothing — not the plan, not the expiry, not the balance, not whether the
membership was frozen — while the member opening that tab is asking exactly
*what is the state of my membership*.

Every cell now carries a real number **and** is the route to the screen that
number belongs to, so there are no bare navigation tiles left on it. Four
destinations, four facts, and the same wide/pair/wide bento as Book a Session.

It does **not** repeat Home's card. Home's violet panel is the member's
identity — name, photo, QR, today. This is the account: no QR, no name. The plan
state appears on both because it answers two different questions, and the rest
of the card does not.

The screen is short, and that is allowed. Filling the space would have meant
repeating the plan's included/excluded list from Home, and this project renders
nothing rather than a placeholder.

### The dock label must not be the thing that shrinks

"Membership" rendered 51px wide against the 75px it needs and was clipped to
"Member" with no ellipsis. The `max-width: 84px` cap looked like the culprit and
was not — it was never reached. `.dock__side` is `flex: 1 1 0` so each half is
exactly half the bar whatever is in it, and the only shrinkable thing inside the
active pill was the label itself.

`flex-shrink: 0` on `.dock__label` fixes it: the inactive sibling is an icon with
a 42px floor and gives up its padding instead. The cap is now 110px, and exists
only to give the reveal something to animate to. **Measure it rather than eyeball
it** — at 393 and 360 the label renders at its full width, the dock does not
overflow, and the check-in button stays dead centre (`fabOffCentre: 0`), which is
the regression the two-equal-halves layout exists to prevent.

### An interview is not a form — `StepFlow`

The plan builder asked its six questions as six bordered cards stacked on one
scroll, each with a small label and a row of 28px chips. Everything was correct
and it read as a form to fill in. The same six questions in the app's own
onboarding shape — progress across the top, one question in the display face,
full-width targets, Back and Next — read as an interview, which is what the
feature actually is.

`StepFlow` portals to `#phone-overlay-root`, so the questions sit over whichever
screen was already mounted and closing returns to it with nothing re-fetched.
The page underneath therefore has to be **unconditional**, not another branch of
the step machine: a flow that opens over nothing closes onto a blank screen.

**Omit `valid` for an optional step** — that is what turns Next into "Skip". The
final step always shows the submit label instead, so do not assert on "Skip"
there; assert that an empty answer does not block submitting.

### A card that looks like a control must be one

Challenges drew a full card — picture, title, description, points, days left —
and made a 60px pill the only tappable thing in it. Tapping the title did
nothing, which on a phone reads as a broken screen rather than as a card with a
button on it.

The card is the button now. Three rules came out of it:

- **Only in the safe direction.** Joining is the whole-card tap; leaving keeps
  the small deliberate pill. Joining is additive and undone by one tap; leaving
  gives up a place in something you may be seven sessions into, and a stray tap
  while scrolling should not do that.
- **The pill stays either way**, as a `<span>` when the card around it is the
  control. It is the visible affordance, not the target.
- **Never a `<button>` inside a `<button>`.** Invalid HTML, and the inner one
  swallows the outer's clicks in exactly the corner a member aims for.

### Back undoes a step; it does not navigate

Five member screens hardcoded `navigate('/member/home')` behind their back
arrow. Once the Training grid shipped, opening Progress from it and pressing
back landed the member on Home — a screen they had never been on. The arrow was
taking them somewhere rather than undoing what they did.

The house pattern, which five other screens already used:

```ts
window.history.length > 1 ? navigate(-1) : navigate('/member/home')
```

The guard matters: a cold load into the route (a notification, a bookmark) has
nothing behind it, and Home is the right floor. Verified by walking the route in
a browser — `scripts/back-navigation-check.js`, not by reading the handler.

**A screen with its own inner scroller still owes `--dock-clear`.** `<Page>`
applies it; a hand-rolled `flex-1 overflow-y-auto` does not, and the dock floats
over whatever the scroll ends on. Progress reserved 16px under a dock 116px
tall. Measure it by scrolling to the end and comparing the last text node's
bottom against the dock's top — at rest, a floating dock sits over mid-page
content on every scrolling screen, so a hit test at `scrollTop: 0` proves
nothing.

## Colour convention

**Amber = primary action. Violet = selection and structure.** Home's "Book a Session", "Save goal"
and Login's submit are amber; role pickers, selected tabs and progress rings are violet. The
bottom nav's centre check-in button is the only amber thing in the nav, on purpose.

## Typography

- **Body is Inter. Headings opt into `.display`** — Anton, uppercase, one weight (400 *is* the
  heavy cut). Never apply it globally: a member's own name or a long class title squeezed into
  all-caps condensed reads badly.
- **Type floor is 12px** (`text-xs`). No `text-[8px]`…`text-[11px]` — this ships on a phone.
- Inputs are ≥16px where the on-screen keyboard appears, or iOS Safari zooms the viewport on focus.

## Components (member app, `src/components/ui/`)

| Component | Notes |
|---|---|
| `Card.tsx` | `panelStyle` (a style object, because half the call sites are `motion.div`s), `insetStyle`, `<Card>`. Used to be a `const panel = {…}` copy-pasted into 13 files. |
| `Field.tsx` | `Field` + `TextInput`/`Select`/`TextArea`/`FieldError`. Controls carry `.field-input`, defined in `@layer components` so a caller's `className="py-3"` still wins. **A placeholder is not a label** — it only renders while empty. |
| `Skeleton.tsx` | `SkeletonList` is the standard loading state. Never a centred "Loading…"; it collapses the layout then snaps it back open. |
| `SectionHeader.tsx` | Uppercase display title + a muted line. That muted line is where a screen explains itself. |
| `StatCard.tsx` | Big figure + unit + optional `Pill`. `value` takes a string so a screen can pass an em dash — never a zero standing in for "unknown". |
| `ListRow.tsx` | Tinted icon tile, title, subtitle, and either a value or a chevron. Never both. |
| `WeekRings.tsx` | Sun→Sat. A ring fills only where an `attendance` row exists. Four states: visited (violet + check), today (amber; a halo pulses **only until** the visit lands), missed (past, empty, full opacity — a rest day is not a failure), upcoming (dimmed, so an empty Saturday on a Tuesday doesn't read as a missed session). Staggered spring entrance, gradient connector filling to today, and a footer that appears only once there is a real visit to count. Honours `useReducedMotion`. |
| `StepFlow.tsx` | One-question-per-screen wizard behind every "log a…" flow, plus `BigNumberInput` and `ChoiceTile`. Steps without `valid` are skippable and read "Skip" while empty. |
| `Avatar.tsx` | Photo → initials fallback, `onError` → initials. |
| `CheckInSheet.tsx` | The QR, openable from anywhere. Refuses to show a live code to an expired membership or someone already checked in. |

### BigNumberInput

Native number spinners are suppressed app-wide — two ~8px targets nobody can hit on a phone, and
they steal width from the value. The ± buttons replace them at 48px, stepped per field (half a
kilo, five minutes). They **seed from the member's own last reading**: a first tap on an empty
field jumps there rather than crawling from zero. Nothing is ever pre-filled — the seed applies
only on a deliberate tap, into an editable field that still needs Save.

## Admin modal forms

`components/ui/FormField.tsx` — `FormField` (label + `required` + `hint` + inline `error`),
`SectionLabel`, `FieldDivider`. Used by the Members, Trainers and Events modals.

**A placeholder is not a label**, same rule as the member app's `Field.tsx`. The Events New Event
modal proved it: five unlabelled inputs whose placeholders vanished on typing, so a filled-in form
was `test / test / date / test / 30 / 60` with nothing saying which of `30` and `60` was the
capacity and which the duration. Requirements were also typed into the label string (`"First Name
*"`), which meant the star could be — and was — left off fields that were in fact required; it's a
prop now.

Convention across all three: **raised panel (`--color-surface-raised`), inset inputs
(`--color-bg`)**, amber section labels, a validation error that *replaces* the hint rather than
stacking under it, and destructive actions through `ConfirmDialog` — never `window.confirm`, which
Events was still using for Cancel and Delete.

## Native pickers — `color-scheme: dark`

`:root { color-scheme: dark }`, **unlayered**, in both apps' `index.css`. The date picker
calendar, the time spinner, `<select>` dropdowns, scrollbars and autofill backgrounds are browser
*chrome*, not page content — no stylesheet can touch them. Without this declaration Chrome assumes
light and drops a **white calendar panel over the black app**, which is exactly what the admin's
New Event modal did: the member app had the declaration since its redesign, the admin never got it.

**Do not add `filter: invert(1)` to `::-webkit-calendar-picker-indicator` alongside it.** The two
cancel: under a dark `color-scheme` Chrome already paints that glyph light, so inverting turns it
black again — invisible on `--color-bg`. The invert is the fix for a *light*-scheme app. The member
app carried both for a while; only the `opacity` is ours now.

Verify with `getComputedStyle(dateInput).colorScheme === 'dark'` on the **input**, not just on
`:root` — the used value on the control is what the UA paints the popup from.

### Admin uses its own pickers instead

`color-scheme` picks dark or light and **nothing else** — the grid, the type, the blue selection,
the "Clear / Today" links and the month dropdown are Chrome's, differ per browser, and cannot be
themed. So the admin renders its own: `DatePicker.tsx`, `TimePicker.tsx`, both on `Popover.tsx`.

- Values stay **`'YYYY-MM-DD'`** and 24-hour **`'HH:MM'`** — byte-identical to what the native
  inputs produced, so no caller changed.
- Dates are built and compared as local Y/M/D parts. `new Date('2026-08-19')` parses as **UTC
  midnight**, the same off-by-one `toISOString()` causes in the other direction.
- **The panel portals to `document.body`.** Both modals scroll (`overflow-y-auto`), and a panel
  positioned inside one is clipped by it. Position comes from the anchor's rect, recomputed on
  scroll in the **capture** phase — a scroll inside the modal body never reaches `window`.
- Closing listens on `mousedown`, not `click`: a click listener fires before a button inside the
  panel gets its own event, so every pick would be swallowed.
- Six fixed week rows, always. Five would make the panel change height while paging, moving the
  buttons under the cursor.
- Member DOB opens on the **year grid** (`startView="year"`) — paging month-by-month to 1998 is
  300 clicks.

The **member app deliberately keeps the native pickers.** It is a phone app, and the OS wheel
picker is touch-optimised and already familiar; a custom popover is the wrong call there.

## Focus rings

**Unlayered in member, `:not(:focus-visible)`-scoped in admin.** Both were got wrong twice. The
reasoning is commented in both `index.css` files — don't "tidy" either without tabbing through the
app afterwards. Two specifics worth keeping in mind:

- Tailwind's `transition-all` animates `outline-color`, and Chrome **cannot interpolate away from**
  the UA's `-webkit-focus-ring-color` keyword — it pins the start value and the ring renders
  permanently **white**. The member rule re-lists `transition-property` without `outline` to opt out.
- An **inline** `border` or `outline` on a component outranks every stylesheet rule, so a
  `:focus-within` colour on that element can never apply. `.bignum-panel` keeps its base border in
  CSS for exactly this reason.

## Navigation

The bottom nav is a floating pill (`.dock`) with a raised amber centre button opening the check-in
QR. `overflow: visible` on `.dock` is load-bearing — a stray `overflow: hidden` clips the button's
top half with no other symptom. Trainers get the same pill without the centre button.

The trainers directory **lost its nav tab** to make room. It is reached from Home's shortcuts and
the Book screen's "Coaches" button. If you remove both, put the tab back — a routed page nothing
links to is a page nobody visits.

## Popovers inside a scrolling modal

`g-fitness-admin/src/components/ui/Popover.tsx` — used by the admin date and time pickers, which
open inside modal bodies that are themselves `overflow-y-auto`.

Three things are load-bearing:

- **It portals to `document.body`** and positions from the anchor's `getBoundingClientRect()`.
  Rendered in place, it would be clipped by the modal's own scroll container.
- **The scroll listener is capture-phase** (`addEventListener('scroll', place, true)`). Scrolling
  the modal body never reaches `window`, so a normal bubbling listener leaves the panel floating
  where the anchor used to be.
- **It closes on `mousedown`, not `click`.** A document-level `click` listener fires before a
  button *inside* the panel receives its own event, so the panel closes and the click lands on
  nothing.

It also measures before painting (`visibility: hidden` until placed) and flips above the anchor
when there is no room below, clamping to an 8px margin so it is never partly offscreen.
`zIndex: 300`, above modals at `z-50` and `z-[200]`.

## Animation you are allowed to depend on

**`requestAnimationFrame` does not fire on a page that is not compositing** — a background tab, a
locked phone, or this harness's browser pane when it is not displayed.

**CSS transitions freeze there too.** This page used to say a CSS transition was a safe substitute
for rAF. It is not, and the correction cost a bug: measured on a hidden page, a plain
`transition: opacity 200ms linear` driven from `0` to `1` still read `opacity: 0` **900ms later**,
with `getAnimations()[0]` reporting `playState: "running"` and `currentTime: 0`. The transition is
registered and simply never advances, exactly like rAF.

So the only mechanism you may depend on is **`setTimeout` plus a direct state write**. And the
stronger rule, which does not depend on remembering any of this:

> **Nothing whose visibility or correctness matters may be gated on an animation having run.**

Render the final value, then let an animation decorate it. The first draft of `ProgressRail`'s
streak card faded in from `opacity: 0` on a timer — on a non-compositing page that is a card
permanently at zero opacity, holding the one number the component exists to show. Same failure
shape as the `AnimatePresence` dialog that animated to `opacity: 0` and never unmounted.

Corollary for SVG: **a transitioned presentation attribute is worse than an untransitioned one.**
`BodyMap`'s selection ring set `stroke-width` to `2.5` and transitioned it; the attribute read
`2.5` while `getComputedStyle` read `1px` forever, so the tap had no visible effect. Tap feedback
snaps; only the decorative `fill` is allowed to ease.

Framer Motion remains decoration only.

## Framer overwrites `transform`, so never centre with it (admin only)

The admin global-search palette shipped sitting half its own width right of centre. It used the
ordinary Tailwind idiom `fixed left-1/2 -translate-x-1/2`, and Framer Motion animated `y` and
`scale` on the same element. Framer writes `transform` **inline, every frame**, which replaces the
class's `translateX(-50%)` — leaving `left: 50%` with nothing pulling it back.

Measured on the live page: the old markup was 0px off with no transform applied and **+340px off**
the instant a Framer transform landed — exactly half the 680px panel.

**This can only happen in the admin app**, and the reason is the v3/v4 split:

| App | Tailwind | `-translate-x-1/2` compiles to | Survives Framer? |
|---|---|---|---|
| `g-fitness-admin` | v3 | `transform: translate(var(--tw-translate-x), …) rotate(…) …` | **No** |
| `g-fitness-member` | v4 | `translate: var(--tw-translate-x) var(--tw-translate-y)` | **Yes** |

`translate` is a separate CSS property that composes with `transform` rather than competing with it,
so the member app's `Modal.tsx` and `CheckInSheet.tsx` — both `motion.div`s centred with
`-translate-y-1/2` — measured a 0px shift and need no change. Verified in both built bundles, not
in source.

Two fixes, both in use:

- **Let a flex parent do it.** `GlobalSearch` centres inside a `fixed inset-0 flex justify-center`
  wrapper and the animated panel carries no positioning transform at all. Preferred: layout stops
  depending on an animation library entirely.
- **Hand the offset to Framer.** `style={{ x: '-50%' }}` instead of the class — Framer composes it
  into the transform it already owns. Used by the `AdminLogin` glow orbs, which animate `scale`.

An element animated with `opacity` only is unaffected (Framer never writes `transform`), which is
why the `AdminLogin` scroll indicator still uses the class and still measures 0px off.

**The general rule: anything Framer animates must not also be load-bearing for layout.** Same family
as the `AnimatePresence` exit problem — treat Framer as decoration, never as positioning.

## Admin pages fill the window, and page by what fits (admin only)

A fixed page size is wrong on nearly every screen: twelve cards on a five-column grid is 5 + 5 + 2
with half a screen of nothing below. Lists and card grids on Members, Trainers, Payments, Credentials
and Activity take their page size from the space they are given.

- **The page is exactly the window's height**: `h-[calc(100vh-7rem)] flex flex-col` — the header is
  4rem and `<main>` pads 3rem, so `5rem` overran by 32px on every such page. The list sits in a
  `flex-1 min-h-0 overflow-y-auto` box and the pager comes after it, pinned to the bottom edge.
- **`hooks/useFillGrid.ts`** counts whole rows for a card grid: columns from the grid's own
  template, rows from the box's height over the **median** tile (a taller tile would lose a row).
  Destructure it — `const { measure, perPage } = useFillGrid(12)` — because the compiler lint
  treats an object whose member is passed as a `ref` as a ref, and refuses the read of `perPage`.
- **Stretching tiles pass `tileHeight`.** Credentials' rows share the height (`repeat(rows, 1fr)`)
  so the certificate previews grow; measuring a stretched tile only reports the current row count
  back, so it counts from the card's minimum instead and uses the returned `rows`.
- **A server-paged list** (Activity) measures the same way and passes the size as `limit`/`offset`;
  while its skeleton shows there is nothing to measure, so the last row height stands — falling back
  to an estimate there would change the size, refetch, show the skeleton, and loop.
- **Revenue and the Schedule board** fill by flex instead: chart heights and bar strips are
  percentages of the panel, never fixed pixels.

## Tab switches must not flash, or lose your place

Two separate defects, both reported from a real phone, both fixed in the shells rather than page by
page.

### The flash: `lib/pageCache.ts`

Every page switch re-mounted a screen with empty state, painted skeletons, then popped content in.
The cache seeds `useState` from the last render of that screen, so a revisit paints immediately and
refetches quietly behind it.

```ts
const cached = readCache<T>(KEY);
const [data, setData] = useState(cached ?? null);
const [loading, setLoading] = useState(cached === undefined);
const revisit = useRef(cached !== undefined);
useEffect(() => { load(revisit.current); }, [load]);   // `quiet` on a cache hit
```

Three rules it depends on:

- **Pass `quiet` on a cache hit.** A loud refetch sets `loading` back to true and reintroduces the
  exact flash the cache exists to remove.
- **Memory only, never `localStorage`.** It is keyed by *screen*, not by user, so a cache that
  outlived the process would hand the next person the previous member's Home. `logout()` calls
  `clearPageCache()` — the same shape of leak as the push subscription that used to survive sign-out.
- **Guard the error branch.** `if (!cancelled && !cached) setError(…)`, and likewise for any
  `setState(null)` in a `catch`. Blanking a populated screen on one dropped packet reads to the
  member as having *lost* something.

Components that fetch for themselves need their own entry, or they keep flashing on an otherwise warm
screen — `LevelProgressCard` was the last one, measured as a lone `h-44` skeleton on a filled Home.
Where two screens render the same query they **share one key** (`TRAINER_OVERVIEW_CACHE_KEY`).

### The lost scroll: `hooks/useScrollMemory.ts`

Scrolling Home, switching to Booking and coming back put you at the top. **The browser cannot help
here** — native scroll restoration applies to the *document* scroller, and nothing scrolls the
document: `<main>` scrolls inside a `100dvh` chassis.

A single `scrollTop` write does not work either. It clamps against the short skeleton that is on
screen at that instant and the offset is lost the moment real content makes the page taller. So the
hook re-applies the target on a **`setInterval`** while content settles — not `requestAnimationFrame`,
which does not tick on a page that is not compositing.

It stops as soon as it lands with room to spare, and yields immediately to a real user gesture:

```ts
const INPUTS = ['touchstart', 'wheel', 'pointerdown', 'keydown'] as const;
```

All four are needed. With only `touchstart`/`wheel`, dragging the scrollbar or pressing space fought
the restore loop and dragged the view back for a whole second. Positions are memory-only and cleared
in `logout()` alongside the page cache.


## An exiting dialog keeps eating taps

`#modal-root`, `#phone-overlay-root` and the other portal roots are
`pointer-events: none`, so anything portalled in has to opt back in. The obvious
place to do that is the dialog itself:

```jsx
<AnimatePresence>
  {isOpen && <motion.div exit={…} className="absolute inset-0 pointer-events-auto">…}
</AnimatePresence>
```

That is wrong, and it is wrong in a way nothing on screen reveals.
**AnimatePresence keeps an exiting subtree mounted until its exit animation
completes**, and on a page that is not compositing — a backgrounded tab, a locked
phone, this harness — the animation never completes. The dialog stays in the DOM
at `opacity: 0`, full-screen, still claiming pointer events, and silently
swallows every tap on the screen underneath.

Measured after pressing Close: `StepFlow` left one such node; `Modal` left
**fourteen** descendants still reporting `pointer-events: auto`, 2.5 seconds
later and indefinitely.

### Deriving it from `open` does not fix it

```jsx
{/* still broken */}
<motion.div style={{ pointerEvents: isOpen ? 'auto' : 'none' }} …>
```

An exiting child is re-rendered with its **last** props, so the ternary is frozen
at `isOpen === true` and never re-evaluated. Only a node that stays mounted
observes the flip.

### The fix: one always-mounted wrapper, outside AnimatePresence

```jsx
<div className="absolute inset-0" style={{ pointerEvents: isOpen ? 'auto' : 'none' }}>
  <AnimatePresence>
    {isOpen && <motion.div exit={…} className="absolute inset-0">…</motion.div>}
  </AnimatePresence>
</div>
```

The inner dialog declares **no** pointer-events at all and inherits. A child with
an explicit `pointer-events: auto` still receives events even when its parent is
`none`, so the declaration has to be removed, not just overridden.

The exit animation still plays on a phone that is awake; a stuck child on one
that is not is inert. This is the same rule as the progress bars and the body
map: **the moment a property carries correctness rather than decoration, write
it — never animate it.**

Both fixed. **Other overlays still carry the old shape** — `Notifications`,
`CheckInSheet`, `ChatbotPopup`, `AuthChoiceSheet`, `GymSelectionSheet`,
`NotificationDetail`, `AchievementUnlockOverlay`, the trainer sheets. Anything
whose direct AnimatePresence child is a `motion` component with `exit` *and* a
`pointer-events-auto` class is a candidate; measure before assuming, because a
plain `<div>` as the direct child unmounts immediately and does not leak.


## The body map is an anatomy chart, not a person icon

Three versions. The first drew a dozen detached `<rect rx>` pills — symmetric to
a tenth of a pixel and reading as nothing at all, because disconnected capsules
never merge into a figure. The second joined them into one silhouette with four
blobs on it: chest, arms, waist, legs. It was still a grey clip-art person with
four grey areas over it, and on a member who had logged nothing, the whole card
was dead.

The current one draws **nine muscle groups across a front and a back view**,
built to eight head-heights with a real V-taper (104px shoulders, 62px waist).

### Why not 3D

A rigged model with individually selectable muscles is a 3–15 MB `.glb` against
a ~1 MB bundle, and workbox **hard-fails the build on any precache entry over
2 MB** — the limit that already excludes the gym photos. It would be a runtime
download on Philippine mobile data, on mid-range Android, inside a TWA, to
render nine circumference numbers that a flat chart shows more legibly at 375px.
Strong, Hevy and Fitbod all use flat anatomical SVG for the same reason. The
front/back toggle delivers the part of 3D that actually helps — seeing the other
side — for nothing.

### Mirror, don't hand-match

Every muscle is defined **once, for the left side**, and drawn twice: the second
copy under `transform="translate(240,0) scale(-1,1)"`. Symmetry becomes
structural instead of something you maintain by eye across two coordinate lists.

### Verify containment by point-sampling, not by looking

Screenshots time out in this harness, so the geometry is checked programmatically:
walk each muscle path with `getPointAtLength`, map it through its own transform,
and test it against the silhouette with `isPointInFill`.

**Two traps in that test, both hit on the first run:**

- `isPointInFill` operates in the element's **own** user space. A mirrored
  silhouette part needs the point mapped back through the inverse of its
  transform first — without that, every muscle on the right-hand side reads as
  floating outside the body and you go chasing geometry that was already correct.
- The first honest run then found real problems: quads 37% outside, shins 62%.
  The legs were simply too thin for the muscles drawn on them — which also
  looked spindly under 104px shoulders. Thickening the legs fixed the look and
  the containment in one change.

Final: front 0% outside, back 1% on the glutes — a sliver inside the stroke width.

### One reading lights the front and the back muscle

**A tape measure produces a circumference, and a circumference goes all the way
around.** One reading around the upper arm covers biceps *and* triceps; one
around the torso covers pectorals *and* lats. So the two views share a
measurement, the label changes with the view, and the detail panel names the
site. Storing a separate "triceps" number would be inventing a measurement
nobody can take — the same class of lie as a hardcoded 4.9 star rating.

---

## Nocturne — the member app, from 2026-09-17

The member app was rebuilt on the structure of the Claude Design **Nocturne** prototype
(`Nocturne mobile app scope/design_handoff_member_nocturne/`), **in Core Fitness colour**. The
prototype was near-monochrome; the gym's owner asked for the violet and amber back, so Nocturne
supplies type, spacing, radii and hairlines and Core Fitness supplies the colour. Plan:
[2026-09-16-nocturne-member-redesign](superpowers/plans/2026-09-16-nocturne-member-redesign.md).
Anything above this section that describes the member dock, bento grids, `NavTile`, Anton or the
floating chat head is **history** — the admin app is unchanged.

### Tokens (member `src/index.css`)

| Token | Value | Use |
|---|---|---|
| `--color-bg` | `#08080E` | page ground |
| `--color-surface` / `-raised` / `-high` | `#12121C` / `#161522` / `#1E1D2B` | filled panels, inputs, empty cells |
| `--color-primary` | `#7C3AED` | violet fills and edges — **3.5:1, never small text** |
| `--color-primary-300` | `#c4b5fd` | violet **text** (10.8:1) |
| `--color-secondary` | `#F59E0B` | amber — actions (9.3:1) |
| `--color-text-primary` / `-secondary` / `-muted` | `#e9e9ed` / `#b2b6ca` / `#9397ab` | muted is the darkest text allowed |
| `--color-hairline` / `--color-separator` | 16% / 8% white | edges, row dividers |
| `--bar-height` / `--dock-clear` | `66px` / `24px` | bar in flow; clear is breathing room only |
| `--radius-card` / `--radius-btn` / `--radius-pill` | `14px` / `8px` / `99px` | |

Inter 400/500/600/700 only. `.display` survives as Inter 500 sentence case so unrebuilt call sites
inherit the new heading. Helpers: `.eyebrow` (spaced capitals), `.rule` (fading rule), `.hair`
(solid row divider), `.screen-title`.

### Colour roles — enforced by variant name in `noc.tsx`

- **structure (violet)** — where you are, what you have: the selected tab, a chosen day, progress,
  "Active", a switch that is on, the current plan.
- **action (amber)** — what you can do next: Book, Renew, Save, Send, Check in, Start. Also errors
  and warnings, because a problem you can fix is the next thing to do.
- **muted / ghost** — a secondary way out ("Log out", "See payment history").

One amber `fill` slab per screen at most (Renew on an expired membership).

### The kit

`components/ui/noc.tsx`: `Eyebrow`, `SectionHead`, `LineRow`, `NocButton` (46px), `ProgressBar`
(**renders nothing without a fraction**), `StatusPill`, `TextTabs`, `Chip`, `InlineStat`, `Panel`
(`glow` for the one hero panel). `components/ui/page.tsx`: `Page`, `PageTitle` (text "← Back" row,
`fallback` route). `Field`/`TextInput`/`Select`: 46px, surface fill, amber `FieldError`.
`StepFlow`'s `ChoiceTile` for any pick-one list. `WeekMarks` draws a week identically on Today and
Attendance.

Rules the rebuild kept to:
- **A list is rows on the page, not a card per row.** Cards inside cards made every screen read busy.
- **A number needs a real denominator** — Attendance Rate (visits ÷ 30) and the 20-visit
  Consistency Score were removed; the count stays.
- **Copy reads the tables**, never the prototype: points from `point_rules`, cancel reasons from
  `cancellation_reasons`, gym name/address/hours from `gym_settings`, plans from `membership_plans`.
  Prototype claims that were false here: 20 points a visit, a two-hour cancel rule, extra tiers and
  guest passes, an "Email me" setting.
- **Name a thing for what it is.** The rule-based assistant is "Ask the assistant", never "coach".
- **Tap targets ≥ 44px**, including row delete buttons and the back row.

### Verifying

`scripts/nocturne-shots.js` (tab roots), `nocturne-pages.js` and `nocturne-rest.js` (every other
member screen) photograph a 393×852 phone into `shots/` and report, per screen, the gap between
`<main>` and the bar (**must be 0**) and the count of text nodes under 12px (**must be 0**). Their
fixtures must use real column names and a real `Content-Range` count; three apparent bugs in this
rebuild were fixture columns (`notification_prefs.cat_*`, `public_trainers.id`,
`workout_logs.completed_at`). `plan-gates.js`, `trainer-scenarios.js`, `rating-gate-check.js` and
`back-navigation-check.js` were updated for the new wording and shell and pass (plan-gates also checks the lock marks on Today);
`book-class-bento-check.js` and `membership-hub-check.js` tested the removed layouts and were deleted; git history keeps them.
