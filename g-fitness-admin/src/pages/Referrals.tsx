import ReferralsSection from '../components/ReferralsSection';

/**
 * People → Referrals (2026-11-14): who brought whom, on its own page so it is there whether or not the gym runs
 * points (Rewards hides with Points off). With Points off the desk hands over the gym's desk rewards here (0253).
 * Open to the front desk too — they are the ones who give the reward.
 */
export default function Referrals() {
  return (
    <div className="att rd-fit flex flex-col min-h-0" data-referrals-page style={{ height: '100%' }}>
      <div className="a-head">
        <div className="min-w-0"><h1>Referrals</h1><p>Members who brought a friend, and what each one earned</p></div>
      </div>
      <div className="flex-1 min-h-0 flex flex-col"><ReferralsSection /></div>
    </div>
  );
}
