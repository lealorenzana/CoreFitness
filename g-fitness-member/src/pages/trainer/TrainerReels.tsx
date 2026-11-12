import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DotsThree, Heart, Plus } from '@phosphor-icons/react';
import { Page, PageTitle } from '../../components/ui/page';
import { NocButton, StatusPill, TextTabs } from '../../components/ui/noc';
import { Field, FieldError, TextArea, TextInput } from '../../components/ui/Field';
import GlassSheet from '../../components/ui/GlassSheet';
import { SkeletonList } from '../../components/ui/Skeleton';
import ErrorState from '../../components/ui/ErrorState';
import { toast } from '../../components/ui/Toast';
import { ReelCover } from '../../components/reels/ReelPlayer';
import {
  editReel, listReels, postLinkReel, postUploadedReel, reelFileProblem, gymStorage, storageWords, removeReel, REEL_VIDEO_TYPES, type Reel,
} from '../../lib/api/reels';
import { reelEmbedUrl, reelLinkSource, REEL_LINK_HINT, REEL_SOURCE_WORDS } from '../../lib/reelEmbed';
import { useT } from '../../lib/i18n';

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * Reels for a coach (0245): the gym's reels as rows, each opening the player;
 * the coach's own (and any they may manage) carry Manage — edit the words, hide
 * it, remove it. Post a reel takes a pasted link or a small video. What the
 * database says when it refuses (the upload limit, a link it does not take) is
 * shown as it says it.
 */
export default function TrainerReels() {
  const t = useT();
  const navigate = useNavigate();
  const [reels, setReels] = useState<Reel[] | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);
  const [managing, setManaging] = useState<Reel | null>(null);

  const load = useCallback(async () => {
    try {
      setReels(await listReels());
      setFailed(null);
    } catch (e) {
      setFailed(msg(e));
    }
  }, []);
  useEffect(() => { void (async () => { await load(); })(); }, [load]);

  return (
    <Page>
      <PageTitle back fallback="/trainer/home" title={t('Reels')} subtitle={t('Short videos for the gym’s members. Members watch and like them.')} />
      <NocButton icon={<Plus size={16} />} onClick={() => setPosting(true)} className="w-full">{t('Post a reel')}</NocButton>

      {failed && !reels ? (
        <ErrorState message={failed} onRetry={() => { setFailed(null); void load(); }} />
      ) : !reels ? (
        <SkeletonList count={4} />
      ) : reels.length === 0 ? (
        <p data-reels-empty style={{ fontSize: 13.5, color: 'var(--color-text-secondary)' }}>
          {t('The gym has no reels yet. Post the first one.')}
        </p>
      ) : (
        <section aria-label={t('The gym’s reels')} data-trainer-reels>
          {reels.map((r, i) => (
            <ReelRow key={r.id} reel={r} last={i === reels.length - 1}
              onOpen={() => navigate(`/trainer/reels/watch?reel=${encodeURIComponent(r.id)}`)}
              onManage={r.canManage ? () => setManaging(r) : undefined} />
          ))}
        </section>
      )}

      <PostSheet open={posting} onClose={() => setPosting(false)} onPosted={() => { setPosting(false); void load(); }} />
      {managing && (
        <ManageSheet key={managing.id} reel={managing} onClose={() => setManaging(null)}
          onChanged={() => { setManaging(null); void load(); }} />
      )}
    </Page>
  );
}

/** A row, drawn as LineRow draws one — two sibling buttons, since a row with Manage cannot be one button. */
function ReelRow({ reel, last, onOpen, onManage }: { reel: Reel; last: boolean; onOpen: () => void; onManage?: () => void }) {
  const t = useT();
  return (
    <div data-reel-row={reel.id}>
      <div className="flex items-center" style={{ gap: 8 }}>
        <button type="button" onClick={onOpen} className="flex-1 min-w-0 flex items-center text-left noc-row" style={{ gap: 12, padding: '11px 0' }}>
          <span className="relative flex-none overflow-hidden" style={{ width: 40, aspectRatio: '9 / 16', borderRadius: 8,
            border: '1px solid rgb(var(--hair-rgb, 255 255 255) / 0.12)' }}>
            <ReelCover reel={reel} />
          </span>
          <span className="flex-1 min-w-0 block">
            <span className="block truncate" style={{ fontSize: 14.5, fontWeight: 600, color: 'var(--color-text-primary)' }}>{reel.title}</span>
            <span className="flex items-center flex-wrap" style={{ gap: 6, fontSize: 12, marginTop: 2, color: 'var(--color-text-secondary)' }}>
              <span>{[REEL_SOURCE_WORDS[reel.source], reel.author].filter(Boolean).join(' · ')}</span>
              <span className="inline-flex items-center" style={{ gap: 3 }}><Heart size={12} aria-hidden />{reel.likes}</span>
              {reel.hidden && <StatusPill label={t('Hidden')} tone="action" />}
            </span>
          </span>
        </button>
        {onManage && (
          <button type="button" onClick={onManage} aria-label={`${t('Manage')} ${reel.title}`} data-reel-manage
            className="flex-none grid place-items-center noc-press"
            style={{ width: 40, height: 40, borderRadius: 10, border: '1px solid rgb(var(--hair-rgb, 255 255 255) / 0.14)', color: 'var(--color-text-secondary)' }}>
            <DotsThree size={20} weight="bold" />
          </button>
        )}
      </div>
      {!last && <div className="hair" />}
    </div>
  );
}

type Mode = 'link' | 'upload';

function PostSheet({ open, onClose, onPosted }: { open: boolean; onClose: () => void; onPosted: () => void }) {
  const t = useT();
  const [mode, setMode] = useState<Mode>('link');
  const [url, setUrl] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [caption, setCaption] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [limit, setLimit] = useState<string | null>(null);

  useEffect(() => {
    if (!open || mode !== 'upload' || limit != null) return;
    let alive = true;
    void (async () => {
      const s = await gymStorage().catch(() => null);
      if (alive && s) setLimit(storageWords(s));
    })();
    return () => { alive = false; };
  }, [open, mode, limit]);

  const source = url.trim() ? reelLinkSource(url) : null;
  const linkProblem = url.trim() && !source ? `${t('That link is not one we take.')} ${t(REEL_LINK_HINT)}.` : null;
  const fileProblem = file ? reelFileProblem(file) : null;
  const ready = title.trim().length > 0 && !busy && (mode === 'link' ? !!source : !!file && !fileProblem);

  const reset = () => { setUrl(''); setFile(null); setTitle(''); setCaption(''); setError(null); setBusy(false); };
  const close = () => { if (!busy) { reset(); onClose(); } };

  const submit = async () => {
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      if (mode === 'link') await postLinkReel({ title: title.trim(), caption: caption.trim(), url });
      else if (file) await postUploadedReel({ title: title.trim(), caption: caption.trim(), file });
      toast.success(t('Reel posted'));
      reset();
      onPosted();
    } catch (e) {
      setError(msg(e));
      setBusy(false);
    }
  };

  return (
    <GlassSheet open={open} onClose={close} title={t('Post a reel')}
      footer={
        <NocButton className="w-full" onClick={() => void submit()} disabled={!ready}>
          {busy ? (mode === 'upload' ? t('Uploading…') : t('Posting…')) : t('Post')}
        </NocButton>
      }>
      <div className="flex flex-col" style={{ gap: 16 }} data-post-reel>
        <TextTabs<Mode> label={t('How to add it')} active={mode} onChange={(m) => { setMode(m); setError(null); }}
          tabs={[{ id: 'link', label: t('Paste a link') }, { id: 'upload', label: t('Upload a video') }]} />
        {mode === 'link' ? (
          <div>
            <Field label={t('Link')} hint={t(REEL_LINK_HINT)}>
              <TextInput type="url" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" disabled={busy} />
            </Field>
            {linkProblem && <FieldError>{linkProblem}</FieldError>}
            {source && (
              <p style={{ fontSize: 12.5, marginTop: 6, color: 'var(--color-text-secondary)' }}>
                {reelEmbedUrl(url)
                  ? `${t('From')} ${REEL_SOURCE_WORDS[source]} — ${t('it plays inside the app.')}`
                  : `${t('From')} ${REEL_SOURCE_WORDS[source]} — ${t('members get a button that opens it in that app.')}`}
              </p>
            )}
          </div>
        ) : (
          <div>
            <Field label={t('Video')} hint={`${t('MP4, MOV or WebM, up to 25 MB.')}${limit != null ? ` ${t('The gym has used')} ${limit} ${t('of its storage.')}` : ''}`}>
              <input type="file" accept={REEL_VIDEO_TYPES.join(',')} disabled={busy} data-reel-file
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                style={{ fontSize: 13, color: 'var(--color-text-secondary)', maxWidth: '100%' }} />
            </Field>
            {fileProblem && <FieldError>{fileProblem}</FieldError>}
          </div>
        )}
        <Field label={t('Title')}>
          <TextInput value={title} onChange={(e) => setTitle(e.target.value)} disabled={busy} />
        </Field>
        <Field label={t('Caption')} hint={t('Optional')}>
          <TextArea rows={3} value={caption} onChange={(e) => setCaption(e.target.value)} disabled={busy} />
        </Field>
        {busy && mode === 'upload' && <p role="status" style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>{t('Uploading…')}</p>}
        {error && <FieldError>{error}</FieldError>}
      </div>
    </GlassSheet>
  );
}

function ManageSheet({ reel, onClose, onChanged }: { reel: Reel; onClose: () => void; onChanged: () => void }) {
  const t = useT();
  const [title, setTitle] = useState(reel.title);
  const [caption, setCaption] = useState(reel.caption ?? '');
  const [hidden, setHidden] = useState(reel.hidden);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (work: () => Promise<void>, done: string) => {
    setBusy(true);
    setError(null);
    try {
      await work();
      toast.success(done);
      onChanged();
    } catch (e) {
      setError(msg(e));
      setBusy(false);
    }
  };

  return (
    <GlassSheet open onClose={() => { if (!busy) onClose(); }} title={t('Manage reel')} subtitle={reel.title}
      footer={confirming ? (
        <div className="flex flex-col" style={{ gap: 8 }}>
          <p style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>{t('Remove this reel? Its likes go with it, and it cannot be brought back.')}</p>
          <div className="grid" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
            <NocButton variant="ghost" onClick={() => setConfirming(false)} disabled={busy}>{t('Keep it')}</NocButton>
            <NocButton onClick={() => void run(() => removeReel(reel.id), t('Reel removed'))} disabled={busy}>
              {busy ? t('Removing…') : t('Remove')}
            </NocButton>
          </div>
        </div>
      ) : (
        <div className="grid" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
          <NocButton variant="ghost" onClick={() => setConfirming(true)} disabled={busy}>{t('Remove')}</NocButton>
          <NocButton onClick={() => void run(() => editReel(reel.id, { title: title.trim(), caption: caption.trim(), hidden }), t('Saved'))}
            disabled={busy || !title.trim()}>
            {busy ? t('Saving…') : t('Save')}
          </NocButton>
        </div>
      )}>
      <div className="flex flex-col" style={{ gap: 16 }} data-manage-reel>
        <Field label={t('Title')}>
          <TextInput value={title} onChange={(e) => setTitle(e.target.value)} disabled={busy} />
        </Field>
        <Field label={t('Caption')} hint={t('Optional')}>
          <TextArea rows={3} value={caption} onChange={(e) => setCaption(e.target.value)} disabled={busy} />
        </Field>
        <label className="flex items-start" style={{ gap: 10, fontSize: 13.5, color: 'var(--color-text-primary)' }}>
          <input type="checkbox" checked={hidden} onChange={(e) => setHidden(e.target.checked)} disabled={busy}
            style={{ width: 18, height: 18, marginTop: 1, accentColor: 'var(--color-primary)' }} />
          <span>
            {t('Hide from members')}
            <span className="block" style={{ fontSize: 12, marginTop: 2, color: 'var(--color-text-muted)' }}>
              {t('Only you and the gym see a hidden reel.')}
            </span>
          </span>
        </label>
        {error && <FieldError>{error}</FieldError>}
      </div>
    </GlassSheet>
  );
}
