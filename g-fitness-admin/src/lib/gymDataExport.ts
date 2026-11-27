import { supabase } from './supabaseClient';
import { todayKey } from '../utils/dates';

/**
 * The owner takes their gym's records home (Settings → Export your data, 2026-11-23). Read from the app, a thousand
 * rows at a time, filtered to this gym; the database's row rules decide what the owner may read, so nothing here
 * widens anything. The same business records the platform's export carries (0140), and the same things left out:
 * chats, progress photos, health answers, body measurements, workouts, the assistant, invitations, credentials.
 * A table that cannot be read (not live yet, or refused) is listed with the reason, never silently missing.
 */

export type ExportFormat = 'xlsx' | 'csv' | 'pdf' | 'json';
export interface DataSet { key: string; label: string; blurb: string; tables: [table: string, sheet: string][] }

export const DATA_SETS: DataSet[] = [
  { key: 'people', label: 'Members and staff', blurb: 'Everyone at your gym: name, contact, role and status', tables: [['gym_people', 'People']] },
  { key: 'memberships', label: 'Memberships', blurb: 'Who is on which plan, from when to when, and every freeze, cancel and switch', tables: [['memberships', 'Memberships'], ['membership_events', 'Membership changes']] },
  { key: 'plans', label: 'Plans', blurb: 'What you sell, at what price and length', tables: [['membership_plans', 'Plans']] },
  { key: 'payments', label: 'Payments', blurb: 'Every payment, its method, amount and receipt number', tables: [['payments', 'Payments']] },
  { key: 'checkins', label: 'Check-ins', blurb: 'Every visit, with its time and how they came in', tables: [['attendance', 'Check-ins']] },
  { key: 'classes', label: 'Classes and bookings', blurb: 'Your classes, the weekly timetable and who booked a seat', tables: [['classes', 'Classes'], ['class_templates', 'Weekly timetable'], ['bookings', 'Class bookings']] },
  { key: 'coaching', label: '1-on-1 sessions', blurb: 'Personal training sessions, with the coach and the member', tables: [['pt_sessions', '1-on-1 sessions']] },
  { key: 'events', label: 'Events', blurb: 'Your events and who registered', tables: [['events', 'Events'], ['event_registrations', 'Event registrations']] },
  { key: 'shop', label: 'Shop', blurb: 'Products, and every sale with its items', tables: [['shop_products', 'Products'], ['shop_sales', 'Sales'], ['shop_sale_items', 'Sale items']] },
  { key: 'points', label: 'Points and rewards', blurb: 'Every point earned and spent, your rewards and their redemptions', tables: [['point_ledger', 'Points'], ['rewards', 'Rewards'], ['reward_redemptions', 'Redemptions']] },
  { key: 'challenges', label: 'Challenges', blurb: 'The challenges you ran', tables: [['challenges', 'Challenges']] },
  { key: 'settings', label: 'Gym settings', blurb: 'Your gym’s information and rules as they are set today', tables: [['gym_settings', 'Gym settings']] },
];

export interface Sheet { name: string; rows: Record<string, unknown>[] }
export interface ExportResult { sheets: Sheet[]; unavailable: { sheet: string; reason: string }[] }

const PAGE = 1000;

/** Read the chosen sets. `onProgress` says what is being read, for the screen. */
export async function readGymData(gymId: string, keys: string[], onProgress?: (text: string) => void): Promise<ExportResult> {
  // Names for the account ids in other tables, so a spreadsheet reads "Ana Cruz", not a long code.
  const people = new Map<string, string>();
  const ppl = await supabase.from('gym_people').select('id, first_name, last_name');
  for (const p of (ppl.data ?? []) as { id: string; first_name: string | null; last_name: string | null }[]) {
    people.set(p.id, `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim());
  }

  const out: ExportResult = { sheets: [], unavailable: [] };
  for (const set of DATA_SETS.filter((d) => keys.includes(d.key))) {
    for (const [table, sheet] of set.tables) {
      onProgress?.(`Reading ${sheet.toLowerCase()}…`);
      const rows: Record<string, unknown>[] = [];
      let failed: string | null = null;
      for (let from = 0; ; from += PAGE) {
        // gym_people is already this gym's (a view over the current gym); every other table carries gym_id.
        let q = supabase.from(table).select('*').range(from, from + PAGE - 1);
        if (table !== 'gym_people') q = q.eq('gym_id', gymId);
        const { data, error } = await q;
        if (error) { failed = error.message; break; }
        rows.push(...((data ?? []) as Record<string, unknown>[]));
        onProgress?.(`Reading ${sheet.toLowerCase()}… ${rows.length.toLocaleString('en-PH')}`);
        if (!data || data.length < PAGE) break;
      }
      if (failed) { out.unavailable.push({ sheet, reason: failed }); continue; }
      out.sheets.push({ name: sheet, rows: rows.map((r) => withNames(r, people)) });
    }
  }
  return out;
}

/** Drop the gym's own id; after each column holding a person's id, put their name. */
function withNames(row: Record<string, unknown>, people: Map<string, string>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (k === 'gym_id') continue;
    out[k] = v;
    if (typeof v === 'string' && k.endsWith('_id') && people.has(v)) out[`${k.slice(0, -3)}_name`] = people.get(v);
  }
  return out;
}

// ---- writing the file ----------------------------------------------------------------------------------------
const columnsOf = (rows: Record<string, unknown>[]) => [...new Set(rows.flatMap((r) => Object.keys(r)))];
const text = (v: unknown): string => (v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v));

/** CSV a spreadsheet opens safely: a BOM so ₱ and ñ read right, and no cell that starts like a formula. */
export function toCsv(rows: Record<string, unknown>[]): string {
  const cols = columnsOf(rows);
  const cell = (v: unknown) => {
    let s = text(v);
    if (/^[=+\-@\t\r]/.test(s) && typeof v !== 'number') s = "'" + s;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '﻿' + [cols.map(cell).join(','), ...rows.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\r\n') + '\r\n';
}

const xml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
  // Control characters are not allowed in the sheet's XML at all.
  // eslint-disable-next-line no-control-regex
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
const colName = (i: number) => { let s = ''; for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s; };

/** An Excel workbook, one sheet per table: plain OOXML, zipped. Numbers stay numbers; everything else is text. */
export async function toXlsx(sheets: Sheet[]): Promise<Uint8Array> {
  const { zipSync, strToU8 } = await import('fflate');
  const names = sheets.map((s, i) => (s.name.replace(/[[\]:*?/\\]/g, ' ').slice(0, 31) || `Sheet ${i + 1}`));
  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
      + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>'
      + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
      + sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')
      + '</Types>'),
    '_rels/.rels': strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'),
    'xl/workbook.xml': strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>'
      + names.map((n, i) => `<sheet name="${xml(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') + '</sheets></workbook>'),
    'xl/_rels/workbook.xml.rels': strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')
      + '</Relationships>'),
  };
  sheets.forEach((s, i) => {
    const cols = columnsOf(s.rows);
    const cell = (v: unknown, ref: string) => (typeof v === 'number' && Number.isFinite(v)
      ? `<c r="${ref}"><v>${v}</v></c>`
      : `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xml(text(v))}</t></is></c>`);
    const rowsXml = [cols, ...s.rows.map((r) => cols.map((c) => r[c]))]
      .map((vals, ri) => `<row r="${ri + 1}">${vals.map((v, ci) => cell(v, `${colName(ci)}${ri + 1}`)).join('')}</row>`).join('');
    files[`xl/worksheets/sheet${i + 1}.xml`] = strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>'
      + rowsXml + '</sheetData></worksheet>');
  });
  return zipSync(files);
}

/** A printable report the browser saves as PDF: a heading, then a table per set. */
function toPrintHtml(gymName: string, sheets: Sheet[]): string {
  const table = (s: Sheet) => {
    const cols = columnsOf(s.rows);
    return `<h2>${xml(s.name)} <small>${s.rows.length.toLocaleString('en-PH')} row${s.rows.length === 1 ? '' : 's'}</small></h2>`
      + (s.rows.length === 0 ? '<p class="none">Nothing here.</p>'
        : `<table><thead><tr>${cols.map((c) => `<th>${xml(c.replace(/_/g, ' '))}</th>`).join('')}</tr></thead><tbody>`
          + s.rows.map((r) => `<tr>${cols.map((c) => `<td>${xml(text(r[c]))}</td>`).join('')}</tr>`).join('') + '</tbody></table>');
  };
  return `<!doctype html><html><head><meta charset="utf-8"><title>${xml(gymName)} data, ${todayKey()}</title><style>
    body{font:11px/1.4 Inter,system-ui,sans-serif;color:#111;margin:24px}h1{font-size:20px;margin:0 0 4px}p.meta{color:#555;margin:0 0 18px}
    h2{font-size:14px;margin:22px 0 8px;page-break-after:avoid}h2 small{font-weight:400;color:#666}table{border-collapse:collapse;width:100%;margin-bottom:6px}
    th,td{border:1px solid #ccc;padding:3px 5px;text-align:left;vertical-align:top;word-break:break-word}th{background:#f1f1f1;text-transform:capitalize}
    tr{page-break-inside:avoid}.none{color:#666}@page{size:A4 landscape;margin:12mm}</style></head><body>
    <h1>${xml(gymName)}</h1><p class="meta">Exported from Core Fitness on ${todayKey()}. Choose “Save as PDF” in the print window.</p>
    ${sheets.map(table).join('')}</body></html>`;
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'gym';

export function download(name: string, data: BlobPart, type: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([data], { type }));
  a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1500);
}

/**
 * Write and hand over the file. `printWindow` is opened by the click itself (a window opened after the reading has
 * finished is blocked as a pop-up), so the PDF report can be written into it. Returns the file name.
 */
export async function saveExport(gymName: string, format: ExportFormat, res: ExportResult, printWindow?: Window | null): Promise<string> {
  const base = `${slug(gymName)}-data-${todayKey()}`;
  if (format === 'json') {
    download(`${base}.json`, JSON.stringify({ gym: gymName, exported_on: todayKey(), tables: Object.fromEntries(res.sheets.map((s) => [s.name, s.rows])), unavailable: res.unavailable }, null, 2), 'application/json');
    return `${base}.json`;
  }
  if (format === 'xlsx') {
    download(`${base}.xlsx`, (await toXlsx(res.sheets)) as BlobPart, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    return `${base}.xlsx`;
  }
  if (format === 'csv') {
    if (res.sheets.length === 1) { download(`${base}-${slug(res.sheets[0].name)}.csv`, toCsv(res.sheets[0].rows), 'text/csv;charset=utf-8'); return `${base}-${slug(res.sheets[0].name)}.csv`; }
    const { zipSync, strToU8 } = await import('fflate');
    download(`${base}-csv.zip`, zipSync(Object.fromEntries(res.sheets.map((s) => [`${slug(s.name)}.csv`, strToU8(toCsv(s.rows))]))) as BlobPart, 'application/zip');
    return `${base}-csv.zip`;
  }
  const w = printWindow ?? window.open('', '_blank');
  if (!w) throw new Error('Your browser blocked the print window. Allow pop-ups for this page, then export again.');
  w.document.open(); w.document.write(toPrintHtml(gymName, res.sheets)); w.document.close();
  w.focus(); setTimeout(() => w.print(), 400);
  return 'the print window';
}
