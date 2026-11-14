import { useEffect, useState } from 'react';
import { UserPlus } from '@phosphor-icons/react';
import { Page, PageTitle } from '../components/ui/page';
import { LineRow, StatusPill } from '../components/ui/noc';
import { SkeletonList } from '../components/ui/Skeleton';
import Pager from '../components/ui/Pager';
import { usePaged } from '../hooks/usePaging';
import { myReferrals, referralLine, type MyReferral } from '../lib/api/referrals';
import { usePointsOn } from '../hooks/usePointsOn';

/**
 * Every friend you have invited, twenty to a page — "See all" from Invite a
 * friend, which shows the latest five (redesign, 2026-10-27).
 */
export default function ReferInvited() {
  const [list, setList] = useState<MyReferral[] | null>(null);
  const pointsOn = usePointsOn();
  useEffect(() => {
    let alive = true;
    void myReferrals().then((r) => { if (alive) setList(r); });
    return () => { alive = false; };
  }, []);
  const paged = usePaged(list ?? []);

  return (
    <Page>
      <PageTitle back fallback="/member/refer" title="Friends you invited" subtitle="Who joined through your link, and who has paid" />
      {list == null ? <SkeletonList />
        : list.length === 0 ? <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Nobody yet. Share your link to start.</p>
        : (
          <section>
            {paged.rows.map((r, i) => (
              <LineRow key={i} icon={UserPlus} tone={r.status === 'rewarded' ? 'mine' : 'info'} title={r.friendName}
                meta={referralLine(r, pointsOn)}
                action={<StatusPill label={r.status === 'rewarded' ? 'Paid' : 'Joined'} tone={r.status === 'rewarded' ? 'structure' : 'muted'} />}
                last={i === paged.rows.length - 1} />
            ))}
            <Pager page={paged.page} pages={paged.pages} total={paged.total}
              noun={paged.total === 1 ? 'friend invited' : 'friends invited'} onPage={paged.setPage} />
          </section>
        )}
    </Page>
  );
}
