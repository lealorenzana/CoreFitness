import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Barbell, CalendarCheck, ChatCircleText, EyeSlash, Lifebuoy, ListChecks, ListPlus, PaperPlaneRight, Ruler, Target, Trophy, X, type Icon } from '@phosphor-icons/react';
import { leaveFeedback, listFeedbackByTrainer, type TrainerFeedbackRow } from '../../lib/api/trainerFeedback';
import { DAY_LABELS, formatRemindAt } from '../../lib/api/gymPlans';
import TraineeProgram from './TraineeProgram';
import TraineeRecords from './TraineeRecords';
import TraineeSquad from './TraineeSquad';
import TraineeStreak from './TraineeStreak';
import TraineePhotos from './TraineePhotos';
import { TextArea, TextInput } from '../ui/Field';
import { InlineStat, NocButton, ProgressBar, StatusPill, TextTabs } from '../ui/noc';
import { supabase } from '../../lib/supabaseClient';
import { listMyTrainerMembers } from '../../lib/api/trainerRoster';
import { getCurrentTrainerId, getMemberDetailForTrainer, type MemberDetailForTrainer } from '../../services/trainerService';
import { levelLabel } from '../../lib/api/achievements';
import { errorMessage } from '../../utils/errorMessage';

/**
 * One block of a member's own data in the trainer's view.
 *
 * The three states are deliberately distinct. **Not shared** is the member's
 * choice, enforced by RLS (0032) — collapsing it into "nothing here" would
 * report an absence that isn't real and quietly misrepresent the member to
 * their coach.
 */
function SharedBlock({
  icon: BlockIcon, label, shared, empty, emptyText, children,
}: {
  icon: Icon;
  label: string;
  shared: boolean;
  empty: boolean;
  emptyText: string;
  children?: ReactNode;
}) {
  return (
    <div style={{ padding: '12px 0', borderBottom: '1px solid var(--color-separator)' }}>
      <p className="flex items-center" style={{
        gap: 7, fontSize: 12, fontWeight: 600, marginBottom: 6,
        color: shared ? 'var(--color-primary-300)' : 'var(--color-text-muted)',
      }}>
        {shared ? <BlockIcon size={14} /> : <EyeSlash size={14} />} {label}
      </p>
      {!shared ? (
        <p style={{ fontSize: 12.5, fontStyle: 'italic', color: 'var(--color-text-muted)' }}>
          Not shared — this member keeps it private.
        </p>
      ) : empty ? (
        <p style={{ fontSize: 12.5, color: 'var(--color-text-muted)' }}>{emptyText}</p>
      ) : (
        <div className="flex flex-col" style={{ gap: 3 }}>{children}</div>
      )}
    </div>
  );
}

/** The About tab's four parts (wave 2, 2026-10-27), in place of one long scroll. */
export type AboutTab = 'progress' | 'training' | 'notes' | 'safety';

/**
 * About — everything a coach knows about one trainee, on their place's About tab
 * (simplify, 2026-10-28; it was the trainee sheet on Your trainees): Progress,
 * Training, Notes and Safety, and the three things a coach does most. Only what
 * the member shares with their coaches (0032); the database refuses the rest.
 */
export default function TraineeAbout({ member, onChat, initialTab = 'progress' }: {
  member: { id: string; name: string };
  onChat: () => void;
  initialTab?: AboutTab;
}) {
  const navigate = useNavigate();
  const [sheetTab, setSheetTab] = useState<AboutTab>(initialTab);
  const [detail, setDetail] = useState<MemberDetailForTrainer | null>(null);
  const [detailLoading, setDetailLoading] = useState(true);
  /** Notes this coach has sent them, with whether they were seen / done (0088). */
  const [sentNotes, setSentNotes] = useState<TrainerFeedbackRow[] | null>(null);
  /** Their row on this coach's roster: level they declared and visits — absent for someone not on it yet. */
  const [row, setRow] = useState<{ experienceLevel: string | null; visitsLast30: number } | null>(null);
  const [showRecommendation, setShowRecommendation] = useState(false);
  const [recommendation, setRecommendation] = useState('');
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<{ text: string; ok: boolean } | null>(null);

  const load = useCallback(async () => {
    setDetailLoading(true);
    const [d, roster, notes] = await Promise.all([
      getMemberDetailForTrainer(member.id).catch(() => null),
      listMyTrainerMembers().catch(() => []),
      (async () => {
        const me = await getCurrentTrainerId().catch(() => null);
        if (!me) return [] as TrainerFeedbackRow[];
        return (await listFeedbackByTrainer(me).catch(() => [] as TrainerFeedbackRow[])).filter((r) => r.member_id === member.id).slice(0, 5);
      })(),
    ]);
    setDetail(d);
    const r = roster.find((x) => x.member_id === member.id);
    setRow(r ? { experienceLevel: r.experience_level, visitsLast30: r.visits_last_30 } : null);
    setSentNotes(notes);
    setDetailLoading(false);
  }, [member.id]);
  useEffect(() => { void (async () => { await load(); })(); }, [load]);

  /**
   * The note that goes with the recommendation.
   *
   * Two fields rather than one because they are read at different moments: the
   * note is what happened in the session, the recommendation is what the member
   * should do next — and a screen showing progress wants to surface only the
   * second. `trainer_feedback` keeps them apart for the same reason (0072).
   *
   * Optional: a coach with only advice to give should not have to invent a
   * session summary to send it.
   */
  const [sessionNote, setSessionNote] = useState('');

  /** Sends a real notification the member sees in their bell — the old version
   *  kept recommendations in component state, so they vanished on refresh and
   *  the member never received anything. */
  const handleSendRecommendation = async () => {
    if (!recommendation.trim() || sending) return;
    setSending(true);
    try {
      const trainerId = await getCurrentTrainerId();
      if (!trainerId) throw new Error('Not signed in');

      // Pre-flight. The insert is gated by `get_my_role() in (admin, staff,
      // trainer)`, and when it fails Postgres can only answer "policy violated"
      // — it cannot say *why*. Reading our own profile first turns an opaque
      // 42501 into the actual reason, which is nearly always one of:
      //   • no `profiles` row for this auth user  → get_my_role() is null
      //   • the row exists but role isn't 'trainer'
      // Both are account problems the gym can fix; neither is a policy problem.
      const { data: me, error: meErr } = await supabase
        .from('gym_people')
        .select('role, status, first_name, last_name')
        .eq('id', trainerId)
        .maybeSingle();

      if (meErr) throw meErr;
      if (!me) {
        throw new Error(
          'Your account has no profile record, so the gym cannot verify you as a trainer. Ask the admin to re-create your trainer account.'
        );
      }
      if (!['trainer', 'admin', 'staff'].includes(me.role)) {
        throw new Error(
          `Your account is registered as "${me.role}", not a trainer, so it cannot send recommendations. Ask the admin to fix your role.`
        );
      }

      // ── This is a record, not only an alert ─────────────────────────────
      //
      // `trainer_feedback` (0072) is the record. `trainer_id` is pinned to
      // `auth.uid()` by the insert policy, so a coach cannot sign a note with a
      // colleague's name — passing it here fills the row, it does not authorise
      // anything. The member's notification is sent by a database trigger
      // rather than from here: a client that *could* skip the message would
      // eventually skip it.
      await leaveFeedback({
        trainerId,
        memberId: member.id,
        note: sessionNote.trim() || recommendation.trim(),
        recommendation: sessionNote.trim() ? recommendation.trim() : undefined,
      });

      setSessionNote('');
      setRecommendation('');
      setShowRecommendation(false);
      setNotice({ text: `Recommendation sent to ${member.name}`, ok: true });
      setTimeout(() => setNotice(null), 2500);
    } catch (err) {
      console.error('Recommendation insert failed:', err);
      // Left on screen until dismissed — a failure that fades after 2.5s is a
      // failure nobody reads.
      setNotice({ text: errorMessage(err, 'Failed to send'), ok: false });
    } finally {
      setSending(false);
    }
  };

  const line = { fontSize: 13, color: 'var(--color-text-primary)' } as const;
  const muted = { color: 'var(--color-text-muted)' } as const;

  return (
    <div data-trainee-about data-trainee-sheet>
      {notice && (
        <div className="flex items-start" style={{
          gap: 10, padding: '10px 12px', borderRadius: 10, marginBottom: 10,
          border: `1px solid ${notice.ok ? 'var(--color-primary)' : 'var(--color-secondary)'}`,
          background: notice.ok ? 'color-mix(in srgb, var(--color-primary) 12%, transparent)' : 'color-mix(in srgb, var(--color-secondary) 10%, transparent)',
        }}>
          <p className="flex-1" style={{ fontSize: 12.5, color: notice.ok ? 'var(--color-primary-300)' : 'var(--color-secondary)' }}>{notice.text}</p>
          {!notice.ok && <button onClick={() => setNotice(null)} aria-label="Dismiss" style={{ color: 'var(--color-secondary)' }}><X size={13} /></button>}
        </div>
      )}
      {/* What a coach does most, one tap each (wave 2, 2026-10-27). */}
      <div className="grid" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }} data-quick>
        <button type="button" className="you-tile noc-press" style={{ textAlign: 'center', padding: '10px 6px' }} onClick={onChat}>
          <ChatCircleText size={20} style={{ color: 'var(--color-primary-300)' }} /><b style={{ marginTop: 4, fontSize: 12.5 }}>Message</b>
        </button>
        <button type="button" className="you-tile noc-press" style={{ textAlign: 'center', padding: '10px 6px' }}
          onClick={() => { setSheetTab('notes'); setShowRecommendation(true); }}>
          <PaperPlaneRight size={20} style={{ color: 'var(--color-secondary)' }} /><b style={{ marginTop: 4, fontSize: 12.5 }}>Recommend</b>
        </button>
        <button type="button" className="you-tile noc-press" style={{ textAlign: 'center', padding: '10px 6px' }}
          onClick={() => navigate(`/trainer/members/${member.id}/routine/new`)}>
          <ListPlus size={20} style={{ color: 'var(--color-primary-300)' }} /><b style={{ marginTop: 4, fontSize: 12.5 }}>New routine</b>
        </button>
      </div>

      {/* Real stats only. Two different levels, named apart: "Says" is
          what the member declared and drives their class recommendations;
          "Earned" is what this gym has recorded. Labelling both "Level"
          made the member app's own screens contradict each other. */}
      <div className="grid grid-cols-3" style={{ gap: 12, marginTop: 14 }}>
        <InlineStat value={<span className="capitalize" style={{ fontSize: 17 }}>{row?.experienceLevel ?? '—'}</span>} label="Says" />
        <InlineStat value={<span style={{ fontSize: 17 }}>{detail?.progression ? levelLabel(detail.progression.level) : '—'}</span>} label="Earned" />
        <InlineStat value={<span style={{ fontSize: 17 }}>{row?.visitsLast30 ?? '—'}</span>} label="Visits (30d)" />
      </div>

      <div style={{ marginTop: 14 }}>
        <TextTabs<AboutTab> label="About this trainee" active={sheetTab} onChange={setSheetTab}
          tabs={[{ id: 'progress', label: 'Progress' }, { id: 'training', label: 'Training' }, { id: 'notes', label: 'Notes' }, { id: 'safety', label: 'Safety' }]} />
      </div>

      {sheetTab === 'progress' && (
        <div data-tab-progress>
          <TraineeStreak memberId={member.id} firstName={member.name.split(' ')[0]} />
          {/* Their latest personal records (0123), when they share their workouts. */}
          <TraineeRecords memberId={member.id} />
          {detailLoading ? (
          <p style={{ fontSize: 12.5, padding: '12px 0', color: 'var(--color-text-muted)' }}>Loading their details…</p>
        ) : (
          <>
            <SharedBlock
              icon={Target}
              label="Goals"
              shared={detail?.shared.shareGoals ?? true}
              empty={(detail?.goals.length ?? 0) === 0}
              emptyText="No active goals."
            >
              {detail?.goals.map((g) => (
                <p key={g.id} className="truncate" style={line}>
                  {g.title}
                  {/* The same current value the member's Goals tab shows (0087). */}
                  {g.target_value != null && (
                    <span style={muted}>
                      {' '}— {detail.goalValues[g.id] != null ? `${detail.goalValues[g.id]} of ` : 'target '}{g.target_value}
                    </span>
                  )}
                </p>
              ))}
            </SharedBlock>

            <SharedBlock
              icon={Ruler}
              label="Latest measurement"
              shared={detail?.shared.shareMeasurements ?? true}
              empty={detail?.latestMeasurement == null}
              emptyText="Nothing recorded yet."
            >
              {detail?.latestMeasurement && (
                <p style={line}>
                  {[
                    detail.latestMeasurement.weight_kg != null && `${detail.latestMeasurement.weight_kg} kg`,
                    detail.latestMeasurement.body_fat_pct != null && `${detail.latestMeasurement.body_fat_pct}% fat`,
                    detail.latestMeasurement.waist_cm != null && `${detail.latestMeasurement.waist_cm} cm waist`,
                  ].filter(Boolean).join(' · ') || 'Recorded'}
                  <span style={muted}>
                    {' '}— {new Date(`${detail.latestMeasurement.measured_on}T00:00:00`)
                      .toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </span>
                </p>
              )}
            </SharedBlock>

            {/* Badges (0028/0093) — not a sharing category: the gym's coaches have always been able to see them. */}
            <SharedBlock icon={Trophy} label={detail?.achievements ? `Achievements · ${detail.achievements.earned} of ${detail.achievements.total}` : 'Achievements'} shared
              empty={!detail?.achievements || (detail.achievements.earned === 0 && detail.achievements.closest.length === 0)}
              emptyText={detail?.achievements ? 'None earned yet.' : 'Could not be loaded.'}>
              {detail?.achievements?.latest.map((a) => (
                <p key={a.title} style={line}>
                  {a.title}
                  <span style={muted}> · {new Date(`${a.on}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                </p>
              ))}
              {detail?.achievements?.closest.map((a) => (
                <div key={a.title} style={{ marginTop: 4 }}>
                  <p className="flex items-center justify-between" style={{ ...line, gap: 8 }}>
                    <span className="truncate">Next: {a.title}</span>
                    <span style={muted}>{a.line}</span>
                  </p>
                  <ProgressBar fraction={a.fraction} tone="action" style={{ marginTop: 4 }} />
                </div>
              ))}
            </SharedBlock>
          </>
        )}
          {/* Their squad this week (0124) — name and figures, never its code. */}
          <TraineeSquad memberId={member.id} firstName={member.name.split(' ')[0]} />
          <TraineePhotos memberId={member.id} firstName={member.name.split(' ')[0]} />
        </div>
      )}

      {sheetTab === 'training' && (
        <div data-tab-training>
          {/* The gym program they follow, and assigning one (0122). */}
          <TraineeProgram memberId={member.id} firstName={member.name.split(' ')[0]} />
          {detailLoading ? (
          <p style={{ fontSize: 12.5, padding: '12px 0', color: 'var(--color-text-muted)' }}>Loading their details…</p>
        ) : (
          <>
            {/* Their training plan (0030/0089) — not behind a sharing switch. */}
            <SharedBlock
              icon={CalendarCheck}
              label="Training plan"
              shared
              empty={!detail?.plan || detail.plan.days.length === 0}
              emptyText={detail?.plan ? 'No training days set.' : 'Could not be read just now.'}
            >
              {detail?.plan && (
                <>
                  <p style={line}>
                    {detail.plan.days.map((d) => DAY_LABELS[d]).join(' · ')}
                    {detail.plan.remindAt && <span style={muted}> — reminder {formatRemindAt(detail.plan.remindAt)}</span>}
                  </p>
                  {detail.plan.days.filter((d) => detail.plan!.routineByDay[d] || detail.plan!.coachDays.includes(d)).map((d) => {
                    const id = detail.plan!.routineByDay[d];
                    const r = id ? detail.routines.find((x) => x.id === id) : null;
                    return (
                      <div key={d} className="flex items-center" style={{ gap: 8 }}>
                        <p className="truncate min-w-0" style={muted}>
                          {DAY_LABELS[d]}: {!id ? 'any workout' : r ? r.name : 'a routine (workouts not shared)'}
                        </p>
                        {/* The member's AI coach set this day (0145). */}
                        {detail.plan!.coachDays.includes(d) && (
                          <span className="flex-none"><StatusPill tone="muted" label="Set by the coach" /></span>
                        )}
                      </div>
                    );
                  })}
                </>
              )}
            </SharedBlock>

            <SharedBlock
              icon={ListChecks}
              label="Saved routines"
              shared={detail?.shared.shareWorkouts ?? true}
              empty={(detail?.routines.length ?? 0) === 0}
              emptyText="No routines saved."
            >
              {detail?.routines.map((r) => (
                <div key={r.id} className="flex items-center" style={{ gap: 8 }}>
                  <p className="truncate min-w-0 flex-1" style={line}>
                    {r.name}<span style={muted}> — {r.exerciseCount} {r.exerciseCount === 1 ? 'exercise' : 'exercises'}</span>
                  </p>
                  {/* Whose plan this is before changing it: the AI coach's (0145), yours, or theirs. */}
                  {r.source === 'coach' && <span className="flex-none"><StatusPill tone="muted" label="Assistant" /></span>}
                  {r.source === 'trainer' && <span className="flex-none"><StatusPill tone="muted" label="Yours" /></span>}
                  <button type="button" className="flex-none" data-coach-edit={r.id}
                    onClick={() => navigate(`/trainer/members/${member.id}/routine/${r.id}`)}
                    style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-secondary)', padding: '4px 0' }}>
                    Edit
                  </button>
                </div>
              ))}
              {(
                <button type="button" data-coach-new-routine
                  onClick={() => navigate(`/trainer/members/${member.id}/routine/new`)}
                  style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-secondary)', padding: '6px 0' }}>
                  + New routine for {member.name.split(' ')[0]}
                </button>
              )}
            </SharedBlock>

            <SharedBlock
              icon={Barbell}
              label="Recent workouts"
              shared={detail?.shared.shareWorkouts ?? true}
              empty={(detail?.recentWorkouts.length ?? 0) === 0}
              emptyText="No workouts logged."
            >
              {detail?.recentWorkouts.map((w) => (
                <p key={w.id} className="truncate" style={line}>
                  {w.activity ?? 'Workout'}
                  <span style={muted}>
                    {' '}— {new Date(`${w.performed_on}T00:00:00`)
                      .toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </span>
                </p>
              ))}
            </SharedBlock>
          </>
        )}
        </div>
      )}

      {sheetTab === 'notes' && (
        <div data-tab-notes>
          {/* Notes already sent, newest first, with the member's side of it. */}
          {sentNotes && sentNotes.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-primary-300)' }}>Your notes to them</p>
          <div className="flex flex-col" style={{ marginTop: 6 }}>
            {sentNotes.map((n) => (
              <div key={n.id} className="flex items-start" style={{ gap: 10, padding: '8px 0', borderBottom: '1px solid var(--color-separator)' }}>
                <span className="flex-1 min-w-0">
                  <span className="block line-clamp-2" style={{ fontSize: 13, lineHeight: 1.45, color: 'var(--color-text-primary)' }}>
                    {n.recommendation ?? n.note}
                  </span>
                  <span className="block" style={{ fontSize: 12, marginTop: 2, color: 'var(--color-text-muted)' }}>
                    {new Date(n.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </span>
                </span>
                <StatusPill
                  label={n.done_at ? 'Done' : n.seen_at ? 'Seen' : 'Not opened'}
                  tone={n.done_at ? 'structure' : n.seen_at ? 'muted' : 'action'}
                />
              </div>
            ))}
          </div>
        </div>
      )}
          {sentNotes && sentNotes.length === 0 && !showRecommendation && (
            <p style={{ fontSize: 13, marginTop: 12, color: 'var(--color-text-muted)' }}>No notes sent yet.</p>
          )}
          <div style={{ marginTop: 16 }}>
        {!showRecommendation ? (
          <>
            <NocButton variant="action" className="w-full" icon={<ChatCircleText size={16} />}
              onClick={() => setShowRecommendation(true)}>
              Send a recommendation
            </NocButton>
            <p style={{ fontSize: 12, marginTop: 8, color: 'var(--color-text-muted)' }}>
              Delivered to the member's notifications.
            </p>
          </>
        ) : (
          <div className="flex flex-col" style={{ gap: 8 }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)' }}>Send a recommendation</p>
            {/* How it went — optional. A coach with only advice to give
                should not have to invent a session summary first. */}
            <TextArea value={sessionNote} onChange={e => setSessionNote(e.target.value)}
              rows={2} placeholder="How the session went (optional)" />
            <div className="flex items-center" style={{ gap: 8 }}>
              <TextInput value={recommendation} onChange={e => setRecommendation(e.target.value)}
                placeholder="What they should do next…" className="flex-1 min-w-0"
                onKeyDown={e => { if (e.key === 'Enter') handleSendRecommendation(); }}
              />
              <button onClick={handleSendRecommendation} disabled={sending || !recommendation.trim()}
                aria-label="Send"
                className="flex-none grid place-items-center noc-press disabled:opacity-40"
                style={{ width: 46, height: 46, borderRadius: 'var(--radius-btn)', color: 'var(--color-bg)', background: 'var(--color-secondary)' }}>
                <PaperPlaneRight size={17} weight="fill" />
              </button>
            </div>
            <p style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
              Saved to their record and sent to them. Unlike their rating of you,
              this is not anonymous — they will see it came from you.
            </p>
          </div>
        )}
      </div>
        </div>
      )}

      {/* Who to call if something happens mid-session — kept current by the
          member in Edit profile. Always shown: safety, not a log. */}
      {sheetTab === 'safety' && (
        <div data-tab-safety>
          {detailLoading ? (
          <p style={{ fontSize: 12.5, padding: '12px 0', color: 'var(--color-text-muted)' }}>Loading their details…</p>
        ) : (
          <>
            <SharedBlock icon={Lifebuoy} label="Emergency contact" shared
              empty={!detail?.emergency} emptyText="None on file — ask them to add one in Edit profile.">
              {detail?.emergency && (
                <p style={line}>
                  {detail.emergency.name}
                  {detail.emergency.relationship && <span style={muted}> · {detail.emergency.relationship}</span>}
                  {detail.emergency.phone && (
                    <> · <a href={`tel:${detail.emergency.phone.replace(/\s+/g, '')}`} style={{ color: 'var(--color-secondary)' }}>{detail.emergency.phone}</a></>
                  )}
                </p>
              )}
            </SharedBlock>
          </>
        )}
        </div>
      )}
    </div>
  );
}
