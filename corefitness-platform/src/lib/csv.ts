/**
 * CSV for the platform owner's spreadsheets. Two rules beyond quoting:
 * a cell that starts with = + - @ (or a tab/CR) is prefixed with ' so Excel
 * and Sheets read it as text, never a formula — a gym's name is typed by the
 * gym; and a BOM leads the file so Excel reads ₱ and ñ as UTF-8.
 */
export type Column<T> = [header: string, value: (row: T) => string | number | boolean | null | undefined];

const cell = (v: string | number | boolean | null | undefined): string => {
  if (v === null || v === undefined) return '';
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s) && !(typeof v === 'number')) s = "'" + s;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function toCsv<T>(rows: T[], columns: Column<T>[]): string {
  const lines = [columns.map(([h]) => cell(h)).join(',')];
  for (const r of rows) lines.push(columns.map(([, f]) => cell(f(r))).join(','));
  return '﻿' + lines.join('\r\n') + '\r\n';
}

/** Today in Manila, for the file name — never toISOString()'s UTC date. */
const manilaToday = () => new Date(Date.now() + 8 * 3_600_000).toISOString().slice(0, 10);

export function downloadCsv<T>(name: string, rows: T[], columns: Column<T>[]): void {
  const blob = new Blob([toCsv(rows, columns)], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${name}-${manilaToday()}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
