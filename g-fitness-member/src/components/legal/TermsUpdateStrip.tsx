import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LineRow, SectionHead } from '../ui/noc';
import { getGymContext } from '../../lib/gymContext';
import { behind, CURRENT, getMyAgreements } from '../../lib/api/termsAcceptance';
import { prettyVersion } from '../../lib/legalVersions';
import { getMyHouseRules, houseRulesDue } from '../../lib/api/houseRules';

/**
 * Today's "Terms updated" (0155, and 0157's house rules): shown to a member whose newest agreement is
 * older than the version the page now carries — or who has none recorded (the
 * desk created their account, or they joined before versions existed). A row
 * that opens the document, where they read it and agree; never a wall in front
 * of the app. Renders nothing when they are up to date, or when it cannot tell.
 */
export default function TermsUpdateStrip() {
  const navigate = useNavigate();
  const [due, setDue] = useState<{ path: string; title: string; meta: string }[]>([]);
  useEffect(() => {
    let alive = true;
    void (async () => {
      const [ctx, mine, rules] = await Promise.all([getGymContext(), getMyAgreements(), getMyHouseRules()]);
      if (!alive || ctx?.role !== 'member') return;
      const rows = [];
      if (mine && behind(mine.member_terms, CURRENT.member_terms)) {
        rows.push({ path: '/terms#agreement', title: 'Terms of Service', meta: `Updated ${prettyVersion(CURRENT.member_terms)} — read and agree` });
      }
      if (mine && behind(mine.member_privacy, CURRENT.member_privacy)) {
        rows.push({ path: '/privacy#agreement', title: 'Privacy Policy', meta: `Updated ${prettyVersion(CURRENT.member_privacy)} — read and agree` });
      }
      // The gym's own rules (0157), when it has some in effect that this member has not agreed to.
      if (rules && houseRulesDue(rules)) {
        rows.push({ path: '/terms#house-rules', title: 'Your gym’s house rules', meta: `Version ${rules.version} — read and agree` });
      }
      setDue(rows);
    })();
    return () => { alive = false; };
  }, []);
  if (due.length === 0) return null;
  return (
    <section>
      <SectionHead title="Updated for you to read" />
      {due.map((d, i) => (
        <LineRow key={d.path} title={d.title} meta={d.meta} last={i === due.length - 1} onClick={() => navigate(d.path)} />
      ))}
    </section>
  );
}
