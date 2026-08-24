/**
 * The full-bleed gradient behind the auth screens.
 *
 * A dark core opening into a coloured glow from above — the shape of the
 * snippet this came from, with three changes it needed to work here.
 *
 * ## 1. Inline style, not a Tailwind arbitrary value
 *
 * The original is `[background:radial-gradient(125%_125%_at_50%_10%,#000_40%,#63e_100%)]`.
 * Tailwind extracts arbitrary values by **scanning source text at build time**,
 * so the whole string has to be a literal. The moment the colour depends on
 * which role tab is selected there is no literal to find, the utility is never
 * generated, and the class silently emits no CSS at all — the failure this
 * project has already been bitten by twice, and the reason DESIGN_SYSTEM says
 * to verify against the built bundle rather than the source.
 *
 * A value that changes at runtime belongs in `style`, where it cannot go
 * missing.
 *
 * ## 2. No negative z-index
 *
 * The original wraps itself in `-z-10`. That works when the parent forms a
 * stacking context; the login wrapper is `position: relative` with `z-index:
 * auto`, which does **not**, so a negative-z child escapes to the nearest
 * ancestor that does and paints behind `MobileFrame` instead of behind the
 * form. This sits at `z-index: 0` and the content above it already carries
 * `relative z-10`, so the ordering is explicit on both sides.
 *
 * ## 3. The inner stop is the theme token
 *
 * `#000` would make the auth screens fractionally darker than every other
 * screen in the app. `--color-bg` keeps them identical, and keeps the one
 * hardcoded colour in the gradient down to the accent that is being animated.
 *
 * The transition is on `background`, which is a real interpolatable property —
 * unlike the custom property feeding it. That distinction is why the tint can
 * animate without any JS or animation-frame dependency, which matters on a page
 * that may not be compositing.
 */
export default function AuthBackground({
  accent,
  /** Horizontal origin of the glow, as a CSS percentage. */
  originX = '50%',
  transition,
}: {
  accent: string;
  originX?: string;
  transition?: string;
}) {
  return (
    <div
      aria-hidden="true"
      className="absolute inset-0 pointer-events-none"
      style={{
        zIndex: 0,
        background:
          `radial-gradient(125% 125% at ${originX} 10%, var(--color-bg) 40%, ${accent} 100%)`,
        transition,
      }}
    />
  );
}
