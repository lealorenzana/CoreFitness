import type { MemberDetail } from '../services/memberDetailService';
import type { MemberDataExport } from './memberDataExport';
import { download } from './gymDataExport';
import { formatCheckInCode } from '../utils/checkInCode';
import { formatDate, formatPhoneNumber } from '../utils/formatters';
import { realEmail } from './api/logins';
import { bmi } from './api/progress';
import { todayKey } from '../utils/dates';

/**
 * The member drawer's documents (owner, 2026-11-27): a **profile report** and the **full data** (every table the
 * data-request JSON holds), each as a PDF (a print window the browser saves) or a Word file. One document model,
 * two writers, so the PDF and the DOCX never say different things. The gym's own name, address and logo head every
 * page; a gym with no logo gets its name alone, never the Core Fitness mark.
 */

export interface Gym { name: string; address: string | null; logoUrl: string | null }
type Block =
  | { kind: 'h'; text: string }
  | { kind: 'fields'; rows: [string, string][] }
  | { kind: 'table'; cols: string[]; rows: string[][]; small?: boolean }
  | { kind: 'p'; text: string };
interface Doc { title: string; subject: string; landscape: boolean; blocks: Block[] }

const peso = (n: number) => `₱${Number(n).toLocaleString('en-PH', { maximumFractionDigits: 2 })}`;
const nice = (s: string) => s.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
const or = (v: string | null | undefined, none = 'Not on file') => (v && String(v).trim()) || none;
const stamp = (iso: string) => new Date(iso).toLocaleString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });

/** The profile report: what the desk is asked for, on one or two pages. */
export function profileReport(d: MemberDetail): Doc {
  const { profile, member } = d.identity;
  const name = `${profile.first_name} ${profile.last_name}`.trim();
  const cur = d.memberships[0] ?? null;
  const latest = d.measurements.length ? d.measurements[d.measurements.length - 1] : null;
  const b = latest ? bmi(latest.weight_kg, latest.height_cm) : null;
  const blocks: Block[] = [
    { kind: 'h', text: 'Details' },
    { kind: 'fields', rows: [
      ['Name', name], ['Check-in code', formatCheckInCode(profile.id)],
      ['Email', realEmail(profile.email) ?? 'No email'], ['Phone', profile.phone ? formatPhoneNumber(profile.phone) : 'Not on file'],
      ['Address', or(member.address)],
      ['Date of birth', member.date_of_birth ? `${formatDate(member.date_of_birth)}${d.stats.age != null ? `, ${d.stats.age} years` : ''}` : 'Not on file'],
      ['Gender', member.gender ? nice(member.gender) : 'Not on file'],
      ['Member since', member.created_at ? formatDate(member.created_at) : 'Not on file'],
      ['Account', nice(profile.status)],
      ['Agreed to terms', member.terms_accepted_at ? formatDate(member.terms_accepted_at) : 'Not on file'],
    ] },
    { kind: 'h', text: 'Emergency contact' },
    member.emergency_contact_name || member.emergency_contact_phone
      ? { kind: 'fields', rows: [['Name', or(member.emergency_contact_name)], ['Phone', member.emergency_contact_phone ? formatPhoneNumber(member.emergency_contact_phone) : 'Not on file'], ['Relationship', or(member.emergency_contact_relationship)]] }
      : { kind: 'p', text: 'No emergency contact on file.' },
    { kind: 'h', text: 'Membership' },
    cur ? { kind: 'fields', rows: [
      ['Plan', or(cur.membership_plans?.name, 'Unknown plan')], ['Status', nice(cur.status)],
      ['Started', cur.start_date ? formatDate(cur.start_date) : 'Not started'],
      ['Ends', cur.never_expires ? 'Never expires' : cur.expiry_date ? formatDate(cur.expiry_date) : 'Not set'],
    ] } : { kind: 'p', text: 'No membership.' },
    ...(d.memberships.length > 1 ? [{ kind: 'table' as const, cols: ['Plan', 'Status', 'Started', 'Ended'],
      rows: d.memberships.slice(1).map((m) => [or(m.membership_plans?.name, 'Unknown plan'), nice(m.status), m.start_date ? formatDate(m.start_date) : '', m.expiry_date ? formatDate(m.expiry_date) : '']) }] : []),
    { kind: 'h', text: `Payments (${peso(d.stats.totalPaid)} paid)` },
    d.payments.length ? { kind: 'table', cols: ['Paid on', 'Amount', 'Method', 'Status', 'Receipt'],
      rows: d.payments.map((p) => [formatDate(p.paid_on), peso(p.amount), nice(p.method), nice(p.status), p.invoice_number ?? '']) }
      : { kind: 'p', text: 'No payments recorded.' },
    { kind: 'h', text: 'Attendance' },
    { kind: 'fields', rows: [
      ['Check-ins', String(d.stats.visits)], ['Visit days', String(d.stats.visitDays)],
      ['Days in the last 30', String(d.stats.visitDaysLast30)], ['Last visit', d.stats.lastVisitOn ? formatDate(d.stats.lastVisitOn) : 'Never'],
    ] },
    ...(d.attendance.length ? [{ kind: 'table' as const, cols: ['Checked in', 'How', 'Activity'],
      rows: d.attendance.slice(0, 20).map((a) => [stamp(a.check_in_time), a.method === 'qr' ? 'Scanned' : 'Typed', a.activity ?? 'Not recorded']) },
    ...(d.attendance.length > 20 ? [{ kind: 'p' as const, text: `The 20 latest of ${d.attendance.length} check-ins. The full data export holds every one.` }] : [])] : []),
    { kind: 'h', text: 'Training' },
    { kind: 'fields', rows: [
      ['Says they are', or(member.experience_level ? nice(member.experience_level) : null, 'Not set')],
      ['Earned here', d.progression ? `${nice(d.progression.level)}, ${d.progression.training_days} training days` : 'Not available'],
      ['Workouts logged', String(d.workouts.length)],
      ['Latest measurement', latest ? `${formatDate(latest.measured_on)}: ${latest.weight_kg != null ? `${latest.weight_kg} kg` : 'no weight'}${latest.height_cm != null ? `, ${latest.height_cm} cm` : ''}${b != null ? `, BMI ${b.toFixed(1)}` : ''}` : 'None'],
    ] },
  ];
  return { title: 'Member profile', subject: name, landscape: false, blocks };
}

/** Every table the data-request file holds, as a document (RA 10173's copy, readable). */
export function fullDataReport(exp: MemberDataExport, name: string): Doc {
  const cell = (v: unknown) => v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
  const blocks: Block[] = [{ kind: 'p', text: exp.note }];
  for (const [table, rows] of Object.entries(exp.data)) {
    const list = rows as Record<string, unknown>[];
    blocks.push({ kind: 'h', text: `${nice(table)} (${list.length})` });
    if (!list.length) { blocks.push({ kind: 'p', text: 'Nothing held.' }); continue; }
    const cols = [...new Set(list.flatMap((r) => Object.keys(r)))];
    blocks.push({ kind: 'table', small: true, cols: cols.map(nice), rows: list.map((r) => cols.map((c) => cell(r[c]))) });
  }
  const missing = Object.entries(exp.unavailable);
  if (missing.length) blocks.push({ kind: 'h', text: 'Could not be read' }, { kind: 'table', cols: ['Table', 'Why'], rows: missing.map(([t, e]) => [nice(t), e]) });
  return { title: 'Member data', subject: name, landscape: true, blocks };
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
  // eslint-disable-next-line no-control-regex
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
const fileBase = (doc: Doc) => `${doc.subject}-${doc.title}-${todayKey()}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** PDF: the browser's print window (opened by the click itself, or pop-up blockers refuse it), saved as PDF. */
export function printReport(doc: Doc, gym: Gym, w: Window | null) {
  if (!w) throw new Error('Your browser blocked the print window. Allow pop-ups for this page, then export again.');
  const block = (b: Block) => b.kind === 'h' ? `<h2>${esc(b.text)}</h2>`
    : b.kind === 'p' ? `<p class="note">${esc(b.text)}</p>`
    : b.kind === 'fields' ? `<dl>${b.rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>`
    : `<table class="${b.small ? 'small' : ''}"><thead><tr>${b.cols.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${b.rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  w.document.open();
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(fileBase(doc))}</title><style>
    *{box-sizing:border-box}body{font:11px/1.45 Inter,system-ui,sans-serif;color:#111;margin:0}
    @page{size:A4 ${doc.landscape ? 'landscape' : 'portrait'};margin:14mm}
    @media screen{body{max-width:${doc.landscape ? '1100px' : '820px'};margin:28px auto;padding:0 20px}}
    header{display:flex;align-items:center;gap:14px;padding-bottom:12px;border-bottom:2px solid #111;margin-bottom:16px}
    header img{height:44px;max-width:140px;object-fit:contain}header .g b{display:block;font-size:15px}header .g span{color:#555}
    header .t{margin-left:auto;text-align:right}header .t b{display:block;font-size:18px}header .t span{color:#555}
    h2{font-size:12.5px;margin:18px 0 6px;padding-bottom:4px;border-bottom:1px solid #ddd;page-break-after:avoid}
    dl{display:grid;grid-template-columns:1fr 1fr;gap:4px 24px;margin:0}dl div{display:flex;gap:8px;padding:3px 0;border-bottom:1px dotted #e3e3e3}
    dt{width:130px;flex:none;color:#666}dd{margin:0;font-weight:600;word-break:break-word}
    table{border-collapse:collapse;width:100%;margin-top:4px}th,td{border-bottom:1px solid #e3e3e3;padding:4px 6px;text-align:left;vertical-align:top;word-break:break-word}
    th{color:#555;font-weight:600;border-bottom:1px solid #999}tr{page-break-inside:avoid}table.small{font-size:8.5px}.note{color:#555;margin:4px 0}
    footer{margin-top:22px;padding-top:8px;border-top:1px solid #ddd;color:#777;font-size:9.5px}</style></head><body>
    <header>${gym.logoUrl ? `<img src="${esc(gym.logoUrl)}" alt="">` : ''}<div class="g"><b>${esc(gym.name)}</b>${gym.address ? `<span>${esc(gym.address)}</span>` : ''}</div>
      <div class="t"><b>${esc(doc.title)}</b><span>${esc(doc.subject)} · ${esc(formatDate(todayKey()))}</span></div></header>
    ${doc.blocks.map(block).join('')}
    <footer>Prepared by ${esc(gym.name)} on ${esc(stamp(new Date().toISOString()))}. Confidential: personal data under the Data Privacy Act (RA 10173).</footer>
    <script>window.onload=function(){setTimeout(function(){window.print()},300)}</script></body></html>`);
  w.document.close();
  w.focus();
}

/** The logo as PNG bytes for Word (it reads PNG and JPEG, not WebP or SVG). Null when it cannot be read. */
async function logoPng(url: string): Promise<{ bytes: Uint8Array; w: number; h: number } | null> {
  try {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    await new Promise<void>((ok, bad) => { img.onload = () => ok(); img.onerror = () => bad(new Error('logo')); img.src = url; });
    const scale = Math.min(1, 400 / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(img.naturalWidth * scale)); c.height = Math.max(1, Math.round(img.naturalHeight * scale));
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    const blob = await new Promise<Blob | null>((ok) => c.toBlob(ok, 'image/png'));
    return blob ? { bytes: new Uint8Array(await blob.arrayBuffer()), w: c.width, h: c.height } : null;
  } catch { return null; }
}

/** Word: plain WordprocessingML, zipped (the same way toXlsx writes Excel), the gym's logo in the page header. */
export async function wordReport(doc: Doc, gym: Gym): Promise<string> {
  const { zipSync, strToU8 } = await import('fflate');
  const logo = gym.logoUrl ? await logoPng(gym.logoUrl) : null;
  const run = (t: string, o: { b?: boolean; sz?: number; color?: string } = {}) =>
    `<w:r><w:rPr>${o.b ? '<w:b/>' : ''}${o.color ? `<w:color w:val="${o.color}"/>` : ''}${o.sz ? `<w:sz w:val="${o.sz}"/>` : ''}</w:rPr><w:t xml:space="preserve">${esc(t)}</w:t></w:r>`;
  const para = (inner: string, o: { after?: number; before?: number; border?: boolean; keep?: boolean } = {}) =>
    `<w:p><w:pPr>${o.keep ? '<w:keepNext/>' : ''}${o.border ? '<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="2" w:color="DDDDDD"/></w:pBdr>' : ''}<w:spacing w:before="${o.before ?? 0}" w:after="${o.after ?? 60}"/></w:pPr>${inner}</w:p>`;
  const width = doc.landscape ? 15000 : 9900; // usable width in twentieths of a point (A4 less margins)
  const grid = (cols: number) => `<w:tblPr><w:tblW w:w="${width}" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblBorders><w:insideH w:val="single" w:sz="4" w:color="E3E3E3"/><w:bottom w:val="single" w:sz="4" w:color="E3E3E3"/></w:tblBorders><w:tblCellMar><w:top w:w="40" w:type="dxa"/><w:bottom w:w="40" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${Array.from({ length: cols }, () => `<w:gridCol w:w="${Math.floor(width / cols)}"/>`).join('')}</w:tblGrid>`;
  const tc = (inner: string, cols: number) => `<w:tc><w:tcPr><w:tcW w:w="${Math.floor(width / cols)}" w:type="dxa"/></w:tcPr>${inner}</w:tc>`;
  const body = doc.blocks.map((b) => {
    if (b.kind === 'h') return para(run(b.text, { b: true, sz: 24 }), { before: 240, after: 80, border: true, keep: true });
    if (b.kind === 'p') return para(run(b.text, { color: '555555', sz: 19 }));
    if (b.kind === 'fields') {
      return `<w:tbl>${grid(2)}${b.rows.map(([k, v]) => `<w:tr>${tc(para(run(k, { color: '666666', sz: 19 }), { after: 0 }), 2)}${tc(para(run(v, { b: true, sz: 19 }), { after: 0 }), 2)}</w:tr>`).join('')}</w:tbl>`;
    }
    const sz = b.small ? 14 : 18;
    return `<w:tbl>${grid(b.cols.length)}<w:tr><w:trPr><w:tblHeader/></w:trPr>${b.cols.map((c) => tc(para(run(c, { b: true, sz, color: '555555' }), { after: 0 }), b.cols.length)).join('')}</w:tr>`
      + b.rows.map((r) => `<w:tr><w:trPr><w:cantSplit/></w:trPr>${r.map((c) => tc(para(run(c, { sz }), { after: 0 }), b.cols.length)).join('')}</w:tr>`).join('') + '</w:tbl>' + para('', { after: 0 });
  }).join('');
  // The header: logo, the gym's name and address, the document's title and subject. A picture is EMU (914400 an inch).
  const emuH = 457200, emuW = logo ? Math.round(emuH * (logo.w / logo.h)) : 0;
  const pic = logo ? `<w:r><w:drawing><wp:inline><wp:extent cx="${emuW}" cy="${emuH}"/><wp:docPr id="1" name="Logo"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="1" name="logo.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rLogo"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${emuW}" cy="${emuH}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>` : '';
  const ns = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"';
  const header = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:hdr ${ns}><w:tbl>${grid(2)}<w:tr>`
    + tc(para(pic + (pic ? run('  ') : '') + run(gym.name, { b: true, sz: 26 }), { after: 0 }) + (gym.address ? para(run(gym.address, { color: '555555', sz: 18 }), { after: 0 }) : ''), 2)
    + tc(`<w:p><w:pPr><w:jc w:val="right"/><w:spacing w:after="0"/></w:pPr>${run(doc.title, { b: true, sz: 30 })}</w:p><w:p><w:pPr><w:jc w:val="right"/><w:pBdr><w:bottom w:val="single" w:sz="12" w:space="4" w:color="111111"/></w:pBdr></w:pPr>${run(`${doc.subject} · ${formatDate(todayKey())}`, { color: '555555', sz: 18 })}</w:p>`, 2)
    + '</w:tr></w:tbl><w:p/></w:hdr>';
  const footer = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr ${ns}>${para(run(`Prepared by ${gym.name} on ${stamp(new Date().toISOString())}. Confidential: personal data under the Data Privacy Act (RA 10173).`, { color: '777777', sz: 16 }))}</w:ftr>`;
  const page = doc.landscape ? '<w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/>' : '<w:pgSz w:w="11906" w:h="16838"/>';
  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${ns}><w:body>${body}<w:sectPr><w:headerReference w:type="default" r:id="rHdr"/><w:footerReference w:type="default" r:id="rFtr"/>${page}<w:pgMar w:top="1700" w:right="1000" w:bottom="1100" w:left="1000" w:header="500" w:footer="500" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/>'
      + '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>'
      + '<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/></Types>'),
    '_rels/.rels': strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'),
    'word/_rels/document.xml.rels': strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rHdr" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/><Relationship Id="rFtr" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/></Relationships>'),
    'word/styles.xml': strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/><w:sz w:val="20"/><w:color w:val="111111"/></w:rPr></w:rPrDefault></w:docDefaults></w:styles>'),
    'word/document.xml': strToU8(document),
    'word/header1.xml': strToU8(header),
    'word/footer1.xml': strToU8(footer),
  };
  if (logo) {
    files['word/media/logo.png'] = logo.bytes;
    files['word/_rels/header1.xml.rels'] = strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rLogo" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/logo.png"/></Relationships>');
  }
  const name = `${fileBase(doc)}.docx`;
  download(name, zipSync(files) as BlobPart, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  return name;
}
