/**
 * The export window (owner, 2026-11-27), the platform's copy of the admin app's: every Export opens it, so the
 * platform owner ticks columns and rows, sees the file, and picks CSV or Excel. `downloadCsv()` (lib/csv.ts) opens it.
 */
export interface ExportRequest {
  /** One object per row, keys in column order: the header is the key. */
  rows: Record<string, string | number | boolean | null | undefined>[];
  /** The file's name without date or extension. */
  name: string;
  title?: string;
}

export const EXPORT_EVENT = 'cf-open-export';
export function openExport(req: ExportRequest) {
  window.dispatchEvent(new CustomEvent<ExportRequest>(EXPORT_EVENT, { detail: req }));
}

type Cell = string | number | boolean | null | undefined;
const xml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
  // eslint-disable-next-line no-control-regex
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
const colName = (i: number) => { let s = ''; for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s; };

/** One sheet of plain OOXML, zipped (the admin app's writer, one sheet). Numbers stay numbers; the rest is text. */
export async function toXlsx(sheetName: string, header: string[], rows: Cell[][]): Promise<Uint8Array> {
  const { zipSync, strToU8 } = await import('fflate');
  const name = sheetName.replace(/[[\]:*?/\\]/g, ' ').slice(0, 31) || 'Sheet 1';
  const cell = (v: Cell, ref: string) => (typeof v === 'number' && Number.isFinite(v)
    ? `<c r="${ref}"><v>${v}</v></c>`
    : `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xml(v === null || v === undefined ? '' : String(v))}</t></is></c>`);
  const rowsXml = [header, ...rows].map((vals, ri) => `<row r="${ri + 1}">${vals.map((v, ci) => cell(v, `${colName(ci)}${ri + 1}`)).join('')}</row>`).join('');
  return zipSync({
    '[Content_Types].xml': strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
      + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>'
      + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
      + '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>'),
    '_rels/.rels': strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'),
    'xl/workbook.xml': strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>'
      + `<sheet name="${xml(name)}" sheetId="1" r:id="rId1"/></sheets></workbook>`),
    'xl/_rels/workbook.xml.rels': strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>'),
    'xl/worksheets/sheet1.xml': strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>'
      + rowsXml + '</sheetData></worksheet>'),
  });
}
