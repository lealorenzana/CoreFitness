/**
 * The weekly timetable as a file the gym can pin up, open in Excel, or hand to
 * a member.
 *
 * ## Why this draws the grid rather than screenshotting the page
 *
 * The obvious approach is to serialise the rendered calendar into an SVG
 * `<foreignObject>` and paint that to a canvas. It does not survive contact
 * with this app. The whole design system is CSS custom properties defined in a
 * stylesheet, and a `foreignObject` carries no stylesheet — every colour comes
 * out unset, so the export is black text on transparent. Working around that
 * means walking the tree and inlining every computed style, which is more code
 * than drawing the thing, and fails again the moment a webfont is involved
 * because an unloaded face silently falls back mid-render.
 *
 * html2canvas would handle it, but it is a CDN dependency for one button.
 *
 * So this takes the same data the calendar renders and draws it with the canvas
 * 2D API. More lines, and every one of them deterministic: the output does not
 * depend on what the browser happened to have painted, on fonts having loaded,
 * or on the page being scrolled to the right place. It also means the export
 * can be sized for **print** rather than for a sidebar-width column — which is
 * what a timetable pinned to a wall actually needs.
 *
 * ## Colours are literals here, not tokens
 *
 * A PNG has no theme. `getComputedStyle` would read whatever the admin's
 * current theme is and bake it in, so a dark-mode admin would export white text
 * on a dark sheet and waste a print cartridge. This palette is deliberately
 * fixed, light, and print-friendly.
 */

export interface ScheduleSlot {
  id: string;
  name: string;
  /** 0 = Sunday, matching `class_templates.day_of_week`. */
  dayOfWeek: number;
  /** 'HH:MM' or 'HH:MM:SS'. */
  startTime: string;
  durationMinutes: number;
  trainerName: string | null;
  location: string | null;
  capacity: number | null;
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Fixed and light — see the note above about themes. */
const INK = '#111827';
const MUTED = '#6b7280';
const LINE = '#d1d5db';
const HAIRLINE = '#e5e7eb';
const PAPER = '#ffffff';
const HEADER_BG = '#f9fafb';
const BLOCK_BG = '#fef3c7';
const BLOCK_EDGE = '#d97706';

function minutesOfDay(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function clock12(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const suffix = h < 12 ? 'am' : 'pm';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${hour}${suffix}` : `${hour}:${String(m).padStart(2, '0')}${suffix}`;
}

/**
 * Greedy lane packing, so two classes at the same hour sit side by side rather
 * than on top of each other. Same algorithm the on-screen calendar uses; if one
 * changes the other has to, or the printout stops matching the screen.
 */
function packLanes(slots: ScheduleSlot[]): Map<string, { lane: number; of: number }> {
  const out = new Map<string, { lane: number; of: number }>();
  for (let dow = 0; dow < 7; dow++) {
    const day = slots
      .filter((s) => s.dayOfWeek === dow)
      .sort((a, b) => minutesOfDay(a.startTime) - minutesOfDay(b.startTime));
    const laneEnds: number[] = [];
    const placed: { id: string; lane: number }[] = [];
    for (const s of day) {
      const from = minutesOfDay(s.startTime);
      const to = from + s.durationMinutes;
      let lane = laneEnds.findIndex((end) => end <= from);
      if (lane === -1) { lane = laneEnds.length; laneEnds.push(to); }
      else laneEnds[lane] = to;
      placed.push({ id: s.id, lane });
    }
    for (const pl of placed) out.set(pl.id, { lane: pl.lane, of: Math.max(1, laneEnds.length) });
  }
  return out;
}

/** Truncates to fit, with an ellipsis, so a long class name cannot bleed out of its block. */
function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let s = text;
  while (s.length > 1 && ctx.measureText(s + '…').width > maxWidth) s = s.slice(0, -1);
  return s + '…';
}

/**
 * Renders the week to a PNG blob.
 *
 * Returns null when there is nothing to draw. An empty timetable exported as a
 * blank sheet looks like the export failed; the caller says so in words instead.
 */
export function renderSchedulePng(
  slots: ScheduleSlot[],
  opts: { gymName: string; scale?: number } = { gymName: 'Core Fitness' },
): Promise<Blob | null> {
  if (slots.length === 0) return Promise.resolve(null);

  // 2 gives a sheet that still looks sharp printed at A4; the canvas is scaled
  // rather than the coordinates, so every measurement below stays readable.
  const scale = opts.scale ?? 2;

  const PAD = 24;
  const HEADER_H = 64;
  const DAY_H = 32;
  const TIME_W = 62;
  const COL_W = 150;
  const ROW_H = 56;          // one hour
  const FOOTER_H = 28;

  const starts = slots.map((s) => minutesOfDay(s.startTime));
  const ends = slots.map((s) => minutesOfDay(s.startTime) + s.durationMinutes);
  const firstHour = Math.max(0, Math.floor(Math.min(...starts) / 60));
  const lastHour = Math.min(24, Math.ceil(Math.max(...ends) / 60));
  const hours = Math.max(1, lastHour - firstHour);

  const W = PAD * 2 + TIME_W + COL_W * 7;
  const H = PAD * 2 + HEADER_H + DAY_H + ROW_H * hours + FOOTER_H;

  const canvas = document.createElement('canvas');
  canvas.width = W * scale;
  canvas.height = H * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) return Promise.resolve(null);
  ctx.scale(scale, scale);

  // A canvas starts transparent, and a transparent PNG dropped into a document
  // or printed comes out with whatever is behind it.
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, W, H);

  const gridX = PAD + TIME_W;
  const gridY = PAD + HEADER_H + DAY_H;

  // ── Title ────────────────────────────────────────────────────────────────
  ctx.fillStyle = INK;
  ctx.font = '600 22px system-ui, -apple-system, Segoe UI, sans-serif';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(`${opts.gymName} — Class Timetable`, PAD, PAD + 24);

  ctx.fillStyle = MUTED;
  ctx.font = '13px system-ui, -apple-system, Segoe UI, sans-serif';
  ctx.fillText(
    `Weekly schedule · ${slots.length} ${slots.length === 1 ? 'class' : 'classes'}`,
    PAD, PAD + 44,
  );

  // ── Day headers ──────────────────────────────────────────────────────────
  ctx.fillStyle = HEADER_BG;
  ctx.fillRect(gridX, PAD + HEADER_H, COL_W * 7, DAY_H);

  ctx.textAlign = 'center';
  ctx.font = '600 13px system-ui, -apple-system, Segoe UI, sans-serif';
  for (let d = 0; d < 7; d++) {
    ctx.fillStyle = INK;
    // The full name fits at this column width; the short one is the fallback
    // for a narrower export rather than the default.
    const label = COL_W >= 110 ? DAYS[d] : DAYS_SHORT[d];
    ctx.fillText(label, gridX + COL_W * d + COL_W / 2, PAD + HEADER_H + 21);
  }

  // ── Hour rows ────────────────────────────────────────────────────────────
  ctx.textAlign = 'right';
  ctx.font = '12px system-ui, -apple-system, Segoe UI, sans-serif';
  for (let i = 0; i < hours; i++) {
    const y = gridY + ROW_H * i;
    ctx.fillStyle = MUTED;
    ctx.fillText(clock12((firstHour + i) * 60), gridX - 10, y + 15);

    ctx.strokeStyle = HAIRLINE;
    ctx.lineWidth = 1;
    ctx.beginPath();
    // +0.5 so a 1px line lands on a pixel instead of straddling two and
    // rendering as a soft 2px grey.
    ctx.moveTo(gridX, Math.floor(y) + 0.5);
    ctx.lineTo(gridX + COL_W * 7, Math.floor(y) + 0.5);
    ctx.stroke();
  }

  // ── Column separators and the outer frame ────────────────────────────────
  ctx.strokeStyle = LINE;
  for (let d = 0; d <= 7; d++) {
    const x = Math.floor(gridX + COL_W * d) + 0.5;
    ctx.beginPath();
    ctx.moveTo(x, PAD + HEADER_H);
    ctx.lineTo(x, gridY + ROW_H * hours);
    ctx.stroke();
  }
  ctx.strokeRect(
    Math.floor(gridX) + 0.5, Math.floor(PAD + HEADER_H) + 0.5,
    COL_W * 7, DAY_H + ROW_H * hours,
  );

  // ── The classes ──────────────────────────────────────────────────────────
  const lanes = packLanes(slots);
  ctx.textAlign = 'left';

  for (const s of slots) {
    const from = minutesOfDay(s.startTime);
    const { lane, of } = lanes.get(s.id) ?? { lane: 0, of: 1 };

    const laneW = (COL_W - 6) / of;
    const x = gridX + COL_W * s.dayOfWeek + 3 + laneW * lane;
    const y = gridY + ((from - firstHour * 60) / 60) * ROW_H + 1;
    const h = Math.max(18, (s.durationMinutes / 60) * ROW_H - 2);
    const w = laneW - 2;

    ctx.fillStyle = BLOCK_BG;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = BLOCK_EDGE;
    ctx.fillRect(x, y, 3, h);          // a spine, so blocks read as blocks in mono print

    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();                        // nothing escapes its own block

    const tx = x + 7;
    const tw = w - 10;

    ctx.fillStyle = INK;
    ctx.font = '600 11px system-ui, -apple-system, Segoe UI, sans-serif';
    ctx.fillText(fitText(ctx, s.name, tw), tx, y + 13);

    ctx.fillStyle = MUTED;
    ctx.font = '10px system-ui, -apple-system, Segoe UI, sans-serif';
    ctx.fillText(
      fitText(ctx, `${clock12(from)}–${clock12(from + s.durationMinutes)}`, tw),
      tx, y + 25,
    );

    // Only when the block is tall enough to hold them. Detail crammed into a
    // 20px block is unreadable and makes the whole sheet look noisy.
    if (h >= 44) {
      const detail = [s.trainerName, s.location].filter(Boolean).join(' · ');
      if (detail) ctx.fillText(fitText(ctx, detail, tw), tx, y + 37);
    }
    if (h >= 58 && s.capacity != null) {
      ctx.fillText(fitText(ctx, `${s.capacity} places`, tw), tx, y + 49);
    }

    ctx.restore();
  }

  // ── Footer ───────────────────────────────────────────────────────────────
  ctx.fillStyle = MUTED;
  ctx.font = '11px system-ui, -apple-system, Segoe UI, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(
    `Generated ${new Date().toLocaleDateString('en-PH', {
      day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Manila',
    })}`,
    PAD, H - PAD + 4,
  );

  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'));
}

/** The same timetable as rows, for a spreadsheet. */
export function scheduleToCsv(slots: ScheduleSlot[]): string {
  const cell = (v: string | number | null): string => {
    const s = v == null ? '' : String(v);
    // A class named 'Strength, Level 2' would otherwise become two columns.
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const rows = [...slots].sort(
    (a, b) => a.dayOfWeek - b.dayOfWeek || minutesOfDay(a.startTime) - minutesOfDay(b.startTime),
  );

  const lines = [
    ['Day', 'Start', 'End', 'Class', 'Trainer', 'Location', 'Capacity'].join(','),
    ...rows.map((s) => {
      const from = minutesOfDay(s.startTime);
      return [
        cell(DAYS[s.dayOfWeek]),
        cell(clock12(from)),
        cell(clock12(from + s.durationMinutes)),
        cell(s.name),
        cell(s.trainerName),
        cell(s.location),
        cell(s.capacity),
      ].join(',');
    }),
  ];
  return lines.join('\r\n');
}

/**
 * Hands the file to the browser.
 *
 * The object URL is revoked on the next tick rather than immediately: revoking
 * in the same frame as the click cancels the download in Safari and, sometimes,
 * in Chrome.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
