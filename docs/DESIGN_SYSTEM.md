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

So anything that must be *correct* rather than merely pretty — a toast dismissing, a progress bar
reaching its final width, an overlay unmounting — uses a CSS transition or `setTimeout`. Framer
Motion is for decoration only. A rAF-driven dismissal simply never dismisses on a phone whose
screen went off mid-animation.
