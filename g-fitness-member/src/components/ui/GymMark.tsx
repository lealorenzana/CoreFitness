/**
 * A gym's own logo, at whatever size the caller needs.
 *
 * ## It falls back to a letter, never to the Core Fitness mark
 *
 * The bundled `/logo.png` belongs to the platform. Drawing it for a gym that
 * uploaded nothing would put Core Fitness's badge on G Fitness's app, which is
 * the same class of mistake as the login screen that printed Gym #1's address
 * to every member of every gym. A monogram in the gym's own accent says "this
 * gym, no picture" and says nothing untrue.
 *
 * `BrandMark` stays what it is — the *platform's* ringed mark on the sign-in
 * screen, where you are signing in to Core Fitness before you have chosen a
 * gym at all. That one is correct as it stands.
 *
 * ## Why the letter is not the first letter of a word
 *
 * `name.slice(0, 1)` on "G Fitness" gives "G", and on "Ana gymanigga" gives
 * "A" — both right. It is taken from the trimmed name so a leading space does
 * not render a blank circle, and `toUpperCase()` is applied because a gym
 * typed in lower case should still read as a badge.
 */
export default function GymMark({
  name,
  logoUrl,
  accent,
  size = 40,
}: {
  name: string;
  logoUrl?: string | null;
  /** A CSS colour. Falls back to the current accent token. */
  accent?: string | null;
  size?: number;
}) {
  const side = { width: size, height: size, borderRadius: '50%' } as const;

  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        // Decorative: the gym's name is always rendered next to this, so an
        // alt repeating it would have a screen reader say it twice.
        alt=""
        width={size}
        height={size}
        style={{ ...side, objectFit: 'cover', flex: 'none' }}
      />
    );
  }

  const letter = (name || '').trim().slice(0, 1).toUpperCase() || '?';
  return (
    <span
      aria-hidden
      style={{
        ...side,
        flex: 'none',
        display: 'grid',
        placeItems: 'center',
        // The gym's own colour at low opacity, so the monogram reads as
        // belonging to this gym rather than as a grey placeholder.
        background: accent ? `${accent}26` : 'var(--color-surface-2, rgba(255,255,255,0.06))',
        color: accent ?? 'var(--color-primary-300)',
        // Scales with the circle: a fixed 16px is a speck at 64 and clips at 24.
        fontSize: Math.max(12, Math.round(size * 0.42)),
        fontWeight: 700,
        lineHeight: 1,
      }}
    >
      {letter}
    </span>
  );
}
