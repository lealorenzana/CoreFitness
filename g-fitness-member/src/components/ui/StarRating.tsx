import { Star } from 'lucide-react';

/**
 * Stars, for reading and for setting.
 *
 * Amber, because on this palette amber is the primary action and a star is the
 * one place a warm accent is not decoration — it is the value being reported.
 * No greens or reds anywhere: a 2-star coach is not an error state.
 *
 * Partial fill is done with a clipped overlay rather than a half-star glyph, so
 * 4.3 reads as 4.3 instead of rounding to 4.5 and quietly flattering everyone.
 */

export function Stars({ value, size = 16 }: { value: number; size?: number }) {
  return (
    <span className="inline-flex items-center" aria-label={`${value} out of 5 stars`}>
      {[0, 1, 2, 3, 4].map((i) => {
        // How much of *this* star is filled: 1, 0, or a fraction for the one
        // the value lands inside.
        const fill = Math.max(0, Math.min(1, value - i));
        return (
          <span key={i} className="relative inline-block" style={{ width: size, height: size }}>
            <Star size={size} className="absolute inset-0"
              style={{ color: 'var(--color-border)' }} fill="currentColor" />
            {fill > 0 && (
              <span className="absolute inset-0 overflow-hidden" style={{ width: `${fill * 100}%` }}>
                <Star size={size} style={{ color: 'var(--color-secondary)' }} fill="currentColor" />
              </span>
            )}
          </span>
        );
      })}
    </span>
  );
}

/**
 * The input form of the same thing.
 *
 * Real `<button>`s rather than a styled range: this is tapped with a thumb on a
 * phone, and each star needs its own hit target and its own accessible name.
 * 40px targets — comfortably above the 24px minimum, because mis-tapping a
 * rating you cannot see yourself having mis-tapped is a bad failure.
 */
export function StarInput({
  value, onChange, disabled = false,
}: { value: number; onChange: (stars: number) => void; disabled?: boolean }) {
  return (
    <div className="flex items-center gap-1" role="radiogroup" aria-label="Your rating">
      {[1, 2, 3, 4, 5].map((n) => {
        const active = n <= value;
        return (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={active && n === value}
            aria-label={`${n} ${n === 1 ? 'star' : 'stars'}`}
            disabled={disabled}
            onClick={() => onChange(n)}
            className="w-10 h-10 flex items-center justify-center rounded-xl active:scale-90 transition-transform disabled:opacity-50"
          >
            <Star
              size={24}
              style={{ color: active ? 'var(--color-secondary)' : 'var(--color-border)' }}
              fill="currentColor"
            />
          </button>
        );
      })}
    </div>
  );
}

/**
 * The one-line summary a list row shows.
 *
 * Below the display threshold `average` is null and this says so in words.
 * Rendering 0 stars there would be inventing a score, and hiding the row
 * entirely would make a new coach look broken rather than new.
 */
export function RatingLine({
  average, count, size = 14,
}: { average: number | null; count: number; size?: number }) {
  if (average == null) {
    return (
      <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
        {count === 0
          ? 'Not rated yet'
          : `Not rated yet · ${count} ${count === 1 ? 'rating' : 'ratings'} so far`}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5">
      <Stars value={average} size={size} />
      <span className="text-xs font-semibold text-white">{average.toFixed(1)}</span>
      <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
        ({count})
      </span>
    </span>
  );
}
