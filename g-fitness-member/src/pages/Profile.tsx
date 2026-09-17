import { useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { logout } from '../utils/auth';
import Avatar from '../components/ui/Avatar';
import { SkeletonList } from '../components/ui/Skeleton';
import Modal from '../components/ui/Modal';
import { getCurrentMemberId } from '../services/bookingService';
import { getMemberProfile } from '../lib/api/members';
import { getCurrentMembership } from '../lib/api/memberships';
import { getGymSettings } from '../lib/api/settings';
import { readCache, writeCache } from '../lib/pageCache';
import { Page, PageTitle } from '../components/ui/page';
import { LineRow, NocButton, SectionHead, StatusPill } from '../components/ui/noc';
import { formatPhone } from '../utils/phone';

/** The flattened identity + plan this screen renders. */
interface MemberSummary {
  name: string;
  email: string;
  phone: string;
  photoUrl: string | null;
  /** From `gym_settings`, or empty — never a typed-in name. */
  gym: string;
  joinDate: string;
  planName: string;
  status: string;
}

const CACHE_KEY = 'member:profile';

/**
 * The member's own profile (Nocturne redesign).
 *
 * Four things were wrong here, and all four were invisible to the build:
 *
 *  1. The avatar was `<img src="/eya.png" alt="Eya Lorenzana">` — a hardcoded
 *     photo of one real person, shown to **every** member on their own profile.
 *  2. The stats row read Visits 24 / Streak 4 / Goals 3. All three were
 *     literals. No member ever had 24 visits because nothing counted them.
 *  3. A "Notifications" row whose only action was a toast saying
 *     "Notifications are enabled!" — it enabled nothing, and firing it repeatedly
 *     stacked six identical green banners over the page.
 *  4. A whole "Fitness Tracker" tab storing measurements and workout logs in
 *     `localStorage['phys_' + memberEmail]` — except `memberEmail` was still ''
 *     when the state initialiser ran, so every account on a device shared one
 *     key. The Progress Hub stores the same things in Postgres, per member.
 *
 * What's left is identity, membership, and links to the pages that hold the
 * real data. The home gym was typed in as "Core Fitness Mamburao"; it now comes
 * from `gym_settings`, like every other contact detail, and a missing row shows
 * no line rather than a guess. Log out uses the shared `Modal` (the hand-rolled
 * portal here was a second, differently-worded copy of You's).
 */
export default function Profile() {
  const navigate = useNavigate();
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  // Identity and plan barely move, so the skeleton-on-every-visit was pure
  // cost. See lib/pageCache.ts.
  const cached = readCache<MemberSummary>(CACHE_KEY);
  const [loading, setLoading] = useState(cached === undefined);
  const [member, setMember] = useState<MemberSummary>(cached ?? {
    name: '', email: '', phone: '', photoUrl: null, gym: '',
    joinDate: '', planName: '', status: '',
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const id = await getCurrentMemberId().catch(() => null);
        if (!id || cancelled) return;
        const [profile, membership, gym] = await Promise.all([
          getMemberProfile(id).catch(() => null),
          getCurrentMembership(id).catch(() => null),
          getGymSettings().catch(() => null),
        ]);
        if (cancelled || !profile) return;
        setMember(writeCache<MemberSummary>(CACHE_KEY, {
          name: `${profile.profile.first_name} ${profile.profile.last_name}`.trim(),
          email: profile.profile.email,
          phone: profile.profile.phone ?? '',
          photoUrl: profile.profile.photo_url ?? null,
          gym: gym?.gym_name ?? '',
          joinDate: new Date(profile.profile.created_at).toLocaleDateString('en-US', {
            year: 'numeric', month: 'long', day: 'numeric',
          }),
          planName: membership?.membership_plans?.name ?? '',
          status: membership?.status ?? '',
        }));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // `status` is a lowercase enum in Postgres. This used to compare against
  // 'Active' with a capital A, so an active membership always rendered in the
  // "something is wrong" styling.
  const isActive = member.status === 'active';

  const contactRows = [
    { label: 'Email', value: member.email },
    { label: 'Phone', value: formatPhone(member.phone) },
    { label: 'Home gym', value: member.gym },
    { label: 'Member since', value: member.joinDate },
  ].filter((r) => r.value);

  return (
    <Page>
      <PageTitle back fallback="/member/membership" title="Profile" subtitle="Who you are to the gym" />

      {loading ? (
        <SkeletonList />
      ) : (
        <>
          {/* Identity — the whole row opens Edit. */}
          <button onClick={() => navigate('/member/profile/edit')} className="w-full flex items-center text-left" style={{ gap: 14 }}>
            <Avatar name={member.name} photoUrl={member.photoUrl} size={64} />
            <span className="flex-1 min-w-0">
              <span className="block truncate" style={{ fontSize: 20, fontWeight: 500, color: 'var(--color-text-primary)' }}>
                {member.name}
              </span>
              <span className="flex flex-wrap" style={{ gap: 6, marginTop: 7 }}>
                {member.planName && <StatusPill label={member.planName} tone="structure" />}
                {member.status && (
                  <StatusPill label={isActive ? 'Active' : member.status} tone={isActive ? 'structure' : 'action'} />
                )}
              </span>
            </span>
            <span className="flex-none" style={{ fontSize: 13, color: 'var(--color-secondary)' }}>Edit</span>
          </button>

          <div className="rule" />

          <section>
            <SectionHead title="Details" />
            <div style={{ marginTop: 4 }}>
              {contactRows.map((row, i) => (
                <LineRow key={row.label} gutter={row.label} gutterWidth={104} title={row.value}
                  last={i === contactRows.length - 1} />
              ))}
            </div>
          </section>

          {/* Settings stays here, and only here: it is the account's own screen
              — password, privacy, notifications — so it belongs beside the
              identity rather than among the training pages. */}
          <section>
            <SectionHead title="Account" />
            <div style={{ marginTop: 4 }}>
              <LineRow title="Settings" meta="Password, privacy, notifications and about"
                action="Open" actionTone="structure" onClick={() => navigate('/member/settings')} last />
            </div>
          </section>

          <NocButton variant="ghost" onClick={() => setShowLogoutConfirm(true)} className="w-full">
            Log out
          </NocButton>
        </>
      )}

      <Modal
        isOpen={showLogoutConfirm}
        onClose={() => setShowLogoutConfirm(false)}
        title="Log out"
        subtitle="You will need your email and password to get back in."
        confirmLabel="Log out"
        cancelLabel="Stay signed in"
        onConfirm={async () => {
          // `logout()` clears push, the session, every per-user key and both
          // caches — the one sign-out path.
          await logout();
          navigate('/');
        }}
      >
        <span />
      </Modal>
    </Page>
  );
}
