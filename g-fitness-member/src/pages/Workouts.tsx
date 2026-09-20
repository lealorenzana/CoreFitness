import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowUpRight, BookmarkSimple, Books, Barbell, CheckCircle, Circle, Globe, MagnifyingGlass, Sparkle,
} from '@phosphor-icons/react';
import { SkeletonList } from '../components/ui/Skeleton';
import { toast } from '../components/ui/Toast';
import Disclosure from '../components/ui/Disclosure';
import { TextInput } from '../components/ui/Field';
import { errorMessage } from '../utils/errorMessage';
import {
  listWorkoutResources, linkHost, hasPreview, type WorkoutResourceRow,
} from '../lib/api/workoutResources';
import {
  listSavedResources, saveResource, unsaveResource, setResourceDone, type SavedResource,
} from '../lib/api/savedResources';
import { getCurrentMemberId, getExperienceLevel, type ExperienceLevel } from '../services/bookingService';
import type { ClassLevel } from '../types/db';
import { Page, PageTitle } from '../components/ui/page';
import { Chip, Eyebrow, Panel, StatusPill, TextTabs } from '../components/ui/noc';
import { CLAMP_2 } from '../components/ui/styles';
import ExerciseLibrary from './workouts/ExerciseLibrary';

/**
 * Free workouts — the gym's library (0019), its exercise list (0050), and what
 * you saved (0090). Reworked 2026-09-19.
 *
 *   Library    search, "suits my level", Picked for you, then each category
 *              folded away — 37 links and 12 categories read as one long wall
 *   Exercises  the catalogue the tracker uses: last time, form videos, add to
 *              a routine
 *   Saved      bookmarked links with a done tick — per-member state in a table,
 *              never localStorage. Hidden until 0090 is live.
 *
 * Every link is someone else's free material, credited, never presented as the
 * gym's own programming, and nothing here states a number nobody measured.
 * **Never gated** — it exists for members who cannot pay.
 */

type Tab = 'library' | 'exercises' | 'saved';

const LEVEL_LABEL: Record<ClassLevel, string> = {
  beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced', all_levels: 'All levels',
};

/** Same rule as class matching: suggest, never restrict. */
const fitsLevel = (r: WorkoutResourceRow, level: ExperienceLevel | null) =>
  level != null && (r.level === 'all_levels' || r.level === level);

/** A 3:1 preview crop, or the host on a flat tile — never someone else's picture. */
function Thumb({ r }: { r: WorkoutResourceRow }) {
  const [broken, setBroken] = useState(false);
  const box = { width: 64, height: 48, borderRadius: 10, flex: 'none' as const, overflow: 'hidden' as const };
  if (hasPreview(r) && !broken) {
    return (
      <span style={{ ...box, background: 'var(--color-surface)', boxShadow: 'inset 0 0 0 1px var(--color-hairline)' }}>
        <img src={r.image_url as string} alt="" loading="lazy" onError={() => setBroken(true)}
          className="w-full h-full object-cover object-top" />
      </span>
    );
  }
  return (
    <span className="grid place-items-center" aria-hidden style={{
      ...box, color: 'var(--color-primary-300)', background: 'rgba(124, 58, 237, 0.12)',
      boxShadow: 'inset 0 0 0 1px var(--color-hairline)',
    }}>
      <Globe size={20} />
    </span>
  );
}

function ResourceRow({
  r, saved, canSave, onToggleSave, last, showCategory,
}: {
  r: WorkoutResourceRow;
  saved: SavedResource | undefined;
  canSave: boolean;
  onToggleSave: () => void;
  last: boolean;
  showCategory?: boolean;
}) {
  return (
    <div className="flex items-start" style={{
      gap: 12, padding: '14px 0', borderBottom: last ? 'none' : '1px solid var(--color-separator)',
    }}>
      {/* noreferrer: the destination has no business knowing which screen sent them. */}
      <a href={r.url} target="_blank" rel="noopener noreferrer" className="flex-1 min-w-0 flex items-start noc-press-soft" style={{ gap: 12 }}>
        <Thumb r={r} />
        <span className="min-w-0">
          <span className="flex items-start" style={{ gap: 5 }}>
            <span style={{ fontSize: 14.5, lineHeight: 1.35, fontWeight: 600, color: 'var(--color-text-primary)', ...CLAMP_2 }}>{r.title}</span>
            <ArrowUpRight size={13} className="flex-none" style={{ marginTop: 3, color: 'var(--color-text-muted)' }} aria-hidden />
          </span>
          <span className="block" style={{ fontSize: 12, marginTop: 2, color: 'var(--color-text-secondary)' }}>
            {r.provider}<span style={{ color: 'var(--color-text-muted)' }}> · {linkHost(r.url)}</span>
          </span>
          {r.description && (
            <span className="block" style={{ fontSize: 12.5, marginTop: 5, lineHeight: 1.5, color: 'var(--color-text-muted)', ...CLAMP_2 }}>
              {r.description}
            </span>
          )}
          <span className="flex flex-wrap" style={{ gap: 6, marginTop: 8 }}>
            <StatusPill label={LEVEL_LABEL[r.level]} tone="muted" />
            {showCategory && r.category && <StatusPill label={r.category} tone="muted" />}
            {saved?.doneAt && <StatusPill label="Done" tone="structure" />}
          </span>
        </span>
      </a>
      {canSave && (
        <button onClick={onToggleSave} aria-pressed={!!saved}
          aria-label={saved ? `Remove ${r.title} from saved` : `Save ${r.title}`}
          className="flex-none grid place-items-center noc-press"
          style={{ width: 44, height: 44, marginTop: -6, marginRight: -8, color: saved ? 'var(--color-secondary)' : 'var(--color-text-muted)' }}>
          <BookmarkSimple size={21} weight={saved ? 'fill' : 'regular'} />
        </button>
      )}
    </div>
  );
}

export default function Workouts() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [resources, setResources] = useState<WorkoutResourceRow[]>([]);
  const [saved, setSaved] = useState<SavedResource[] | null>(null);
  const [memberId, setMemberId] = useState<string | null>(null);
  const [level, setLevel] = useState<ExperienceLevel | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [mine, setMine] = useState(false);

  const rawTab = params.get('tab');
  const tab: Tab = rawTab === 'exercises' || (rawTab === 'saved' && saved) ? rawTab : 'library';
  const setTab = (t: Tab) => setParams(t === 'library' ? {} : { tab: t }, { replace: true });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = await listWorkoutResources();
        if (cancelled) return;
        setResources(rows);
        const id = await getCurrentMemberId().catch(() => null);
        if (!id || cancelled) return;
        setMemberId(id);
        const [lvl, sv] = await Promise.all([
          getExperienceLevel(id).catch(() => null),
          listSavedResources(id),
        ]);
        if (cancelled) return;
        setLevel(lvl);
        setSaved(sv);
      } catch (err) {
        if (!cancelled) toast.error(errorMessage(err, 'Could not load the resource library'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const savedById = useMemo(() => new Map((saved ?? []).map((s) => [s.resourceId, s])), [saved]);

  const toggleSave = async (r: WorkoutResourceRow) => {
    if (!memberId || !saved) return;
    const was = savedById.get(r.id);
    // Optimistic: the bookmark fills on tap and rolls back if the write fails.
    setSaved(was ? saved.filter((s) => s.resourceId !== r.id)
      : [{ resourceId: r.id, savedAt: new Date().toISOString(), doneAt: null }, ...saved]);
    try {
      if (was) await unsaveResource(memberId, r.id);
      else { await saveResource(memberId, r.id); toast.success('Saved — find it under Saved'); }
    } catch (err) {
      setSaved(saved);
      toast.error(errorMessage(err, 'Could not change your saved list'));
    }
  };

  const toggleDone = async (r: WorkoutResourceRow) => {
    if (!memberId || !saved) return;
    const done = !savedById.get(r.id)?.doneAt;
    setSaved(saved.map((s) => s.resourceId === r.id ? { ...s, doneAt: done ? new Date().toISOString() : null } : s));
    try {
      await setResourceDone(memberId, r.id, done);
    } catch (err) {
      setSaved(saved);
      toast.error(errorMessage(err, 'Could not update that'));
    }
  };

  // ── Library ──
  const q = query.trim().toLowerCase();
  const filtering = q.length > 0 || mine;
  const matches = useMemo(() => resources.filter((r) =>
    (!mine || fitsLevel(r, level))
    && (!q || [r.title, r.provider, r.description ?? '', r.category ?? ''].some((f) => f.toLowerCase().includes(q)))),
  [resources, q, mine, level]);
  const picked = useMemo(() => {
    const fit = resources.filter((r) => fitsLevel(r, level));
    // Pictures first — the gym chose those to lead — then the gym's own order.
    return [...fit].sort((a, b) => Number(hasPreview(b)) - Number(hasPreview(a)) || a.sort_order - b.sort_order).slice(0, 3);
  }, [resources, level]);
  const categories = useMemo(() => {
    const m = new Map<string, WorkoutResourceRow[]>();
    for (const r of resources) {
      const c = r.category ?? 'More';
      m.set(c, [...(m.get(c) ?? []), r]);
    }
    return [...m.entries()];
  }, [resources]);

  // Only resources the gym still shows: one the admin hid keeps its save (it
  // comes back if they un-hide it) but is not listed or counted meanwhile.
  const savedRows = (saved ?? [])
    .map((s) => ({ s, r: resources.find((x) => x.id === s.resourceId) }))
    .filter((x): x is { s: SavedResource; r: WorkoutResourceRow } => !!x.r);
  const toDo = savedRows.filter((x) => !x.s.doneAt);
  const done = savedRows.filter((x) => x.s.doneAt);

  const row = (r: WorkoutResourceRow, i: number, list: unknown[], showCategory = false) => (
    <ResourceRow key={r.id} r={r} saved={savedById.get(r.id)} canSave={saved != null}
      onToggleSave={() => void toggleSave(r)} last={i === list.length - 1} showCategory={showCategory} />
  );

  return (
    <Page>
      <PageTitle back fallback="/member/book-class" title="Free workouts"
        subtitle="Training material your gym picked, free to everyone" />

      {/* The one amber thing on the screen: the builder turns reading into a week. */}
      <Panel glow="action" filled onClick={() => navigate('/member/plan')} ariaLabel="Build your training week">
        <div className="flex items-center" style={{ gap: 12 }}>
          <span className="grid place-items-center flex-none" aria-hidden style={{
            width: 40, height: 40, borderRadius: 12, color: 'var(--color-secondary)',
            background: 'color-mix(in srgb, var(--color-secondary) 14%, transparent)',
          }}>
            <Sparkle size={20} weight="fill" />
          </span>
          <div className="flex-1 min-w-0">
            <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text-primary)' }}>Build your training week</p>
            <p style={{ fontSize: 12.5, marginTop: 2, lineHeight: 1.45, color: 'var(--color-text-secondary)' }}>
              Six short questions, then a plan around your days and goal
            </p>
          </div>
          <span className="flex-none" style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-secondary)' }}>Start</span>
        </div>
      </Panel>

      <TextTabs<Tab>
        label="Free workouts"
        tabs={[
          { id: 'library', label: `Library · ${resources.length}`, icon: <Books size={15} /> },
          { id: 'exercises', label: 'Exercises', icon: <Barbell size={15} /> },
          ...(saved ? [{ id: 'saved' as const, label: `Saved · ${savedRows.length}`, icon: <BookmarkSimple size={15} /> }] : []),
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === 'exercises' ? (
        <ExerciseLibrary memberId={memberId} />
      ) : loading ? (
        <SkeletonList />
      ) : tab === 'saved' ? (
        savedRows.length === 0 ? (
          <p style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--color-text-muted)' }}>
            Nothing saved yet. Tap the bookmark on anything in the Library to keep it here, then tick it off once you have done it.
          </p>
        ) : (
          <>
            <p style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
              <span style={{ fontWeight: 700, color: 'var(--color-text-primary)' }}>{done.length} of {savedRows.length}</span> done
            </p>
            {toDo.length > 0 && (
              <section>
                <Eyebrow mark>To do</Eyebrow>
                <div style={{ marginTop: 4 }}>
                  {toDo.map(({ r }, i) => (
                    <div key={r.id} className="flex items-start" style={{ gap: 4 }}>
                      <button onClick={() => void toggleDone(r)} aria-label={`Mark ${r.title} done`}
                        className="flex-none grid place-items-center noc-press" style={{ width: 36, height: 44, marginTop: 8, color: 'var(--color-text-muted)' }}>
                        <Circle size={22} />
                      </button>
                      <div className="flex-1 min-w-0">{row(r, i, toDo)}</div>
                    </div>
                  ))}
                </div>
              </section>
            )}
            {done.length > 0 && (
              <Disclosure title="Done" meta={String(done.length)} icon={<CheckCircle size={17} />} defaultOpen={toDo.length === 0}>
                {done.map(({ r }, i) => (
                  <div key={r.id} className="flex items-start" style={{ gap: 4 }}>
                    <button onClick={() => void toggleDone(r)} aria-label={`Mark ${r.title} not done`}
                      className="flex-none grid place-items-center noc-press" style={{ width: 36, height: 44, marginTop: 8, color: 'var(--color-primary-300)' }}>
                      <CheckCircle size={22} weight="fill" />
                    </button>
                    <div className="flex-1 min-w-0">{row(r, i, done)}</div>
                  </div>
                ))}
              </Disclosure>
            )}
          </>
        )
      ) : (
        <>
          <label className="flex items-center" style={{
            gap: 10, height: 46, padding: '0 14px', borderRadius: 'var(--radius-btn)',
            background: 'var(--color-surface)', border: '1px solid var(--color-hairline)',
          }}>
            <MagnifyingGlass size={17} aria-hidden style={{ color: 'var(--color-text-muted)', flex: 'none' }} />
            <TextInput value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search yoga, strength, no equipment…"
              aria-label="Search the library" className="flex-1 min-w-0"
              style={{ border: 'none', background: 'transparent', height: 44, padding: 0, fontSize: 14.5 }} />
          </label>
          {level && (
            <div className="flex" style={{ gap: 8, marginTop: -6 }}>
              <Chip label={`Suits ${LEVEL_LABEL[level].toLowerCase()}`} on={mine} onClick={() => setMine((m) => !m)} />
            </div>
          )}

          {filtering ? (
            <section>
              <Eyebrow mark>{matches.length} {matches.length === 1 ? 'result' : 'results'}</Eyebrow>
              {matches.length === 0 ? (
                <p style={{ fontSize: 13, marginTop: 8, color: 'var(--color-text-muted)' }}>Nothing matches. Try a shorter word.</p>
              ) : (
                <div style={{ marginTop: 4 }}>{matches.map((r, i) => row(r, i, matches, true))}</div>
              )}
            </section>
          ) : resources.length === 0 ? (
            <p style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--color-text-muted)' }}>
              Nothing here yet — your gym has not added any resources.
            </p>
          ) : (
            <>
              {picked.length > 0 && (
                <section>
                  <Eyebrow mark>Picked for you{level ? ` · ${LEVEL_LABEL[level]}` : ''}</Eyebrow>
                  <div style={{ marginTop: 4 }}>{picked.map((r, i) => row(r, i, picked, true))}</div>
                </section>
              )}
              <section className="flex flex-col" style={{ gap: 10 }}>
                <Eyebrow>Browse by kind</Eyebrow>
                {categories.map(([c, list]) => (
                  <Disclosure key={c} title={c} meta={String(list.length)}>
                    {list.map((r, i) => row(r, i, list))}
                  </Disclosure>
                ))}
              </section>
            </>
          )}

          <p style={{ fontSize: 12.5, lineHeight: 1.6, color: 'var(--color-text-muted)' }}>
            These are free resources published by others, not your gym’s own programmes.
            Check with a trainer before starting something new.
          </p>
        </>
      )}
    </Page>
  );
}
