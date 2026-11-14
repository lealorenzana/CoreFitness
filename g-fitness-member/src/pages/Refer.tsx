import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShareNetwork } from '@phosphor-icons/react';
import { Page, PageTitle } from '../components/ui/page';
import { LineRow, NocButton, Panel, SectionHead, StatusPill, SeeAll } from '../components/ui/noc';
import { SkeletonList } from '../components/ui/Skeleton';
import { toast } from '../components/ui/Toast';
import { getGymApp } from '../lib/gymApp';
import { myReferralCode, myReferrals, referralLine, referralTerms, type MyReferral, type ReferralTerms } from '../lib/api/referrals';

/**
 * Invite a friend (0125).
 *
 * The link is the gym's own join page with this member's code on it. The
 * promise is worded exactly as the database keeps it: points arrive when the
 * friend's first payment is recorded at the desk — not when they sign up, and
 * not for a free plan — and at most five times a month. The figures come from
 * the gym's point rules; a rule the gym switched off is not promised. A gym that runs no points (0253)
 * promises its own desk reward instead, or nothing — never points.
 */
export default function Refer() {
  const navigate = useNavigate();
  const [code, setCode] = useState<string | null | undefined>(undefined);
  const [slug, setSlug] = useState<string | null>(null);
  const [list, setList] = useState<MyReferral[]>([]);
  const [terms, setTerms] = useState<ReferralTerms>({ pointsOn: true, referrer: null, friend: null, deskReferrer: null, deskFriend: null });

  useEffect(() => {
    let alive = true;
    void (async () => {
      const [c, app, l, t] = await Promise.all([myReferralCode(), getGymApp(), myReferrals(), referralTerms()]);
      if (!alive) return;
      setCode(c); setSlug(app?.slug ?? null); setList(l); setTerms(t);
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
  const rewardsSomething = !!(terms.referrer || terms.friend || terms.deskReferrer || terms.deskFriend);

  return (
    <Page>
      <PageTitle back fallback="/member/rewards" title="Invite a friend"
        subtitle={rewardsSomething ? 'Train together — you both earn when they join' : 'Bring a friend to train with you'} />

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
          {terms.pointsOn ? (<>
            Your friend joins the gym through your link. When the front desk records their first payment,
            {terms.referrer ? ` you get ${terms.referrer} points` : ' you are thanked'}
            {terms.friend ? ` and they get ${terms.friend} welcome points` : ''}. Signing up on its own, or a free plan, does not count —
            and up to five friends a month earn you points.
          </>) : terms.deskReferrer || terms.deskFriend ? (<>
            Your friend joins the gym through your link. When the front desk records their first payment,
            {terms.deskReferrer ? ` you get ${terms.deskReferrer}` : ' you are thanked'}
            {terms.deskFriend ? ` and they get ${terms.deskFriend}` : ''} — ask for it at the front desk. Signing up on its own,
            or a free plan, does not count{terms.deskReferrer ? ', and up to five friends a month earn you a reward' : ''}.
          </>) : (<>
            Your friend joins the gym through your link, and the gym sees that you brought them. Share it with anyone
            you would like to train with.
          </>)}
        </p>
      </section>

      <section>
        <SectionHead title="Your invitations" meta={list.length ? `${paid} joined and paid` : undefined} />
        {list.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Nobody yet. Share your link to start.</p>
        ) : list.slice(0, 5).map((r, i, shown) => (
          <LineRow key={i} title={r.friendName} last={i === shown.length - 1}
            meta={referralLine(r, terms.pointsOn)}
            action={<StatusPill label={r.status === 'rewarded' ? 'Paid' : 'Joined'} tone={r.status === 'rewarded' ? 'structure' : 'muted'} />} />
        ))}
        {list.length > 5 && <SeeAll label="See all friends you invited" count={list.length} onClick={() => navigate('/member/refer/invited')} />}
      </section>
    </Page>
  );
}
