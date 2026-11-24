import { useLocation } from 'react-router-dom';

/** Original illustrations are decorative; every action remains a labelled control. */
export default function MemberScene({ kind, title, description }: {
  kind: 'training' | 'community' | 'progress'; title: string; description: string;
}) {
  return <section className="member-section-scene" aria-label={title}>
    <div><h2>{title}</h2><p>{description}</p></div>
    <img src={`/images/member-${kind}.png`} alt="" aria-hidden="true" />
  </section>;
}

// eslint-disable-next-line react-refresh/only-export-components -- route metadata shared by page headers
export function useMemberArtwork(): 'training' | 'community' | 'progress' | null {
  const { pathname } = useLocation();
  const key = pathname.replace('/member/', '');
  if (!pathname.startsWith('/member/')) return null;
  if (['workouts', 'programs', 'equipment', 'trainers', 'week', 'slots', 'book-session'].includes(key)) return 'training';
  if (['rewards', 'challenges', 'season', 'squad', 'events', 'refer', 'shop'].includes(key)) return 'community';
  if (['profile', 'settings', 'progress-photos', 'achievements', 'targets', 'body', 'payment-history', 'renew-membership', 'help'].includes(key)) return 'progress';
  return null;
}
