import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MessageSquare, X, Send, ChevronRight, Users, Target, Ruler, Dumbbell, EyeOff,
  type LucideIcon,
} from 'lucide-react';
import Avatar from '../../components/ui/Avatar';
import { SkeletonList } from '../../components/ui/Skeleton';
import { panelStyle } from '../../components/ui/Card';
import { supabase } from '../../lib/supabaseClient';
import { listMembers } from '../../lib/api/members';
import { listMemberships } from '../../lib/api/memberships';
import { listAttendance } from '../../lib/api/attendance';
import { addNotification } from '../../lib/api/notifications';
import { pushOnly } from '../../lib/api/notify';
import {
  getCurrentTrainerId, getMemberDetailForTrainer, type MemberDetailForTrainer,
} from '../../services/trainerService';
import { levelLabel } from '../../lib/api/achievements';
import { errorMessage } from '../../utils/errorMessage';
import { readCache, writeCache } from '../../lib/pageCache';

/**
 * One block of a member's own data in the trainer's view.
 *
 * The three states are deliberately distinct. **Not shared** is the member's
 * choice, enforced by RLS (0032) — collapsing it into "nothing here" would
 * report an absence that isn't real and quietly misrepresent the member to
 * their coach.
 */
function SharedBlock({
  icon: Icon, label, shared, empty, emptyText, children,
}: {
  icon: LucideIcon;
  label: string;
  shared: boolean;
  empty: boolean;
  emptyText: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="p-3 rounded-xl" style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}>
      <p className="text-xs font-semibold mb-1.5 flex items-center gap-1.5"
        style={{ color: shared ? 'var(--color-text-secondary)' : 'var(--color-text-muted)' }}>
        {shared ? <Icon size={12} /> : <EyeOff size={12} />} {label}
      </p>
      {!shared ? (
        <p className="text-xs italic" style={{ color: 'var(--color-text-muted)' }}>
          Not shared — this member keeps it private.
        </p>
      ) : empty ? (
        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{emptyText}</p>
      ) : (
        <div className="space-y-0.5">{children}</div>
      )}
    </div>
  );
}

/**
 * Real gym roster.
 *
 * There is **no trainer↔member assignment table** in the schema, so a genuine
 * "my members" list has no source yet — it arrives with the classes/personal-
 * training booking model. Rather than leave this screen permanently empty, it
 * shows the real active roster (RLS `member_profiles_select_trainer` allows a
 * trainer to read it) and says plainly that assignment isn't wired yet.
 *
 * Everything the old fixture displayed — weight, BMI, goal, "On Track" progress
 * — has no table behind it and is gone. What's shown instead is real: plan,
 * membership status, experience level, and check-in history from `attendance`.
 */

interface RosterMember {
  id: string;
  name: string;
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

  /**
   * Opens the modal and fetches what this member allows a trainer to see.
   *
   * Loaded on open rather than with the roster: it is four queries per member,
   * and pre-fetching them for a hundred members to show one would be a lot of
   * reads for a modal most of them never get.
   */
  const openMember = useCallback(async (member: RosterMember) => {
    setSelectedMember(member);
    setDetail(null);
    setDetailLoading(true);
    try {
      setDetail(await getMemberDetailForTrainer(member.id));
    } catch {
      // The modal still works — name, plan, visits and the recommendation form
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
      const [rows, memberships, attendance] = await Promise.all([
        listMembers(),
        listMemberships(),
        listAttendance().catch(() => []),
      ]);

      // Newest membership per member — same rule as the admin roster.
      const newest = new Map<string, (typeof memberships)[number]>();
      for (const m of memberships) {
        const existing = newest.get(m.member_id);
        if (!existing || m.created_at > existing.created_at) newest.set(m.member_id, m);
      }

      const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const lastVisit = new Map<string, string>();
      const visits30 = new Map<string, number>();
      for (const a of attendance) {
        const prev = lastVisit.get(a.member_id);
        if (!prev || a.check_in_time > prev) lastVisit.set(a.member_id, a.check_in_time);
        if (a.check_in_time >= cutoff) visits30.set(a.member_id, (visits30.get(a.member_id) ?? 0) + 1);
      }

      setMembers(
        writeCache(CACHE_KEY, rows.map(({ profile, member }) => {
          const ms = newest.get(profile.id);
          return {
            id: profile.id,
            name: `${profile.first_name} ${profile.last_name}`,
            planName: ms?.membership_plans?.name ?? 'No plan',
            membershipStatus: ms?.status ?? 'none',
            experienceLevel: member.experience_level,
            lastVisit: lastVisit.get(profile.id) ?? null,
            visitsLast30: visits30.get(profile.id) ?? 0,
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

  const revisit = useRef(cached !== undefined);
  useEffect(() => {
    load(revisit.current);
  }, [load]);

  /** Sends a real notification the member sees in their 🔔 — the old version
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

      // Record WHO sent it. Every note used to read "New recommendation from
      // your trainer" with nothing identifying the sender, so a member training
      // with two coaches could not tell them apart — and the row itself carried
      // no sender either, so it could never be worked out later.
      const senderName = `${me.first_name ?? ''} ${me.last_name ?? ''}`.trim() || 'your trainer';

      await addNotification({
        user_id: selectedMember.id,
        type: 'recommendation',
        title: `New recommendation from ${senderName}`,
        message: recommendation.trim(),
        action_url: '/member/progress',
        metadata: { from_trainer_id: trainerId, from_trainer_name: senderName },
      });
      // The row is written; this is the alert on top of it. Not awaited — a
      // trainer should not wait on a push service to finish typing the next one.
      pushOnly({
        userId: selectedMember.id,
        type: 'system',
        title: 'New recommendation from your trainer',
        message: recommendation.trim(),
        actionUrl: '/member/progress',
      });

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

  if (loading) return <SkeletonList count={5} />;

  return (
    <div className="space-y-4 pb-4">
      <div>
        <h1 className="display text-xl text-white">Gym Members</h1>
        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
          {members.length} active {members.length === 1 ? 'member' : 'members'} · everyone at the gym, not a per-trainer roster
        </p>
      </div>

      {error && (
        <div className="rounded-xl p-3" style={{ background: 'var(--color-secondary-light)', border: '1px solid var(--color-secondary)' }}>
          <p className="text-xs" style={{ color: 'var(--color-secondary)' }}>{error}</p>
        </div>
      )}

      {notice && (
        <div className="rounded-xl p-3 flex items-start gap-2"
          style={notice.ok
            ? { background: 'var(--color-primary-light)', border: '1px solid var(--color-primary)' }
            : { background: 'var(--color-secondary-light)', border: '1px solid var(--color-secondary)' }}>
          <p className="text-xs flex-1" style={{ color: notice.ok ? 'var(--color-primary)' : 'var(--color-secondary)' }}>
            {notice.text}
          </p>
          {!notice.ok && (
            <button onClick={() => setNotice(null)} style={{ color: 'var(--color-secondary)' }}>
              <X size={12} />
            </button>
          )}
        </div>
      )}

      {/* Members List */}
      {members.length === 0 && !error ? (
        <div className="p-8 text-center" style={{ ...panelStyle, borderRadius: 'var(--radius-panel)' }}>
          <Users size={36} className="mx-auto mb-3" style={{ color: 'var(--color-border)' }} />
          <p className="text-sm font-semibold text-white">No active members yet</p>
          <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
            Members appear here once the gym approves their registration.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {members.map((member, i) => (
            <motion.div key={member.id}
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i * 0.05, 0.3) }}
              onClick={() => void openMember(member)}
              className="flex items-center gap-3 p-3.5 cursor-pointer active:scale-[0.98] transition-transform"
              style={{ ...panelStyle, borderRadius: 'var(--radius-card)' }}>
              <Avatar name={member.name} photoUrl={null} size={40} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white truncate">{member.name}</p>
                <p className="text-xs truncate" style={{ color: 'var(--color-text-muted)' }}>
                  {member.planName}
                  {member.experienceLevel ? ` · ${member.experienceLevel}` : ' · no level set'}
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                  style={{
                    background: member.membershipStatus === 'active' ? 'var(--color-primary-light)' : 'var(--color-primary-light)',
                    color: member.membershipStatus === 'active' ? 'var(--color-primary)' : 'var(--color-primary)',
                  }}>
                  {member.membershipStatus}
                </span>
                <ChevronRight size={12} style={{ color: 'var(--color-text-muted)' }} />
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Member Detail Modal */}
      <AnimatePresence>
        {selectedMember && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center pointer-events-auto"
            onClick={() => { setSelectedMember(null); setShowRecommendation(false); }}>
            <div className="absolute inset-0 bg-black/70" />
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="relative w-[90%] max-w-[340px] rounded-2xl overflow-hidden"
              style={{ background: 'var(--color-surface)', maxHeight: '75vh' }}
              onClick={e => e.stopPropagation()}>

              <div className="px-4 py-3 flex items-center justify-between border-b" style={{ borderColor: 'var(--color-border)' }}>
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-full flex items-center justify-center text-white text-sm font-bold"
                    style={{ background: 'var(--color-primary)' }}>
                    {selectedMember.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-white">{selectedMember.name}</p>
                    <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                      {selectedMember.planName} • {selectedMember.membershipStatus}
                    </p>
                  </div>
                </div>
                <button onClick={() => { setSelectedMember(null); setShowRecommendation(false); }} style={{ color: 'var(--color-text-muted)' }}>
                  <X size={18} />
                </button>
              </div>

              <div className="overflow-y-auto" style={{ maxHeight: 'calc(75vh - 60px)' }}>
                {/* Real stats only. Weight/BMI had no table behind them. */}
                <div className="px-4 py-3 grid grid-cols-3 gap-2">
                  {[
                    // Two different levels, named apart. "Says" is what the
                    // member declared about themselves and drives their class
                    // recommendations; "Earned" is what this gym has recorded.
                    // Labelling both "Level" is what made the member app's own
                    // screens look like they contradicted each other.
                    { label: 'Says', value: selectedMember.experienceLevel ?? '—' },
                    {
                      label: 'Earned',
                      value: detail?.progression ? levelLabel(detail.progression.level) : '—',
                    },
                    { label: 'Visits (30d)', value: String(selectedMember.visitsLast30) },
                  ].map(s => (
                    <div key={s.label} className="rounded-xl p-2 text-center">
                      <p className="text-xs font-bold text-white capitalize">{s.value}</p>
                      <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{s.label}</p>
                    </div>
                  ))}
                </div>

                {/* What the member has chosen to share (0032).
                    A category switched off shows "Not shared" — never an empty
                    panel, which would tell you they have no goals when they may
                    have several and kept them private. */}
                <div className="px-4 pb-3 space-y-2">
                  {detailLoading ? (
                    <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Loading their details…</p>
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
                          <p key={g.id} className="text-xs text-white truncate">
                            • {g.title}
                            {g.target_value != null && (
                              <span style={{ color: 'var(--color-text-muted)' }}> — target {g.target_value}</span>
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
                          <p className="text-xs text-white">
                            {[
                              detail.latestMeasurement.weight_kg != null && `${detail.latestMeasurement.weight_kg} kg`,
                              detail.latestMeasurement.body_fat_pct != null && `${detail.latestMeasurement.body_fat_pct}% fat`,
                              detail.latestMeasurement.waist_cm != null && `${detail.latestMeasurement.waist_cm} cm waist`,
                            ].filter(Boolean).join(' · ') || 'Recorded'}
                            <span style={{ color: 'var(--color-text-muted)' }}>
                              {' '}— {new Date(`${detail.latestMeasurement.measured_on}T00:00:00`)
                                .toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            </span>
                          </p>
                        )}
                      </SharedBlock>

                      <SharedBlock
                        icon={Dumbbell}
                        label="Recent workouts"
                        shared={detail?.shared.shareWorkouts ?? true}
                        empty={(detail?.recentWorkouts.length ?? 0) === 0}
                        emptyText="No workouts logged."
                      >
                        {detail?.recentWorkouts.map((w) => (
                          <p key={w.id} className="text-xs text-white truncate">
                            • {w.activity ?? 'Workout'}
                            <span style={{ color: 'var(--color-text-muted)' }}>
                              {' '}— {new Date(`${w.performed_on}T00:00:00`)
                                .toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            </span>
                          </p>
                        ))}
                      </SharedBlock>
                    </>
                  )}
                </div>

                <div className="px-4 py-3">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold" style={{ color: 'var(--color-text-muted)' }}>Send a recommendation</p>
                    <button onClick={() => setShowRecommendation(true)}
                      className="text-xs font-semibold px-2 py-1 rounded-full flex items-center gap-1"
                      style={{ background: 'var(--color-primary-light)', color: 'var(--color-primary)' }}>
                      <MessageSquare size={9} /> Add
                    </button>
                  </div>
                  <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                    Delivered to the member's notifications.
                  </p>
                </div>

                {showRecommendation && (
                  <div className="px-4 py-3 border-t" style={{ borderColor: 'var(--color-border)' }}>
                    <div className="flex gap-2">
                      <input value={recommendation} onChange={e => setRecommendation(e.target.value)}
                        placeholder="Add workout recommendation..."
                        className="field-input flex-1 px-3 py-2 rounded-xl text-white text-xs"
                        onKeyDown={e => { if (e.key === 'Enter') handleSendRecommendation(); }}
                      />
                      <button onClick={handleSendRecommendation} disabled={sending || !recommendation.trim()}
                        className="w-9 h-9 rounded-full flex items-center justify-center disabled:opacity-50"
                        style={{ background: 'var(--color-primary)' }}>
                        <Send size={13} className="text-white" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
