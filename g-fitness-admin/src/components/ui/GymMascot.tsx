import { useEffect, useState } from 'react';

/**
 * A Core Fitness mascot in the gym's own colours (owner, 2026-11-27): inside a gym (this app, the member and
 * trainer apps) the mascots wear the gym's theme; only the website and the sign-in screens keep Core Fitness violet.
 *
 * The art is violet with orange accents. Each pixel's hue is moved, its lightness and saturation kept: violet to
 * the gym's main colour, orange to its second colour; whites, creams and blacks (low saturation) are left alone.
 * Done once per picture and colour pair on a canvas, cached as a data URL, so it also prints (the join poster).
 * Until it is ready the picture is hidden rather than flashing violet.
 */
const cache = new Map<string, Promise<string>>();

/** Any CSS colour to its hue in degrees (a canvas normalises the string), or null for a grey. */
function hueOf(colour: string): number | null {
  const c = document.createElement('canvas').getContext('2d');
  if (!c) return null;
  c.fillStyle = '#000'; c.fillStyle = colour.trim();
  const m = /^#([0-9a-f]{6})$/i.exec(String(c.fillStyle));
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const [h, s] = rgbToHsl((n >> 16) & 255, (n >> 8) & 255, n & 255);
  return s < 0.08 ? null : h;
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min, s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const k = (n: number) => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}

/** The recoloured picture; the original when either colour cannot be read or the picture will not load. */
function tintMascot(src: string, primary: string, action: string): Promise<string> {
  const hp = hueOf(primary), ha = hueOf(action);
  const key = `${src}|${hp}|${ha}`;
  if (!cache.has(key)) {
    cache.set(key, new Promise<string>((done) => {
      if (hp == null && ha == null) { done(src); return; }
      const img = new Image();
      img.onload = () => {
        const cv = document.createElement('canvas');
        cv.width = img.naturalWidth; cv.height = img.naturalHeight;
        const ctx = cv.getContext('2d');
        if (!ctx) { done(src); return; }
        ctx.drawImage(img, 0, 0);
        const px = ctx.getImageData(0, 0, cv.width, cv.height), d = px.data;
        for (let i = 0; i < d.length; i += 4) {
          if (d[i + 3] === 0) continue;
          const [h, s, l] = rgbToHsl(d[i], d[i + 1], d[i + 2]);
          if (s < 0.22) continue; // whites, creams, greys and the black screen stay
          const to = h >= 225 && h <= 320 ? hp : h >= 12 && h <= 62 ? ha : null;
          if (to == null) continue;
          const [r, g, b] = hslToRgb(to, s, l);
          d[i] = r; d[i + 1] = g; d[i + 2] = b;
        }
        ctx.putImageData(px, 0, 0);
        done(cv.toDataURL('image/png'));
      };
      img.onerror = () => done(src);
      img.src = src;
    }));
  }
  return cache.get(key)!;
}

/** The gym's two colours as the app has set them (gymTheme.ts): --color-primary and --color-secondary. */
function themeColours(): [string, string] {
  const s = getComputedStyle(document.documentElement);
  return [s.getPropertyValue('--color-primary') || '#7C3AED', s.getPropertyValue('--color-secondary') || '#F59E0B'];
}

export default function GymMascot({ src, primary, action, ...img }: React.ImgHTMLAttributes<HTMLImageElement> & { src: string; primary?: string; action?: string }) {
  const [tinted, setTinted] = useState<{ for: string; url: string } | null>(null);
  useEffect(() => {
    let alive = true;
    const [p, a] = primary && action ? [primary, action] : themeColours();
    void tintMascot(src, primary ?? p, action ?? a).then((url) => { if (alive) setTinted({ for: src, url }); });
    return () => { alive = false; };
  }, [src, primary, action]);
  const ready = tinted?.for === src;
  return <img alt="" {...img} data-art={src} src={ready ? tinted.url : src} style={{ ...img.style, visibility: ready ? undefined : 'hidden' }} />;
}
