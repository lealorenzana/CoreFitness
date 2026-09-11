import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  FileText, Check, X, AlertTriangle, ShieldCheck, Clock, ChevronLeft, ChevronRight,
  ExternalLink, ImageOff, RotateCw, Award,
} from 'lucide-react';
import Avatar from '../components/ui/Avatar';
import Pagination from '../components/ui/Pagination';
import { PageHeader, StatTiles, Chips, EmptyState, PageSummary } from '../components/ui/kit';
import { useFillGrid } from '../hooks/useFillGrid';
import { assertWrote } from '../lib/api/mutate';
import { showToast } from '../utils/toast';
import { supabase } from '../lib/supabaseClient';

/**
 * Trainer certificates, for the person who hires them (migration 0054).
 *
 * ## Why the page exists at all
 *
 * `trainer_profiles.certifications` is free text a trainer types, and the
 * member-facing profile admits the gym does not verify it. That is honest and
 * weak. This is where the gym looks at the actual document and records that it
 * did — who checked, when, and what they decided.
 *
 * ## The document is on the card, not behind a click
 *
 * It was a list of names with "click to open", so reviewing ten certificates
 * was ten new tabs. Every card now shows its file — the photo itself, or the
 * PDF's first page — and clicking one opens a large viewer with the decision
 * beside it, arrow keys moving through the rest.
 *
 * ## Signed URLs, never public ones
 *
 * The bucket is private. Each file is shown through a URL that expires in five
 * minutes, so a link copied out of the page stops working. Only the cards on
 * the current page are signed, in one request, and a page revisited after four
 * minutes is signed again. A certificate carries a real name and licence
 * number; the avatars pattern (public-read) would have been the wrong one.
 *
 * ## A record whose file is missing says so
 *
 * Signing fails for an object that is not in storage. That card says "file not
 * in storage" rather than showing a blank box that looks like a slow image —
 * the demo seed's credentials are exactly this, rows with no file behind them.
 *
 * ## Admin only, and not by accident
 *
 * Staff cannot read these rows at all — RLS refuses, not just the router. They
 * take payments and check people in; reviewing an employee's qualifications is
 * not a front-desk task.
 */

interface Row {
  id: string;
  trainer_id: string;
  title: string;
  file_path: string;
  mime_type: string | null;
  size_bytes: number | null;
  status: 'pending' | 'verified' | 'rejected';
  uploaded_at: string;
  reviewed_at: string | null;
  review_note: string | null;
  trainer_profiles: { profiles: { first_name: string; last_name: string; photo_url: string | null } | null } | null;
}

type Filter = 'all' | Row['status'];

/** A signing result. `missing` is the object not being in storage; `failed` is
 *  the request itself not getting through — the two call for different fixes. */
interface Signed { url: string | null; at: number; reason?: 'missing' | 'failed' }

/**
 * A card's smallest comfortable height: a 120px preview over the ~140px of
 * title, dates and buttons. Rows are counted from this, then share the height
 * that is really there, so the previews grow into the room instead of a row
 * of cards sitting above an empty half-screen.
 */
const TILE_MIN_PX = 262;

const SIGN_SECONDS = 300;
const RESIGN_AFTER_MS = 240_000;

const TONE = {
  pending:  { bg: 'var(--color-surface-high)',    fg: 'var(--color-text-secondary)', label: 'Waiting', icon: Clock },
  verified: { bg: 'var(--color-primary-light)',   fg: 'var(--color-primary)',        label: 'Verified', icon: ShieldCheck },
  rejected: { bg: 'var(--color-secondary-light)', fg: 'var(--color-secondary)',      label: 'Rejected', icon: X },
} as const;

const BORDER = 'var(--color-border)';
const TEXT_MUTED = 'var(--color-text-muted)';
const TEXT_SECOND = 'var(--color-text-secondary)';

const dateFmt = new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });

function trainerName(row: Row): string {
  const p = row.trainer_profiles?.profiles;
  return p ? `${p.first_name} ${p.last_name}`.trim() : '';
}

function isPdf(row: Row): boolean {
  return row.mime_type === 'application/pdf' || /\.pdf$/i.test(row.file_path);
}

function fileKind(row: Row): string {
  if (isPdf(row)) return 'PDF';
  if (row.mime_type === 'image/png' || /\.png$/i.test(row.file_path)) return 'PNG';
  if (row.mime_type === 'image/jpeg' || /\.jpe?g$/i.test(row.file_path)) return 'JPG';
  return 'File';
}

function fileSize(bytes: number | null): string | null {
  if (bytes == null) return null;
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * The file itself, or an honest statement of why it is not showing.
 *
 * Module scope, like everything below: a component declared inside a render
 * body is a new component type on every render, and React remounts it — here
 * that would reload every PDF on every keystroke in the reason box.
 */
function Preview({ row, signed, broken, large, onRetry, onBroken }: {
  row: Row;
  signed: Signed | undefined;
  broken: boolean;
  large?: boolean;
  onRetry: () => void;
  onBroken: () => void;
}) {
  const note = (icon: React.ReactNode, title: string, hint: string, retry?: boolean) => (
    <div className="w-full h-full flex flex-col items-center justify-center gap-1.5 text-center px-4">
      {icon}
      <p className={`${large ? 'text-sm' : 'text-[11px]'} font-semibold`} style={{ color: TEXT_SECOND }}>{title}</p>
      <p className={large ? 'text-xs max-w-sm' : 'text-[10px]'} style={{ color: TEXT_MUTED }}>{hint}</p>
      {retry && (
        <span role="button" tabIndex={0}
          onClick={(e) => { e.stopPropagation(); onRetry(); }}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); onRetry(); } }}
          className="mt-1 inline-flex items-center gap-1 px-2.5 h-7 rounded-lg text-[10px] font-semibold cursor-pointer"
          style={{ background: 'var(--color-primary-light)', color: 'var(--color-primary)' }}>
          <RotateCw size={11} /> Try again
        </span>
      )}
    </div>
  );
  const iconSize = large ? 34 : 22;

  if (!signed) {
    return <div className="w-full h-full animate-pulse" style={{ background: 'var(--color-surface-high)' }} />;
  }
  if (!signed.url) {
    return signed.reason === 'failed'
      ? note(<AlertTriangle size={iconSize} style={{ color: 'var(--color-secondary)' }} />,
          "Couldn't load the preview", 'A connection problem, not a missing file.', true)
      : note(<ImageOff size={iconSize} style={{ color: TEXT_MUTED }} />,
          'File not in storage', 'The record exists but its file was never uploaded — ask the trainer to upload it again.');
  }
  if (broken) {
    return note(<ImageOff size={iconSize} style={{ color: 'var(--color-secondary)' }} />,
      "Couldn't display this file", 'The link may have expired.', true);
  }
  if (isPdf(row)) {
    // The browser's own PDF viewer. On the card it is a picture of page one —
    // no toolbar, and pointer-events off so a click opens the viewer instead
    // of scrolling the PDF. In the viewer it is the full reader.
    const hash = large ? '#view=FitH' : '#toolbar=0&navpanes=0&scrollbar=0&view=FitH';
    return (
      <iframe src={signed.url + hash} title={`${row.title} (PDF)`} tabIndex={large ? 0 : -1}
        className="w-full h-full block" style={{ border: 0, pointerEvents: large ? 'auto' : 'none', background: '#fff' }} />
    );
  }
  return (
    <img src={signed.url} alt={row.title} onError={onBroken} draggable={false}
      className="w-full h-full block object-contain" />
  );
}

function StatusChip({ status }: { status: Row['status'] }) {
  const t = TONE[status];
  const Icon = t.icon;
  return (
    <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-semibold"
      style={{ background: t.bg, color: t.fg }}>
      <Icon size={10} /> {t.label}
    </span>
  );
}

/** One certificate card: the document on top, who and what beneath it. */
function CredentialTile({ row, signed, broken, busy, onView, onVerify, onReject, onRetry, onBroken }: {
  row: Row;
  signed: Signed | undefined;
  broken: boolean;
  busy: boolean;
  onView: () => void;
  onVerify: () => void;
  onReject: () => void;
  onRetry: () => void;
  onBroken: () => void;
}) {
  const name = trainerName(row);
  const size = fileSize(row.size_bytes);
  return (
    <div className="rounded-xl overflow-hidden flex flex-col"
      style={{ background: 'var(--color-surface-high)', border: `1px solid ${row.status === 'pending' ? 'var(--color-secondary)' : BORDER}` }}>
      <div role="button" tabIndex={0} onClick={onView}
        onKeyDown={(e) => { if (e.key === 'Enter') onView(); }}
        title={`View ${row.title}`}
        className="relative flex-1 min-h-[120px] cursor-pointer group" style={{ background: 'var(--color-bg)' }}>
        <Preview row={row} signed={signed} broken={broken} onRetry={onRetry} onBroken={onBroken} />
        <span className="absolute top-2 left-2"><StatusChip status={row.status} /></span>
        <span className="absolute top-2 right-2 text-[9px] font-bold px-1.5 py-0.5 rounded"
          style={{ background: 'rgba(0,0,0,0.65)', color: '#fff' }}>
          {fileKind(row)}
        </span>
        <span className="absolute inset-0 flex items-end justify-center pb-2 opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ background: 'linear-gradient(transparent 55%, rgba(0,0,0,0.55))' }}>
          <span className="text-[10px] font-semibold text-white">Click to view full size</span>
        </span>
      </div>

      {/* Its own height only — the preview above is what takes the room a
          taller row gives, so a bigger screen shows a bigger certificate. */}
      <div className="p-3 flex-shrink-0 flex flex-col gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Avatar name={name || row.title} photoUrl={row.trainer_profiles?.profiles?.photo_url ?? null} size={28} tone="secondary" />
          <div className="min-w-0">
            <p className="text-[12px] font-semibold text-white truncate" title={row.title}>{row.title}</p>
            {/* A missed lookup renders nothing, never a stand-in name. */}
            {name && <p className="text-[10px] truncate" style={{ color: 'var(--color-primary)' }}>{name}</p>}
          </div>
        </div>
        <p className="text-[10px]" style={{ color: TEXT_MUTED }}>
          Uploaded {dateFmt.format(new Date(row.uploaded_at))}{size && ` · ${size}`}
        </p>
        {row.review_note && (
          <p className="text-[10px] truncate" style={{ color: 'var(--color-secondary)' }} title={row.review_note}>
            “{row.review_note}”
          </p>
        )}
        <div className="mt-auto flex gap-1.5">
          {row.status === 'pending' ? (
            <>
              <button onClick={onVerify} disabled={busy}
                className="flex-1 h-8 rounded-lg text-[11px] font-bold disabled:opacity-50"
                style={{ background: 'var(--color-primary)', color: '#fff' }}>
                <Check size={12} className="inline mr-1" />Verify
              </button>
              {/* Opens the viewer with the reason box: a rejection the trainer
                  cannot understand is a dead end — they re-upload the same file. */}
              <button onClick={onReject} disabled={busy}
                className="flex-1 h-8 rounded-lg text-[11px] font-semibold disabled:opacity-50"
                style={{ background: 'var(--color-secondary-light)', color: 'var(--color-secondary)' }}>
                <X size={12} className="inline mr-1" />Reject
              </button>
            </>
          ) : (
            <button onClick={onView}
              className="flex-1 h-8 rounded-lg text-[11px] font-semibold"
              style={{ background: 'var(--color-surface)', color: TEXT_SECOND, border: `1px solid ${BORDER}` }}>
              View{row.reviewed_at && ` · reviewed ${dateFmt.format(new Date(row.reviewed_at))}`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * The large view: the document filling most of the screen, the decision beside
 * it. Keyed by the credential's id where it is used, so moving to the next one
 * starts with an empty reason box rather than carrying the last one's over.
 */
function Viewer({ row, signed, broken, busy, position, startRejecting,
  onClose, onPrev, onNext, onDecide, onOpenTab, onRetry, onBroken }: {
  row: Row;
  signed: Signed | undefined;
  broken: boolean;
  busy: boolean;
  position: { index: number; count: number } | null;
  startRejecting: boolean;
  onClose: () => void;
  onPrev: (() => void) | null;
  onNext: (() => void) | null;
  onDecide: (status: 'verified' | 'rejected', note: string) => void;
  onOpenTab: () => void;
  onRetry: () => void;
  onBroken: () => void;
}) {
  const [rejecting, setRejecting] = useState(startRejecting);
  const [note, setNote] = useState('');
  const name = trainerName(row);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Arrow keys belong to the reason box while someone is typing in it.
      const typing = (e.target as HTMLElement | null)?.tagName === 'TEXTAREA';
      if (e.key === 'Escape') onClose();
      else if (!typing && e.key === 'ArrowLeft' && onPrev) onPrev();
      else if (!typing && e.key === 'ArrowRight' && onNext) onNext();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, onPrev, onNext]);

  const details: Array<[string, string]> = [
    ['Uploaded', dateFmt.format(new Date(row.uploaded_at))],
    ['File', [fileKind(row), fileSize(row.size_bytes)].filter(Boolean).join(' · ')],
  ];
  if (row.reviewed_at) details.push(['Reviewed', dateFmt.format(new Date(row.reviewed_at))]);

  const navButton = (side: 'left' | 'right', go: (() => void) | null) => go && (
    <button onClick={go} aria-label={side === 'left' ? 'Previous credential' : 'Next credential'}
      className={`absolute top-1/2 -translate-y-1/2 ${side === 'left' ? 'left-3' : 'right-3'} w-10 h-10 rounded-full flex items-center justify-center`}
      style={{ background: 'rgba(0,0,0,0.6)', color: '#fff', border: '1px solid rgba(255,255,255,0.15)' }}>
      {side === 'left' ? <ChevronLeft size={20} /> : <ChevronRight size={20} />}
    </button>
  );

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-6"
      style={{ background: 'rgba(0,0,0,0.8)' }} onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={row.title}
        className="w-full max-w-6xl h-full max-h-[90vh] rounded-2xl overflow-hidden flex"
        style={{ background: 'var(--color-surface-raised)', border: `1px solid ${BORDER}` }}
        onClick={(e) => e.stopPropagation()}>
        <div className="flex-1 min-w-0 relative" style={{ background: 'var(--color-bg)' }}>
          <Preview row={row} signed={signed} broken={broken} large onRetry={onRetry} onBroken={onBroken} />
          {navButton('left', onPrev)}
          {navButton('right', onNext)}
        </div>

        <aside className="w-80 flex-shrink-0 flex flex-col gap-4 p-5 overflow-y-auto"
          style={{ borderLeft: `1px solid ${BORDER}` }}>
          <div className="flex items-center justify-between gap-2">
            <StatusChip status={row.status} />
            <div className="flex items-center gap-2">
              {position && (
                <span className="text-[10px] tabular-nums" style={{ color: TEXT_MUTED }}>
                  {position.index + 1} of {position.count}
                </span>
              )}
              <button onClick={onClose} aria-label="Close" className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{ background: 'var(--color-surface-high)', color: TEXT_SECOND }}>
                <X size={15} />
              </button>
            </div>
          </div>

          <div>
            <p className="text-base font-bold text-white leading-snug">{row.title}</p>
            {name && (
              <div className="flex items-center gap-2 mt-2">
                <Avatar name={name} photoUrl={row.trainer_profiles?.profiles?.photo_url ?? null} size={26} tone="secondary" />
                <span className="text-xs" style={{ color: 'var(--color-primary)' }}>{name}</span>
              </div>
            )}
          </div>

          <dl className="space-y-1.5">
            {details.map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3 text-xs">
                <dt style={{ color: TEXT_MUTED }}>{k}</dt>
                <dd className="text-right" style={{ color: TEXT_SECOND }}>{v}</dd>
              </div>
            ))}
          </dl>

          {row.review_note && (
            <div className="rounded-lg p-2.5 text-xs" style={{ background: 'var(--color-secondary-light)', color: 'var(--color-secondary)' }}>
              <p className="text-[10px] font-semibold uppercase tracking-wide mb-0.5">Reason given</p>
              {row.review_note}
            </div>
          )}

          {signed?.url && (
            <button onClick={onOpenTab} className="h-9 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5"
              style={{ background: 'var(--color-surface-high)', color: TEXT_SECOND, border: `1px solid ${BORDER}` }}>
              <ExternalLink size={13} /> Open in a new tab
            </button>
          )}

          <div className="mt-auto space-y-2">
            {row.status === 'pending' ? (
              rejecting ? (
                <>
                  <label className="block text-[11px] font-semibold" style={{ color: TEXT_SECOND }} htmlFor="reject-reason">
                    Reason — the trainer sees this
                  </label>
                  <textarea id="reject-reason" autoFocus value={note} onChange={(e) => setNote(e.target.value)} rows={3}
                    placeholder="e.g. The photo is blurred — the licence number can't be read."
                    className="w-full px-3 py-2 rounded-lg text-xs text-white outline-none resize-none"
                    style={{ background: 'var(--color-bg)', border: `1px solid ${BORDER}` }} />
                  <div className="flex gap-2">
                    <button onClick={() => setRejecting(false)} disabled={busy}
                      className="flex-1 h-9 rounded-lg text-xs font-semibold"
                      style={{ background: 'var(--color-surface-high)', color: TEXT_SECOND }}>
                      Back
                    </button>
                    <button onClick={() => onDecide('rejected', note)} disabled={busy || !note.trim()}
                      className="flex-1 h-9 rounded-lg text-xs font-bold disabled:opacity-50"
                      style={{ background: 'var(--color-secondary)', color: '#000' }}>
                      Reject
                    </button>
                  </div>
                </>
              ) : (
                <div className="flex gap-2">
                  <button onClick={() => onDecide('verified', '')} disabled={busy}
                    className="flex-1 h-10 rounded-lg text-xs font-bold disabled:opacity-50"
                    style={{ background: 'var(--color-primary)', color: '#fff' }}>
                    <Check size={13} className="inline mr-1" />Verify
                  </button>
                  <button onClick={() => setRejecting(true)} disabled={busy}
                    className="flex-1 h-10 rounded-lg text-xs font-semibold disabled:opacity-50"
                    style={{ background: 'var(--color-secondary-light)', color: 'var(--color-secondary)' }}>
                    <X size={13} className="inline mr-1" />Reject
                  </button>
                </div>
              )
            ) : (
              <p className="text-[11px]" style={{ color: TEXT_MUTED }}>
                Already decided. The trainer has been shown this result.
              </p>
            )}
            {(onPrev || onNext) && (
              <p className="text-[10px] text-center" style={{ color: TEXT_MUTED }}>← → to move between credentials · Esc to close</p>
            )}
          </div>
        </aside>
      </div>
    </div>,
    document.body,
  );
}

export default function Credentials() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [filter, setFilterState] = useState<Filter>('all');
  const [rawPage, setPage] = useState(1);
  const [viewing, setViewing] = useState<{ id: string; rejecting: boolean } | null>(null);
  const [signed, setSigned] = useState<Record<string, Signed>>({});
  const [broken, setBroken] = useState<Record<string, true>>({});
  // Destructured: the compiler lint treats an object whose member is passed as
  // a `ref` as a ref itself, and would refuse the read of `perPage`.
  const { measure: measureGrid, perPage, rows: gridRows } = useFillGrid(6, 1, TILE_MIN_PX);

  /** Pure fetch, no state. Keeps every setState behind an await in the caller,
   *  which is what react-hooks/set-state-in-effect is asking for. */
  const fetchRows = async (): Promise<Row[] | null> => {
    const { data, error } = await supabase
      .from('trainer_credentials')
      .select('id, trainer_id, title, file_path, mime_type, size_bytes, status, uploaded_at, reviewed_at, review_note, trainer_profiles(profiles(first_name, last_name, photo_url))')
      .order('uploaded_at', { ascending: false });
    return error ? null : ((data ?? []) as unknown as Row[]);
  };

  const load = async () => {
    const res = await fetchRows();
    if (res) { setRows(res); setFailed(false); } else setFailed(true);
  };

  useEffect(() => {
    let alive = true;
    (async () => {
      const res = await fetchRows();
      if (!alive) return;
      if (res) setRows(res); else setFailed(true);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, []);

  const setFilter = (f: Filter) => { setFilterState(f); setPage(1); };

  // Waiting first — it is the part of the page that is a task — then newest.
  const shown = useMemo(() => {
    const order = { pending: 0, rejected: 1, verified: 2 } as const;
    return rows
      .filter((r) => filter === 'all' || r.status === filter)
      .sort((a, b) => order[a.status] - order[b.status] || b.uploaded_at.localeCompare(a.uploaded_at));
  }, [rows, filter]);

  // Clamped during render, never corrected in an effect.
  const page = Math.min(rawPage, Math.max(1, Math.ceil(shown.length / perPage)));
  const pageRows = shown.slice((page - 1) * perPage, page * perPage);
  const viewRow = viewing ? rows.find((r) => r.id === viewing.id) ?? null : null;

  // Sign what is on screen — this page's cards and the open viewer — in one
  // request. Re-runs when the page changes or an entry is dropped for a retry;
  // anything signed and still fresh is left alone.
  const wantKey = [...pageRows.map((r) => r.file_path), ...(viewRow ? [viewRow.file_path] : [])].join('\n');
  useEffect(() => {
    const now = Date.now();
    const need = [...new Set(wantKey ? wantKey.split('\n') : [])].filter((p) => {
      const s = signed[p];
      return !s || (s.url != null && now - s.at > RESIGN_AFTER_MS);
    });
    if (need.length === 0) return;
    let alive = true;
    (async () => {
      const { data, error } = await supabase.storage.from('credentials').createSignedUrls(need, SIGN_SECONDS);
      if (!alive) return;
      const at = Date.now();
      setSigned((prev) => {
        const next = { ...prev };
        need.forEach((p, i) => {
          if (error) { next[p] = { url: null, at, reason: 'failed' }; return; }
          const hit = data?.find((d) => d.path === p) ?? data?.[i];
          next[p] = hit && !hit.error && hit.signedUrl
            ? { url: hit.signedUrl, at }
            : { url: null, at, reason: 'missing' };
        });
        return next;
      });
      setBroken((prev) => {
        const next = { ...prev };
        for (const p of need) delete next[p];
        return next;
      });
    })();
    return () => { alive = false; };
  }, [wantKey, signed]);

  /** Drops a path's signature so the effect above signs it again. */
  const retry = (path: string) => setSigned((prev) => {
    const next = { ...prev };
    delete next[path];
    return next;
  });
  const markBroken = (path: string) => setBroken((prev) => (prev[path] ? prev : { ...prev, [path]: true }));

  // Opening the viewer adds its path to `wantKey` (even when the card is on
  // this page, the key string changes), so the signing effect re-checks it and
  // renews a signature about to lapse.
  const openView = (row: Row, rejecting = false) => setViewing({ id: row.id, rejecting });

  const openTab = async (row: Row) => {
    const { data, error } = await supabase.storage
      .from('credentials')
      .createSignedUrl(row.file_path, SIGN_SECONDS);
    if (error || !data?.signedUrl) {
      showToast('Could not open that file', 'error');
      return;
    }
    window.open(data.signedUrl, '_blank', 'noopener');
  };

  const decide = async (row: Row, status: 'verified' | 'rejected', note: string) => {
    if (status === 'rejected' && !note.trim()) {
      showToast('A reason is required to reject', 'error');
      return;
    }
    setBusy(row.id);
    try {
      // `reviewed_by` and `reviewed_at` are stamped by the trigger from
      // auth.uid(), not sent from here — the client does not get to say who
      // reviewed something.
      const { data, error } = await supabase
        .from('trainer_credentials')
        .update({ status, review_note: note.trim() || null })
        .eq('id', row.id)
        .select('id');
      if (error) throw error;
      assertWrote(data, 'That credential could not be updated — it may have been removed.');
      showToast(status === 'verified' ? 'Marked verified' : 'Rejected — the trainer will see your reason', 'success');
      await load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not save that decision', 'error');
    } finally {
      setBusy(null);
    }
  };

  const counts = {
    pending: rows.filter((r) => r.status === 'pending').length,
    verified: rows.filter((r) => r.status === 'verified').length,
    rejected: rows.filter((r) => r.status === 'rejected').length,
  };
  const viewIndex = viewRow ? shown.findIndex((r) => r.id === viewRow.id) : -1;
  const step = (by: number) => {
    const next = shown[viewIndex + by];
    if (!next) return;
    // Keep the grid behind the viewer on the page that holds the open card.
    setPage(Math.floor((viewIndex + by) / perPage) + 1);
    openView(next);
  };

  return (
    // Exactly the window's height (header 4rem + <main>'s padding 3rem): the
    // cards fill the middle and the pager sits at the bottom edge.
    <div className="h-[calc(100vh-7rem)] flex flex-col gap-4">
      <PageHeader
        title="Trainer credentials"
        subtitle="Certificates trainers upload from the app — look at the document, then verify or reject it"
        actions={
          <Chips value={filter} onChange={setFilter} options={[
            { value: 'all', label: 'All', count: rows.length },
            { value: 'pending', label: 'Waiting', count: counts.pending },
            { value: 'verified', label: 'Verified', count: counts.verified },
            { value: 'rejected', label: 'Rejected', count: counts.rejected },
          ]} />
        }
      />

      <StatTiles items={[
        { label: 'Waiting for review', value: loading ? '—' : counts.pending, icon: Clock, tone: counts.pending > 0 ? 'secondary' : 'primary' },
        { label: 'Verified', value: loading ? '—' : counts.verified, icon: ShieldCheck },
        { label: 'Rejected', value: loading ? '—' : counts.rejected, icon: X },
      ]} />

      {loading ? (
        <p className="text-sm" style={{ color: TEXT_MUTED }}>Loading credentials…</p>
      ) : failed ? (
        <EmptyState icon={AlertTriangle} title="Couldn't load credentials"
          hint="A connection problem, not an empty list — nothing has been reviewed or missed. Reload to try again." />
      ) : rows.length === 0 ? (
        <EmptyState icon={Award} title="No certificates uploaded yet"
          hint="Trainers add these from their own profile screen in the phone app." />
      ) : shown.length === 0 ? (
        <EmptyState icon={FileText} title={`No ${filter === 'pending' ? 'waiting' : filter} credentials`}
          hint="Try another filter — the rest are still on All." />
      ) : (
        // Measured by `useFillGrid`: height from the page, never from the
        // cards; scrolls rather than clips; a stable gutter so a scrollbar
        // appearing cannot change the column count.
        <div ref={measureGrid} className="flex-1 min-h-0 overflow-y-auto" style={{ scrollbarGutter: 'stable' }}>
          {/* CardGrid's columns, with rows that share the box's height — see
              TILE_MIN_PX. Never below a card's minimum, so a very short
              window scrolls the box rather than squashing the cards. */}
          <div className="grid gap-3 h-full"
            style={{
              gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))',
              gridTemplateRows: `repeat(${gridRows}, minmax(${TILE_MIN_PX}px, 1fr))`,
            }}>
            {pageRows.map((r) => (
              <CredentialTile key={r.id} row={r}
                signed={signed[r.file_path]} broken={!!broken[r.file_path]} busy={busy === r.id}
                onView={() => openView(r)}
                onVerify={() => decide(r, 'verified', '')}
                onReject={() => openView(r, true)}
                onRetry={() => retry(r.file_path)}
                onBroken={() => markBroken(r.file_path)} />
            ))}
          </div>
        </div>
      )}

      {!loading && shown.length > 0 && (
        <div className="flex items-center justify-between">
          <PageSummary page={page} perPage={perPage} total={shown.length} noun="credentials" />
          <Pagination currentPage={page} totalItems={shown.length} itemsPerPage={perPage} onPageChange={setPage} />
        </div>
      )}

      {viewRow && viewing && (
        <Viewer key={viewRow.id} row={viewRow}
          signed={signed[viewRow.file_path]} broken={!!broken[viewRow.file_path]}
          busy={busy === viewRow.id}
          position={viewIndex >= 0 ? { index: viewIndex, count: shown.length } : null}
          startRejecting={viewing.rejecting}
          onClose={() => setViewing(null)}
          onPrev={viewIndex > 0 ? () => step(-1) : null}
          onNext={viewIndex >= 0 && viewIndex < shown.length - 1 ? () => step(1) : null}
          onDecide={(status, note) => decide(viewRow, status, note)}
          onOpenTab={() => openTab(viewRow)}
          onRetry={() => retry(viewRow.file_path)}
          onBroken={() => markBroken(viewRow.file_path)} />
      )}
    </div>
  );
}
