/**
 * One receipt, three ways out: on screen (`ReceiptPaper`), printed (the same
 * paper, portalled so `body.receipt-open` hides the dashboard), and as a PNG
 * drawn here on a canvas — no library, and no screenshot of the DOM, so the
 * image is the receipt and nothing else. Payments and the shop both build a
 * `ReceiptDoc`; neither draws its own.
 *
 * Every line comes from the caller's data. A line with no value is left off —
 * a receipt never prints a placeholder where a fact should be.
 */
export interface ReceiptLine { label: string; value: string }
export interface ReceiptItem { name: string; qty: number; unit: number }
export interface ReceiptDoc {
  gymName: string;
  /** Address, phone, email — whatever Settings has. */
  gymLines: string[];
  logoUrl?: string | null;
  title: string;            // "Official receipt", "Sales receipt"
  number: string;           // invoice / sale number
  date: string;             // already formatted
  status?: { text: string; tone: 'done' | 'waiting' | 'void' } | null;
  /** Who paid / for what. */
  lines: ReceiptLine[];
  items?: ReceiptItem[];
  total: number;
  /** Cash handed over and change, when the desk entered them. */
  tendered?: number | null;
  footer: string[];
}

export const peso = (n: number) => '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const W = 720;            // px at 1x; drawn at 2x for a sharp image
const PAD = 48;

function wrap(ctx: CanvasRenderingContext2D, text: string, max: number): string[] {
  const words = text.split(/\s+/);
  const out: string[] = [];
  let line = '';
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (ctx.measureText(next).width > max && line) { out.push(line); line = w; } else line = next;
  }
  if (line) out.push(line);
  return out;
}

async function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
    window.setTimeout(() => resolve(null), 4000);
  });
}

/** Lays the receipt out twice: once to measure, once to draw. */
export async function receiptPng(doc: ReceiptDoc): Promise<Blob> {
  const logo = doc.logoUrl ? await loadImage(doc.logoUrl) : null;
  const font = (w: number, s: number) => `${w} ${s}px Inter, "Segoe UI", system-ui, sans-serif`;
  const scratch = document.createElement('canvas').getContext('2d')!;

  const paint = (ctx: CanvasRenderingContext2D, draw: boolean): number => {
    let y = PAD;
    const text = (t: string, x: number, size: number, weight: number, color: string, align: CanvasTextAlign = 'left') => {
      ctx.font = font(weight, size); ctx.fillStyle = color; ctx.textAlign = align;
      if (draw) ctx.fillText(t, x, y);
    };
    const rule = (dashed = false) => {
      if (draw) {
        ctx.strokeStyle = '#D1D5DB'; ctx.lineWidth = 1; ctx.setLineDash(dashed ? [6, 6] : []);
        ctx.beginPath(); ctx.moveTo(PAD, y); ctx.lineTo(W - PAD, y); ctx.stroke(); ctx.setLineDash([]);
      }
    };

    if (logo) {
      if (draw) ctx.drawImage(logo, W / 2 - 28, y, 56, 56);
      y += 72;
    }
    y += 22; text(doc.gymName, W / 2, 26, 800, '#111827', 'center');
    ctx.font = font(400, 14);
    for (const l of doc.gymLines) for (const part of wrap(ctx, l, W - PAD * 2)) { y += 22; text(part, W / 2, 14, 400, '#4B5563', 'center'); }
    y += 26; rule();
    y += 34; text(doc.title.toUpperCase(), PAD, 13, 700, '#6B7280');
    text(doc.date, W - PAD, 14, 500, '#374151', 'right');
    y += 28; text(doc.number, PAD, 20, 700, '#111827');
    if (doc.status) {
      const color = doc.status.tone === 'done' ? '#5B21B6' : doc.status.tone === 'void' ? '#6B7280' : '#92400E';
      text(doc.status.text.toUpperCase(), W - PAD, 13, 700, color, 'right');
    }
    y += 22; rule(true);
    for (const l of doc.lines) {
      y += 30; text(l.label, PAD, 15, 400, '#6B7280');
      ctx.font = font(600, 15);
      const lines = wrap(ctx, l.value, W - PAD * 2 - 200);
      lines.forEach((part, i) => { if (i) y += 22; text(part, W - PAD, 15, 600, '#111827', 'right'); });
    }
    if (doc.items?.length) {
      y += 22; rule(true);
      for (const it of doc.items) {
        y += 30; text(`${it.qty} × ${it.name}`, PAD, 15, 500, '#111827');
        text(peso(it.qty * it.unit), W - PAD, 15, 600, '#111827', 'right');
        if (it.qty > 1) { y += 20; text(`${peso(it.unit)} each`, PAD, 13, 400, '#6B7280'); }
      }
    }
    y += 24; rule();
    y += 42; text('Total', PAD, 18, 700, '#111827');
    text(peso(doc.total), W - PAD, 30, 800, '#111827', 'right');
    if (doc.tendered != null && doc.tendered >= doc.total) {
      y += 30; text('Cash received', PAD, 15, 400, '#6B7280'); text(peso(doc.tendered), W - PAD, 15, 600, '#111827', 'right');
      y += 26; text('Change', PAD, 15, 400, '#6B7280'); text(peso(doc.tendered - doc.total), W - PAD, 15, 600, '#111827', 'right');
    }
    y += 26; rule(true);
    ctx.font = font(400, 14);
    for (const f of doc.footer) for (const part of wrap(ctx, f, W - PAD * 2)) { y += 24; text(part, W / 2, 14, 400, '#4B5563', 'center'); }
    return y + PAD;
  };

  const height = paint(scratch, false);
  const canvas = document.createElement('canvas');
  canvas.width = W * 2; canvas.height = Math.ceil(height * 2);
  const ctx = canvas.getContext('2d')!;
  ctx.scale(2, 2);
  ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, W, height);
  ctx.textBaseline = 'alphabetic';
  try { paint(ctx, true); } catch { /* a tainted logo: draw again without it */ }
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not make the image.'))), 'image/png');
    } catch (e) {
      // A logo served without CORS taints the canvas; the receipt is the facts, so drop the logo.
      if (doc.logoUrl) void receiptPng({ ...doc, logoUrl: null }).then(resolve, reject);
      else reject(e);
    }
  });
}

export async function downloadReceiptPng(doc: ReceiptDoc, filename: string): Promise<void> {
  const blob = await receiptPng(doc);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.png') ? filename : `${filename}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}
