/**
 * CSV for the platform owner's spreadsheets. Two rules beyond quoting:
 * a cell that starts with = + - @ (or a tab/CR) is prefixed with ' so Excel
 * and Sheets read it as text, never a formula (a gym's name is typed by the
 * gym); and a BOM leads the file so Excel reads ₱ and ñ as UTF-8.
 */
import { openExport } from './exportRequest';

export type Column<T> = [header: string, value: (row: T) => string | number | boolean | null | undefined];
type Cell = string | number | boolean | null | undefined;

const cell = (v: Cell): string => {
  if (v === null || v === undefined) return '';
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s) && !(typeof v === 'number')) s = "'" + s;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** The file's text: a header line, then one line per row. */
export function csvOf(header: string[], rows: Cell[][]): string {
  return '﻿' + [header, ...rows].map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}

/** Today in Manila, for the file name: never toISOString()'s UTC date. */
export const manilaToday = () => new Date(Date.now() + 8 * 3_600_000).toISOString().slice(0, 10);

export function saveFile(fileName: string, data: BlobPart, type: string): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([data], { type }));
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/**
 * Every Export button calls this. Since 2026-11-27 it opens the export window (components/ExportWindow.tsx):
 * the owner ticks columns and rows, sees the file, then picks CSV or Excel. The columns still decide each cell.
 */
export function downloadCsv<T>(name: string, rows: T[], columns: Column<T>[], title?: string): void {
  openExport({ name, title, rows: rows.map((r) => Object.fromEntries(columns.map(([h, f]) => [h, f(r)]))) });
}
