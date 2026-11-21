# Design lessons — MAIN DESIGNING V1 (compiled 2026-11-21)

Source: 38 short videos in `C:\Users\USER\Downloads\UI UX design` (reels by UX-Engine / @davidm_ai /
"Removing AI Slop" creators). Transcribed locally (faster-whisper small.en) + 12 frames each; the 7
music-only clips were read from frames. Raw transcripts: watch-batch workdir (`c:\tmp\watch-batch-*`).
V-numbers = alphabetical file order in that folder.

**How to use this file:** every redesign mock-up and build is checked against the rules below.
Verdict per rule: **ADOPT** (apply as-is) · **ADAPT** (apply with a Core Fitness change, stated) ·
**SKIP** (with reason). Surfaces: **P** platform (super admin) · **A** admin/desk · **M** member ·
**T** trainer · **W** website.

Project rules still win over any lesson here (CLAUDE.md): data honesty, gym theme colours (never fixed
violet inside a gym), light = solid fills, admin fit pages, motion in CSS (`noc-*`), not framer rAF,
type floor 12px, a redesign never drops a feature.

---

## 1. The AI-slop tells — what to hunt for on every screen

| # | Tell | Fix | Src | Verdict |
|---|---|---|---|---|
| S1 | Gradient on header, button, chart fill, hero text ("supercharge your workflow") | One flat accent; colour then *means* something | V17 V19 V30 | ADOPT (already a light-mode rule; extend to dark) |
| S2 | Pastel icon tile per card, one colour per number | Drop the tiles; the number is the hero | V17 | **ADAPT — conflicts with owner's icon tiles by kind on member rows. Ask.** |
| S3 | Four identical cards, same size/weight/badge | One primary metric big, three secondary small — eye lands once | V17 V30 | ADOPT (A dashboard, M Today, P overview) |
| S4 | 16px radius + drop shadow on everything | Hairline borders, tighter radius on smaller parts, shadow only on what opens *above* the page | V17 V14 V22 | **ADAPT — glass + RdCard glow are owner choices. Ask.** |
| S5 | "Welcome back, Jordan 👋" + "+12.5% from last month" | Name the period (reporting month); trend says what it's compared to; tabular digits; sparkline over badge | V17 V30 | ADOPT — matches data honesty |
| S6 | Purple blob / glow behind everything | Neutral ground; the only colour is on the product / the one button | V19 V30 V3 | ADOPT |
| S7 | "Get started" + "Learn more" side by side, equal | One primary; second becomes a text link with → | V19 V21 | ADOPT |
| S8 | "Trusted by 10,000+ users" + grey logos | One real quote: name, role, a result with a unit — or nothing | V19 | ADOPT (W) — never invent; no quote until a real one exists |
| S9 | Three feature cards, icon in circle, "Fast. Secure. Easy." | Show the product: one screenshot, three annotations pointing at real UI | V19 | ADOPT (W) |
| S10 | Emojis as icons | One icon set | V30 V36 | ADOPT |
| S11 | Purple-gradient login with 6 options | One title, one CTA, a background that says what the product is | V3 | ADAPT — background = the gym's own photo/colour, never a stock sky |
| S12 | Uneven spacing, cards not aligned | One left edge, three gap sizes reused | V30 V36 | ADOPT |

Substitution test (art-director): swap the logo — if it still fits another product, it's not done.

## 2. Layout, hierarchy, density

- **L1 One hero number.** The number people open the screen for is huge (weather temp → for us: days left
  on membership / today's check-ins / cash today). V36 — ADOPT M/A/T.
- **L2 One left edge.** Six edges look random; everything on one. V36 — ADOPT.
- **L3 Three gap sizes**, reused. On a 4px grid. V36 V14 — ADOPT (check against Nocturne rhythm tokens).
- **L4 Group what belongs together** (hourly in one card, week in another). V36 — ADOPT.
- **L5 Range bars over lists of numbers** where a range is real (e.g. weekly attendance min/max). V36 — ADAPT, only with real data.
- **L6 Density reads as competence** (Linear): 13px text, 32px rows, letter-spacing −1%, 4px grid, 16px
  icons centred on text; labels left, numbers right, nothing centred. V14 — ADAPT for A/P (desktop) only;
  member stays 12px floor + 44px touch rows.
- **L7 Hick's law:** show 3–5 everyday tools, rest behind *More*; one action gets the accent; a word under
  every icon; group by job; shortcuts for experts. V27 V4 — ADOPT (member More sheet, admin toolbars).
- **L8 UX laws vocabulary** to reason with: Fitts (bigger, closer hit areas), Hick, Miller (chunk ~7),
  Doherty (<400ms response), Postel (liberal input), Jakob (work like other apps), frequency of use. V4 — ADOPT as review vocabulary.
- **L9 Layout vocabulary** (single column, two column, grid, F-pattern, Z-pattern, split screen, magazine,
  asymmetrical, holy grail, masonry, hero landing, full-screen); bento reflows by breakpoint
  (1 → 2 → 3 → 4 cols). V16 V26 — reference for W and A.
- **L10 Tables on a phone: restructure, don't shrink.** Rank columns by use → identity, value, state; drop
  the ID; two lines per row (name left, amount right; status + date under); one fixed slot for the amount,
  tabular figures; label only the ambiguous ("Due Mar 4"); sorting becomes a control; tap row → detail
  expands in place or a bottom sheet, never a new page for a glance; breakpoint belongs to the *table*
  (container query ~700px). V8 — ADOPT for M/T lists and admin side panels. (Note: our "See all → own
  page" rule is for long lists; a single record's detail = sheet.)

## 3. Colour

- **C1 60 / 30 / 10.** 60% neutral ground, 30% secondary (cards, sidebar), 10% accent for *the one action*.
  Blur test: three flat zones, not confetti. V15 V24 — ADOPT; maps to violet = state, amber = action.
- **C2 Count the accent:** more than ~3 accent elements per screen → nothing stands out. V15 V14 — ADOPT.
- **C3 One accent colour** (Linear: indigo only on selected row + primary button). Status as an icon, not a coloured pill. V14 — ADAPT: we keep two roles (violet/amber); StatusPill review needed.
- **C4 Tint the greys** ~4% of the accent hue. V15 — ADOPT via `color-mix` with `--color-primary` (keeps gym theme).
- **C5 Build a 9-step scale per colour, name by job** not value; dark mode becomes "free". V24 — already true (`c700`, `--fill-*`); ADOPT the naming discipline.
- **C6 Contrast:** text ≥ 4.5:1; field borders at rest ≥ 3:1. V24 V2 V36 — ADOPT (harnesses already check faint words).
- **C7 Gradients done right:** interpolate in OKLCH (`linear-gradient(in oklch, …)`), add a middle stop,
  far-apart hues need a route, grain on big dark gradients against banding, close lightness behind text.
  V10 — ADAPT: gradients only as decoration in dark mode, never behind words in light (project rule).
- **C8 Dark mode, not lazy:** no pure black (deep grey); body text ~87% white, details grey; lighten the
  accent for dark (2.9 → 8.6:1); raised = *lighter*, not shadowed; dim bright photos to ~82%; a soft glow
  only on the one thing to press. V12 — ADOPT; audit Nocturne against each.

## 4. Type and icons

- **T1 One plain style** — no caps + italics + underline shouting. V36 — ADOPT.
- **T2 Big type tight:** pull letter-spacing in as size grows (clock digits −6px). V37 V14 — ADOPT for hero numbers.
- **T3 Tabular digits** wherever numbers stack or change. V22 V17 V8 — ADOPT (`font-variant-numeric: tabular-nums`).
- **T4 Balanced text** (`text-wrap: balance`) on headings — no orphan word. V22 — ADOPT.
- **T5 Icon weight matches label weight** (1.75 stroke outline set, one family, one size). V37 V22 V36 — ADOPT; audit Lucide stroke widths.
- **T6 Optical centring:** a play triangle nudged right; centre by eye, not by box. V37 V22 — ADOPT.
- **T7 Labels say the action:** "Create workspace" not "Submit". V21 — ADOPT (fits "Copy is a claim").

## 5. Shape and depth

- **D1 Concentric corners:** inner radius = outer − padding (12 out, 8 pad → 4 in). Selection ring 2px out → outer = inner + gap. V32 V37 V3 V22 — ADOPT.
- **D2 Radius follows size:** small 4 · medium 8 · large 16, one scale. V32 — ADOPT (check tokens).
- **D3 Pill = one line only** (chips, avatars, toggles); multiline gets a real number. V32 — ADOPT.
- **D4 A corner means space beyond it:** a bottom sheet's bottom corners = 0; edge-touching = no corner; card clips full-bleed images; inset image radius = card radius − padding. V32 — ADOPT.
- **D5 Continuous (squircle) corners** where supported. V9 — SKIP for now (no CSS support outside `corner-shape` experiments).
- **D6 Hairlines:** 1px border at ~8% (dark) instead of shadows; depth from 3 background values; hover changes surface value, not elevation. V14 V17 V22 — ADAPT (see S4 question).
- **D7 Layered shadows tinted by the background colour**, only on floating things. V3 — ADOPT for dialogs/toasts/menus (already "floating things stay solid").
- **D8 Frosted glass: blur, don't block** — content stays visible, labels still read. V37 — consistent with owner's glass.

## 6. Motion (all CSS; reduced-motion respected)

Timing table:
| Thing | Value | Src |
|---|---|---|
| Hover feedback | ≤ 80ms | V14 |
| UI transitions | < 150ms (desktop tools) | V14 |
| Dropdowns / popovers | 150–250ms, start at scale 0.95, grow **from the trigger** | V6 V34 V25 |
| Exits | ~20% shorter than entrances | V6 |
| List stagger | 30ms per row | V6 |
| Press | scale 0.97 **on touchdown** (`:active`), never wait for release | V1 V6 V9 |
| Entrances | ease-out; on-screen moves ease-in-out | V6 |

Rules:
- **M1 Never scale from 0** — from 0.95–0.97. V1 V6.
- **M2 Wrong password → shake** the field (plus the message). V1 V34 — ADOPT.
- **M3 Stepper: slide in the direction of travel**, don't fade. V1 V6 — ADOPT (`StepFlow`).
- **M4 `interpolate-size: allow-keywords`** to animate to `height:auto`. V1 — ADOPT (Chrome/Android TWA supports; progressive).
- **M5 Animate transform/opacity only**, never top/left. V1 — ADOPT.
- **M6 Theme switch: disable transitions during the swap.** V1 — ADOPT (check light/dark toggle).
- **M7 Tooltips: delay only the first**, later ones instant. V1 — ADOPT (admin `TooltipLayer`).
- **M8 Springs for things you touch, not for everyday transitions.** Toggles stretch (~12%) then settle;
  sheets follow the finger then spring to the snap point; flicks keep momentum; drag past an edge =
  rubber-band resistance. Menus/pages: no bounce. V6 V9 V14 V25 V34 — ADOPT; springs via CSS `linear()` easing, not JS rAF.
- **M9 Interruptible:** a closing panel reverses from where it is. V9 — ADOPT (CSS transitions do this; keyframes don't).
- **M10 Morph, don't pop:** alerts grow out of their source; icons crossfade with scale + blur; play↔pause morph; tab pill slides. V37 V33 V6 V34 V25 — ADOPT where cheap.
- **M11 Deleting a row: nothing jumps** — the gap closes smoothly. V34 — ADOPT.
- **M12 Pulse to confirm success**; check-mark morph on pay/save. V6 V25 — ADAPT (cash-only: "Recorded" tick, no confetti on money).
- **M13 Toasts stack** (new slides up, old steps back). V25 — ADOPT.
- **M14 Like/cheer button:** optimistic, overshoot on release, rolling count, colour only when on. V31 — ADOPT for any toggle-like action (e.g. Send congrats).
- **M15 Sound** on a like. V31 — **ASK** (moments already have sounds behind a switch).
- **M16 12 animation principles** as a vocabulary (squash & stretch, anticipation, staging, follow-through, slow in/out, arcs, secondary action, timing, exaggeration, appeal). V4 — reference.
- **M17 Peak-end rule:** finish a flow with a rewarding moment (login fly-in → boarding pass). V3 — ADAPT: end of check-in / first workout.
- **M18 Wheel picker with snap, momentum, per-step tick.** V20 — ADAPT for `BigNumberInput` (age, weight, reps).

## 7. Loading and feedback

- **F1 Skeleton, not spinner:** shapes match the real content (circle avatar, short bar name, long lines);
  shimmer left→right; data lands in the exact slots, no layout jump. V28 V38 V35 — ADOPT.
- **F2 Optimistic UI** for actions; roll back quietly on failure. V38 V31 — ADAPT: never for money, bookings
  or anything SQL may refuse (bookings can be refused by 0017/0068) — only likes/cheers/read-marks.
- **F3 Button loading:** keep width, swap label for spinner, ignore second click. V21 — ADOPT.
- **F4 Disabled button says why** ("Name your workspace first"). V21 — ADOPT.
- **F5 iOS feedback vocabulary:** dynamic island, live activity, HUD, action sheet, swipe actions, haptics,
  jiggle, symbol effects, shake to undo. V18 — reference (Android TWA: `navigator.vibrate` for haptics).

## 8. Forms and inputs

- **I1 Label outside the field** (or floats up and stays); placeholder is never the label. V2 V13.
- **I2 44px tall, 16px text** (below 16 iOS Safari zooms). V2 V5 — ADAPT: member 16px inputs; admin desktop may keep 14.
- **I3 Focus: 2px accent ring with offset**; never `outline:none`. V2 V21 V22.
- **I4 Border at rest ≥ 3:1.** V2.
- **I5 Validate on blur; after the first error, on every keystroke; clear the moment it's fixed.** V2 V13.
- **I6 Errors under the field with an icon; reserve the space so submit never moves**; on submit a summary at top linking to each broken field. V13.
- **I7 Right `type` / `autocomplete` / `inputmode`:** email, `one-time-code`, `inputmode="numeric"` for codes (never `type=number`), `enterkeyhint="send"` in chat. V2 V5 V13.
- **I8 Style the autofill state** to match the surface (Chrome's pale blue on dark). V13.
- All ADOPT (M, T, A, P, W forms).

## 9. Mobile web polish (member TWA, trainer)

- **W1** `-webkit-tap-highlight-color: transparent`. V5
- **W2** Hover styles inside `@media (hover:hover)` so they don't stick after a tap. V5
- **W3** `overscroll-behavior: contain` on sheets/popups. V5
- **W4** `touch-action: manipulation` to kill double-tap zoom. V5
- **W5** `scroll-snap` on carousels; momentum + rubber band at the ends. V5 V1 V9
- **W6** Tap targets ≥ 44px even if the button looks smaller. V21 V4
- All ADOPT — check which are already in member `index.css`.

## 10. Onboarding and flows

- **O1 First run asks one question then opens.** V11 — ADOPT (registration / first sign-in; already asks Light/Dark once, 0254).
- **O2 Checklist of three on home, one already ticked**; remembers progress (on the account, not localStorage). V11 — ADAPT for new members and new gym owners (setup).
- **O3 Empty state = one button** that fills the space ("No projects yet · + New project"). V11 V22 — ADOPT.
- **O4 One coach mark, near the thumb, on the next button; max 3 tips; Skip always in the same corner.** V11 — ADOPT (guides).
- **O5 Airbnb search:** full-screen sheet = one task; steps one at a time, each finished step folds into a tappable line; result count on the button, live; floating pill low for map/list; recents before typing. V7 — ADAPT for booking a coach/class and admin member search.

## 11. Navigation / pagination / cursors (desktop)

- **N1 Pagination vocabulary:** classic, pills, dots, bordered, track, segmented, progress (2/5), steps. V29 — reference; admin `Pager` already windowed.
- **N2 Every action shows its shortcut; Cmd-K searches.** V14 — ADAPT for admin/platform (desk speed).
- **N3 CSS cursors say what will happen:** pointer, text, help, wait, not-allowed (disabled), grab/grabbing (drag), move, zoom-in, col-resize, crosshair. V23 — ADOPT for A/P.

---

## Open questions for the owner (block S2, S4, C3, M15)
1. Icon tiles on member rows, admin `RdCard glow`, glass: keep (your earlier choice) or let the videos' "hairline + no tile" rule win on redesigned pages?
2. Status as a coloured pill (`StatusPill`) vs Linear's "status is an icon, colour only for the one action"?
3. Sound on small actions (cheer, check-in) — on, off, or behind the existing moments switch?

## Already true in Core Fitness (don't re-do)
Data honesty vs fake stats (S5 S8), light mode solid (C7), floating things solid (D7), fit pages (L6),
See all → own page, motion in CSS, type floor 12px, 0254 one-question first sign-in.
