import { useEffect, useState } from 'react';
import { ShareNetwork } from '@phosphor-icons/react';
import { Page, PageTitle } from '../components/ui/page';
import { LineRow, NocButton, Panel, SectionHead, StatusPill } from '../components/ui/noc';
import { SkeletonList } from '../components/ui/Skeleton';
import { toast } from '../components/ui/Toast';
import { getGymApp } from '../lib/gymApp';
import { myReferralCode, myReferrals, referralRewards, type MyReferral } from '../lib/api/referrals';

/**
 * Invite a friend (0125).
 *
 * The link is the gym's own join page with this member's code on it. The
 * promise is worded exactly as the database keeps it: points arrive when the
 * friend's first payment is recorded at the desk — not when they sign up, and
 * not for a free plan — and at most five times a month. The figures come from
 * the gym's point rules; a rule the gym switched off is not promised.
 */
export default function Refer() {
  const [code, setCode] = useState<string | null | undefined>(undefined);
  const [slug, setSlug] = useState<string | null>(null);
  const [list, setList] = useState<MyReferral[]>([]);
  const [pts, setPts] = useState<{ referrer: number | null; friend: number | null }>({ referrer: null, friend: null });

  useEffect(() => {
    let alive = true;
    void (async () => {
      const [c, app, l, p] = await Promise.all([myReferralCode(), getGymApp(), myReferrals(), referralRewards()]);
      if (!alive) return;
      setCode(c); setSlug(app?.slug ?? null); setList(l); setPts(p);
    })();
    return () => { alive = false; };
  }, []);

  if (code === undefined) return <Page><PageTitle back title="Invite a friend" /><SkeletonList /></Page>;
  if (code === null) {
    return (
      <Page>
        <PageTitle back title="Invite a friend" />
        <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Invitations are not switched on at your gym yet.</p>
      </Page>
    );
  }

  const link = slug ? `${window.location.origin}/join/${slug}?ref=${code}` : null;
  const share = async () => {
    const text = `Train with me! Join my gym with my code ${code}${link ? `: ${link}` : ''}`;
    try {
      if (navigator.share) { await navigator.share({ text }); return; }
      await navigator.clipboard.writeText(link ?? code);
      toast.success('Link copied — paste it to your friend.');
    } catch {
      toast.info(`Your code is ${code}`);
    }
  };
  const paid = list.filter((r) => r.status === 'rewarded').length;

  return (
    <Page>
      <PageTitle back fallback="/member/rewards" title="Invite a friend"
        subtitle="Train together — you both earn when they join" />

      <Panel>
        <p style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Your code</p>
        <p className="tabular-nums" style={{ fontSize: 30, fontWeight: 800, letterSpacing: '0.2em', marginTop: 2, color: 'var(--color-text-primary)' }}>{code}</p>
        {link && <p style={{ fontSize: 12, marginTop: 4, wordBreak: 'break-all', color: 'var(--color-text-secondary)' }}>{link}</p>}
        <NocButton variant="action" className="w-full" style={{ marginTop: 12 }} icon={<ShareNetwork size={16} />}
          onClick={() => void share()}>
          Share my link
        </NocButton>
      </Panel>

      <section>
        <SectionHead title="How it works" />
        <p style={{ fontSize: 13.5, lineHeight: 1.6, color: 'var(--color-text-secondary)' }}>
          Your friend joins the gym through your link. When the front desk records their first payment,
          {pts.referrer ? ` you get ${pts.referrer} points` : ' you are thanked'}
          {pts.friend ? ` and they get ${pts.friend} welcome points` : ''}. Signing up on its own, or a free plan, does not count —
          and up to five friends a month earn you points.
        </p>
      </section>

      <section>
        <SectionHead title="Your invitations" meta={list.length ? `${paid} joined and paid` : undefined} />
        {list.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Nobody yet. Share your link to start.</p>
        ) : list.map((r, i) => (
          <LineRow key={i} title={r.friendName} last={i === list.length - 1}
            meta={r.status === 'rewarded'
              ? (r.points > 0 ? `Paid — ${r.points} points for you` : 'Paid — past this month’s five')
              : 'Joined — waiting for their first payment'}
            action={<StatusPill label={r.status === 'rewarded' ? 'Paid' : 'Joined'} tone={r.status === 'rewarded' ? 'structure' : 'muted'} />} />
        ))}
      </section>
    </Page>
  );
}
