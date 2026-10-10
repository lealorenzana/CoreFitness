/**
 * Where the device is, for "Find your gym" (0182) — asked once, kept in
 * memory only, never written anywhere. The browser remembers the member's
 * answer to its own permission prompt; this only avoids asking the GPS twice
 * in one visit.
 */
export interface Here { lat: number; lng: number }

let cached: Here | null = null;
let refused = false;

/** True when the browser already has permission, so no prompt would show. */
export async function locationGranted(): Promise<boolean> {
  try {
    const p = await navigator.permissions?.query({ name: 'geolocation' as PermissionName });
    return p?.state === 'granted';
  } catch {
    return false;
  }
}

/** The device's position, or null if refused, unavailable or slow. `ask` shows the prompt. */
export async function getHere(ask: boolean): Promise<Here | null> {
  if (cached) return cached;
  if (refused || !('geolocation' in navigator)) return null;
  if (!ask && !(await locationGranted())) return null;
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => { cached = { lat: pos.coords.latitude, lng: pos.coords.longitude }; resolve(cached); },
      () => { refused = true; resolve(null); },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 600000 },
    );
  });
}

/**
 * The 0.25° square a point falls in, centred — what is sent to the osm-gyms
 * function. The function only needs to know which tiles to read, so the
 * member's exact position never leaves the phone.
 */
export function tileCentre(h: Here): Here {
  return { lat: Math.floor(h.lat * 4) / 4 + 0.125, lng: Math.floor(h.lng * 4) / 4 + 0.125 };
}

/** Cleared with the other per-member state on sign-out. */
export function clearHere(): void { cached = null; refused = false; }
