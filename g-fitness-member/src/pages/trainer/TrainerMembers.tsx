import { useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import { leaveFeedback, listFeedbackByTrainer, type TrainerFeedbackRow } from '../../lib/api/trainerFeedback';
import { Barbell, ChatCircleText, EyeSlash, PaperPlaneRight, Ruler, Target, X, type Icon } from '@phosphor-icons/react';
import Avatar from '../../components/ui/Avatar';
import { SkeletonList } from '../../components/ui/Skeleton';
import GlassSheet from '../../components/ui/GlassSheet';
import { TextArea, TextInput } from '../../components/ui/Field';
import { InlineStat, LineRow, NocButton, StatusPill } from '../../components/ui/noc';
import { supabase } from '../../lib/supabaseClient';
import { listMemberships } from '../../lib/api/memberships';
import { listMyTrainerMembers } from '../../lib/api/trainerRoster';
import {
  getCurrentTrainerId, getMemberDetailForTrainer, type MemberDetailForTrainer,
} from '../../services/trainerService';
import { levelLabel } from '../../lib/api/achievements';
import { errorMessage } from '../../utils/errorMessage';
import { readCache, writeCache } from '../../lib/pageCache';
import { Page } from '../../components/ui/page';

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

/**
 * The trainer's own roster (0082): members who book this coach's classes or
 * sessions, read through `my_trainer_members`.
 *
 * Everything the old fixture displayed — weight, BMI, goal, "On Track" progress
 * — had no table behind it and is gone. What's shown is real: plan, membership
 * status, experience level, and check-in history.
 *
 * Drawn in the member app's Nocturne style (2026-09-18): rows on the page, not
 * a card per row, and the member's detail in a glass sheet rather than a
 * `fixed` modal inside the scroller.
 */

interface RosterMember {
  id: string;
  name: string;
  /** `profiles.photo_url` through the roster view, or null — Avatar falls back to initials. */
  photoUrl: string | null;
  planName: string;
  membershipStatus: string;
  experienceLevel: string | null;
  lastVisit: string | null;
  visitsLast30: number;
}

const CACHE_KEY = 'trainer:roster';

export default function TrainerMembers() {
  // See lib/pageCache.ts — the roster is three queries and a join, and it is a
  // bottom-nav tab a trainer bounces in and out of all day.
  const cached = readCache<RosterMember[]>(CACHE_KEY);
  const [members, setMembers] = useState<RosterMember[]>(cached ?? []);
  const [loading, setLoading] = useState(cached === undefined);
  const [error, setError] = useState('');
  const [selectedMember, setSelectedMember] = useState<RosterMember | null>(null);
  const [detail, setDetail] = useState<MemberDetailForTrainer | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  /** Notes this coach has sent the open member, with whether they were seen / done (0088). */
  const [sentNotes, setSentNotes] = useState<TrainerFeedbackRow[] | null>(null);

  /**
   * Opens the sheet and fetches what this member allows a trainer to see.
   *
   * Loaded on open rather than with the roster: it is four queries per member,
   * and pre-fetching them for a hundred members to show one would be a lot of
   * reads for a sheet most of them never get.
   */
  const openMember = useCallback(async (member: RosterMember) => {
    setSelectedMember(member);
    setDetail(null);
    setDetailLoading(true);
    setSentNotes(null);
    // The coach's own notes to this member — the other half of the loop the
    // member's Coach tab closes by marking them seen and done.
    void (async () => {
      try {
        const me = await getCurrentTrainerId();
        if (!me) return;
        const rows = await listFeedbackByTrainer(me);
        setSentNotes(rows.filter((r) => r.member_id === member.id).slice(0, 5));
      } catch {
        setSentNotes([]);
      }
    })();
    try {
      setDetail(await getMemberDetailForTrainer(member.id));
    } catch {
      // The sheet still works — name, plan, visits and the recommendation form
      // are all from the roster load. Only the shared panels are missing.
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }, []);
  const [showRecommendation, setShowRecommendation] = useState(false);
  const [recommendation, setRecommendation] = useState('');
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<{ text: string; ok: boolean } | null>(null);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      /*
        One narrowed read, not three unfiltered ones.

        This used to call `listMembers()` — every member in the gym — and then
        join `listMemberships()` and `listAttendance()` to it on the phone.
        0082 narrowed all three at the database, and `my_trainer_members` does
        the counting in SQL where the rows already are.

        `memberships` stays, for the plan label beside each name. It is narrowed
        by the same rule now, so it is a label on a list the database chose —
        not the thing choosing the list.
      */
      const [roster, memberships] = await Promise.all([
        listMyTrainerMembers(),
        listMemberships().catch(() => []),
      ]);

      // Newest membership per member — same rule as the admin roster.
      const newest = new Map<string, (typeof memberships)[number]>();
      for (const m of memberships) {
        const existing = newest.get(m.member_id);
        if (!existing || m.created_at > existing.created_at) newest.set(m.member_id, m);
      }

      setMembers(
        writeCache(CACHE_KEY, roster.map((r) => {
          const ms = newest.get(r.member_id);
          return {
            id: r.member_id,
            name: r.name,
            photoUrl: r.photo_url ?? null,
            planName: ms?.membership_plans?.name ?? 'No plan',
            membershipStatus: ms?.status ?? 'none',
            experienceLevel: r.experience_level,
            lastVisit: r.last_visit,
            visitsLast30: r.visits_last_30,
          };
        }))
      );
    } catch (err) {
      console.error('Member roster load failed:', err);
      // A failed refresh over a roster already on screen stays quiet.
      if (!quiet) setError(errorMessage(err, 'Failed to load members'));
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

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

  const revisit = useRef(cached !== undefined);
  useEffect(() => {
    load(revisit.current);
  }, [load]);

  /** Sends a real notification the member sees in their bell — the old version
   *  kept recommendations in component state, so they vanished on refresh and
   *  the member never received anything. */
  const handleSendRecommendation = async () => {
    if (!recommendation.trim() || !selectedMember || sending) return;
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
        .from('profiles')
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
        memberId: selectedMember.id,
        note: sessionNote.trim() || recommendation.trim(),
        recommendation: sessionNote.trim() ? recommendation.trim() : undefined,
      });

      setSessionNote('');
      setRecommendation('');
      setShowRecommendation(false);
      setNotice({ text: `Recommendation sent to ${selectedMember.name}`, ok: true });
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

  const closeMember = () => { setSelectedMember(null); setShowRecommendation(false); };
  const line = { fontSize: 13, color: 'var(--color-text-primary)' } as const;
  const muted = { color: 'var(--color-text-muted)' } as const;

  if (loading) return <SkeletonList count={5} />;

  return (
    <Page>
      {/* The title is the shell's header now. This line describes the roster
          0082 made real — members who train with this coach, not the gym. */}
      <p style={{ fontSize: 12.5, color: 'var(--color-text-muted)' }}>
        {members.length === 0
          ? 'Members appear here once they book a class you teach or a session with you'
          : `${members.length} ${members.length === 1 ? 'member' : 'members'} who train with you`}
      </p>

      {error && <p style={{ fontSize: 12.5, color: 'var(--color-secondary)' }}>{error}</p>}

      {notice && (
        <div className="flex items-start" style={{
          gap: 10, padding: '10px 12px', borderRadius: 10,
          border: `1px solid ${notice.ok ? 'var(--color-primary)' : 'var(--color-secondary)'}`,
          background: notice.ok
            ? 'color-mix(in srgb, var(--color-primary) 12%, transparent)'
            : 'color-mix(in srgb, var(--color-secondary) 10%, transparent)',
        }}>
          <p className="flex-1" style={{ fontSize: 12.5, color: notice.ok ? 'var(--color-primary-300)' : 'var(--color-secondary)' }}>
            {notice.text}
          </p>
          {!notice.ok && (
            <button onClick={() => setNotice(null)} aria-label="Dismiss" style={{ color: 'var(--color-secondary)' }}>
              <X size={13} />
            </button>
          )}
        </div>
      )}

      {members.length === 0 && !error ? (
        <div className="text-center" style={{ padding: '36px 12px' }}>
          <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text-primary)' }}>No active members yet</p>
          <p style={{ fontSize: 12.5, marginTop: 4, lineHeight: 1.5, color: 'var(--color-text-muted)' }}>
            Members appear here once the gym approves their registration.
          </p>
        </div>
      ) : (
        <div className="noc-rows">
          {members.map((member, i) => (
            <LineRow
              key={member.id}
              gutter={<Avatar name={member.name} photoUrl={member.photoUrl ?? null} size={38} />}
              gutterWidth={38}
              title={member.name}
              meta={`${member.planName}${member.experienceLevel ? ` · ${member.experienceLevel}` : ' · no level set'} · ${member.visitsLast30} ${member.visitsLast30 === 1 ? 'visit' : 'visits'} in 30 days`}
              action={<StatusPill label={member.membershipStatus} tone={member.membershipStatus === 'active' ? 'structure' : 'muted'} />}
              onClick={() => void openMember(member)}
              last={i === members.length - 1}
            />
          ))}
        </div>
      )}

      <GlassSheet
        open={selectedMember !== null}
        onClose={closeMember}
        leading={selectedMember && <Avatar name={selectedMember.name} photoUrl={selectedMember.photoUrl ?? null} size={42} />}
        title={selectedMember?.name ?? ''}
        subtitle={selectedMember ? `${selectedMember.planName} · ${selectedMember.membershipStatus}` : undefined}
      >
        {selectedMember && (
          <>
            {/* Real stats only. Two different levels, named apart: "Says" is
                what the member declared and drives their class recommendations;
                "Earned" is what this gym has recorded. Labelling both "Level"
                made the member app's own screens contradict each other. */}
            <div className="grid grid-cols-3" style={{ gap: 12 }}>
              <InlineStat value={<span className="capitalize" style={{ fontSize: 17 }}>{selectedMember.experienceLevel ?? '—'}</span>} label="Says" />
              <InlineStat value={<span style={{ fontSize: 17 }}>{detail?.progression ? levelLabel(detail.progression.level) : '—'}</span>} label="Earned" />
              <InlineStat value={<span style={{ fontSize: 17 }}>{selectedMember.visitsLast30}</span>} label="Visits (30d)" />
            </div>

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

            {/* What the member has chosen to share (0032). A category switched
                off shows "Not shared" — never an empty block, which would say
                they have no goals when they may have kept them private. */}
            <div style={{ marginTop: 10 }}>
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
                        {g.target_value != null && <span style={muted}> — target {g.target_value}</span>}
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
          </>
        )}
      </GlassSheet>
    </Page>
  );
}
