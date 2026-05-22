import { clsx, type ClassValue } from 'clsx';

// Inline twMerge-like deduplication for Tailwind classes
// Handles the most common conflict cases without the tailwind-merge package
function twMerge(...classes: string[]): string {
  const merged = classes.join(' ');
  // Simple dedup: last class wins for same prefix
  const parts = merged.split(/\s+/).filter(Boolean);
  const seen = new Map<string, string>();
  for (const cls of parts) {
    // Extract prefix (everything before the last '-' segment for Tailwind utilities)
    const prefix = cls.replace(/^(hover:|focus:|active:|disabled:|dark:|sm:|md:|lg:|xl:|2xl:)/, '');
    const key = prefix.replace(/-[^-]*$/, '') || cls;
    seen.set(key, cls);
  }
  return Array.from(seen.values()).join(' ');
}

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
