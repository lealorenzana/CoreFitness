import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { SectionHead } from '../ui/noc';
import { ArrowUpRight, FileText, ShieldCheck, House } from '@phosphor-icons/react';
import './update-papers.css';
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
        rows.push({ path: '/terms', title: 'Terms of Service', meta: `Updated ${prettyVersion(CURRENT.member_terms)} — read and agree` });
      }
      if (mine && behind(mine.member_privacy, CURRENT.member_privacy)) {
        rows.push({ path: '/privacy', title: 'Privacy Policy', meta: `Updated ${prettyVersion(CURRENT.member_privacy)} — read and agree` });
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
    <section className="today-update-papers">
      <SectionHead title="Updated for you to read" />
      <div className="today-paper-shelf" style={{ gridTemplateColumns: `repeat(${Math.min(2, due.length)}, minmax(0, 220px))` }}>
        {due.map((d, i) => {
          const Icon = d.path.startsWith('/privacy') ? ShieldCheck : d.path.includes('house-rules') ? House : FileText;
          return <button type="button" key={d.path} className="today-paper-card" onClick={() => navigate(d.path)}
            aria-label={`${d.title}. ${d.meta}`} style={{ '--paper-tilt': `${i % 2 === 0 ? -3 : 3}deg` } as React.CSSProperties}>
            <span className="today-paper-art">
              <img src="/images/member-update-paper.svg" alt="" aria-hidden="true" />
              <span className="today-paper-content"><Icon size={26} weight="duotone" aria-hidden="true" /><strong>{d.title}</strong><small>{d.meta.split(' — ')[0]}</small></span>
              <span className="today-paper-new">New</span>
            </span>
            <span className="today-paper-action">Read and agree<ArrowUpRight size={14} aria-hidden="true" /></span>
          </button>;
        })}
      </div>
    </section>
  );
}

