/** What an Export button hands the export window (components/ui/ExportWindow.tsx, mounted once in the layout). */
export interface ExportRequest {
  /** The rows exactly as they would be written, one object per row, keys in column order. */
  rows: Record<string, unknown>[];
  /** The file's name without its extension. */
  filename: string;
  /** Add today's date to the name (false when the caller already put the right date in it). */
  stampDate?: boolean;
  /** The window's title; by default made from the file name. */
  title?: string;
  /** More tables shown as tabs beside this one (a kind of record with several tables); each downloads on its own. */
  more?: ExportRequest[];
}

export const EXPORT_EVENT = 'cf-open-export';
export function openExport(req: ExportRequest) {
  window.dispatchEvent(new CustomEvent<ExportRequest>(EXPORT_EVENT, { detail: req }));
}
