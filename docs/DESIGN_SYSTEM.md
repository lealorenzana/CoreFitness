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
