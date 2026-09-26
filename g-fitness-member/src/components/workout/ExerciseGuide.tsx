import { useEffect, useState } from 'react';
import { ArrowUpRight } from '@phosphor-icons/react';
import { embedUrl } from '../../lib/videoEmbed';
import { listExerciseMedia, type ExerciseMedia } from '../../lib/api/exerciseMedia';
import { listExercises } from '../../lib/api/workoutSets';

/**
 * How to do one exercise, as this member's gym teaches it (0121).
 *
 * The gym's own photo, video, cues and steps come from its overlay; where the
 * gym wrote no cues or steps, the Core Fitness starter text shows instead — an
 * overlay's NULL means "use the library's", an empty array means "none".
 *
 * **Never behind a plan.** Seeing how to do a movement safely is not an upsell
 * (spec decision), so nothing here reads the member's features.
 *
 * With no gym video, the old YouTube search link stays — worded as a search,
 * because it is one: not the gym's video and not checked by anyone.
 */
export default function ExerciseGuide({
  name, libraryCues, librarySteps, media,
}: {
  name: string;
  libraryCues: string[];
  librarySteps: string[];
  media: ExerciseMedia | null;
}) {
  const cues = media?.cues ?? libraryCues;
  const steps = media?.steps ?? librarySteps;
  const video = embedUrl(media?.videoUrl);
  const label = { fontSize: 12, fontWeight: 600, color: 'var(--color-primary-300)' } as const;

  return (
    <div className="flex flex-col" style={{ gap: 14 }}>
      {media?.photoUrl && (
        <img src={media.photoUrl} alt={`${name}, as your gym shows it`}
          style={{ width: '100%', maxHeight: 240, objectFit: 'cover', borderRadius: 14 }} />
      )}

      {video ? (
        <div style={{ position: 'relative', width: '100%', aspectRatio: '16 / 9', borderRadius: 14, overflow: 'hidden', background: '#000' }}>
          <iframe src={video} title={`${name} — your gym's video`} loading="lazy"
            allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowFullScreen
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }} />
        </div>
      ) : (
        <div>
          <a href={`https://www.youtube.com/results?search_query=${encodeURIComponent(`${name} proper form`)}`}
            target="_blank" rel="noopener noreferrer" className="inline-flex items-center"
            style={{ gap: 6, fontSize: 13.5, fontWeight: 600, color: 'var(--color-secondary)' }}>
            Search form videos on YouTube <ArrowUpRight size={14} aria-hidden />
          </a>
          <p style={{ fontSize: 12, lineHeight: 1.5, marginTop: 4, color: 'var(--color-text-muted)' }}>
            A search, not your gym's own video. Ask a coach to check your form the first time.
          </p>
        </div>
      )}

      {cues.length > 0 && (
        <div>
          <p style={label}>Remember</p>
          <ul style={{ marginTop: 6, paddingLeft: 18, listStyle: 'disc' }}>
            {cues.map((c) => (
              <li key={c} style={{ fontSize: 14, lineHeight: 1.45, color: 'var(--color-text-primary)' }}>{c}</li>
            ))}
          </ul>
        </div>
      )}

      {steps.length > 0 && (
        <div>
          <p style={label}>Step by step</p>
          <ol style={{ marginTop: 6, paddingLeft: 20, listStyle: 'decimal' }}>
            {steps.map((s, i) => (
              <li key={i} style={{ fontSize: 14, lineHeight: 1.5, marginTop: i ? 4 : 0, color: 'var(--color-text-secondary)' }}>{s}</li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

/**
 * The same guide for an exercise known only by id — the workout player, which
 * holds a routine, not the catalogue. Loads when mounted; the sheet it lives
 * in mounts only while open, so nothing is fetched until "How to" is pressed.
 */
export function ExerciseGuideFor({ exerciseId, name }: { exerciseId: string; name: string }) {
  const [state, setState] = useState<{ cues: string[]; steps: string[]; media: ExerciseMedia | null } | null | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const [all, media] = await Promise.all([listExercises(), listExerciseMedia()]);
        const ex = all.find((e) => e.id === exerciseId);
        if (alive) setState({ cues: ex?.cues ?? [], steps: ex?.steps ?? [], media: media.get(exerciseId) ?? null });
      } catch {
        if (alive) setState(null);
      }
    })();
    return () => { alive = false; };
  }, [exerciseId]);

  if (state === undefined) return <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Loading…</p>;
  if (state === null) return <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>The guide could not be loaded just now.</p>;
  return <ExerciseGuide name={name} libraryCues={state.cues} librarySteps={state.steps} media={state.media} />;
}
