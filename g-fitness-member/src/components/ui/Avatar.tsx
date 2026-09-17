import { useState } from 'react';
import { cn } from '../../lib/utils';

/**
 * Profile photo with an initials fallback.
 *
 * Three separate local versions of this existed (TrainerHome, TrainerProfile,
 * and the admin header) and they disagreed about sizing, shape and what to do
 * when there is no photo. This is the one implementation.
 *
 * Initials are the deliberate fallback rather than a generic silhouette: most
 * members will never upload a photo, and a wall of identical grey figures tells
 * you nothing about who is who.
 *
 * A photo that 404s (deleted from storage, or a stale URL on the profile row)
 * falls back to initials rather than showing a broken image icon.
 */

interface AvatarProps {
  name: string | null | undefined;
  photoUrl?: string | null;
  /** Rendered size in px. */
  size?: number;
  className?: string;
  /** Violet by default; amber marks the signed-in user's own avatar. */
  tone?: 'primary' | 'secondary';
}

export function initialsOf(name: string | null | undefined): string {
  if (!name) return '';
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

export default function Avatar({
  name,
  photoUrl,
  size = 40,
  className,
  tone = 'primary',
}: AvatarProps) {
  const [failed, setFailed] = useState(false);
  const initials = initialsOf(name);
  const showPhoto = Boolean(photoUrl) && !failed;

  // Nocturne's disc: a tint and an edge in the role colour, the initials in
  // its text-safe step. A solid violet slab with white initials read as a
  // button; this reads as a person.
  const edge = tone === 'secondary' ? 'var(--color-secondary)' : 'var(--color-primary)';
  const fg = tone === 'secondary' ? 'var(--color-secondary)' : 'var(--color-primary-300)';

  return (
    <div
      className={cn('rounded-full overflow-hidden flex-shrink-0 flex items-center justify-center', className)}
      style={{
        width: size,
        height: size,
        background: showPhoto ? 'var(--color-surface-raised)' : `color-mix(in srgb, ${edge} 16%, transparent)`,
        boxShadow: showPhoto ? undefined : `inset 0 0 0 1px ${edge}`,
        color: fg,
      }}
      // Empty alt/label when there is no name — an avatar reading "unknown
      // member" aloud is worse than one the screen reader skips.
      aria-label={name ? `${name}'s photo` : undefined}
      role={name ? 'img' : undefined}
    >
      {showPhoto ? (
        <img
          src={photoUrl as string}
          alt=""
          className="w-full h-full object-cover"
          loading="lazy"
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="leading-none" style={{ fontSize: Math.round(size * 0.34), fontWeight: 500 }}>
          {initials}
        </span>
      )}
    </div>
  );
}
