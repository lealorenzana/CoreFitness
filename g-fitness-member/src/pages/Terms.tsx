import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, FileText } from 'lucide-react';
import MobileFrame from '../components/layout/MobileFrame';

const sections: { title: string; body: string | string[] }[] = [
  { title: '1. Membership Agreement',  body: 'Your membership grants you access to our facilities during operating hours. Membership fees are non-refundable and must be paid on time to maintain active status.' },
  { title: '2. Facility Usage',        body: ['Proper gym attire and footwear required', 'Return equipment to designated areas after use', 'Respect other members and maintain cleanliness', 'No photography or video without permission'] },
  { title: '3. Health & Safety',        body: 'Members use facilities at their own risk. Consult a healthcare provider before starting any program. Report injuries or equipment issues immediately.' },
  { title: '4. Cancellation Policy',    body: 'Cancellations must be submitted in writing at least 30 days before the next billing cycle. Early termination fees may apply.' },
  { title: '5. Personal Training',      body: 'PT sessions must be scheduled in advance. Cancellations require 24-hour notice or the session is forfeited.' },
  { title: '6. Liability Waiver',       body: 'Physical exercise involves inherent risks. Core Fitness is not liable for injuries, losses, or damages incurred during use.' },
  { title: '7. Code of Conduct',        body: 'Zero-tolerance policy for harassment or inappropriate behavior. Violations may result in immediate termination without refund.' },
  { title: '8. Changes to Terms',       body: 'We may modify these terms at any time. Members will be notified of significant changes.' },
];

export default function Terms() {
  const navigate = useNavigate();
  return (
    <MobileFrame>
      <div className="h-full flex flex-col" style={{ background: 'var(--color-bg)' }}>
        <div className="flex-1 flex flex-col px-6 py-6 overflow-hidden">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            className="flex-1 flex flex-col min-h-0">
            <div className="flex items-center gap-3 mb-6 flex-shrink-0">
              <button onClick={() => navigate(-1)}
                className="p-1.5 rounded-lg"
                style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}>
                <ArrowLeft size={18} />
              </button>
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg" style={{ background: 'var(--color-secondary)' }}>
                  <FileText size={20} className="text-black" />
                </div>
                <h1 className="text-2xl font-bold text-white">Terms of Service</h1>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto scrollbar-hide space-y-3" style={{ color: 'var(--color-text-secondary)' }}>
              <div className="rounded-xl p-4" style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}>
                <p className="text-xs mb-2" style={{ color: 'var(--color-text-muted)' }}>Last Updated: May 19, 2026</p>
                <p className="text-sm leading-relaxed">
                  By accessing or using our facilities and services, you agree to be bound by these
                  Terms of Service.
                </p>
              </div>

              {sections.map((s) => (
                <div key={s.title} className="rounded-xl p-4"
                  style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}>
                  <h2 className="text-base font-bold text-white mb-2 flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--color-secondary)' }} />
                    {s.title}
                  </h2>
                  {Array.isArray(s.body) ? (
                    <ul className="text-sm space-y-1.5">
                      {s.body.map((item) => (
                        <li key={item} className="flex items-start gap-2">
                          <span className="mt-1" style={{ color: 'var(--color-secondary)' }}>•</span>
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm leading-relaxed">{s.body}</p>
                  )}
                </div>
              ))}

              <div className="rounded-xl p-4" style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-secondary)' }}>
                <p className="text-sm leading-relaxed">
                  <span className="font-bold text-white">Questions?</span>{' '}
                  Email <a href="mailto:support@gfitness.com" className="font-semibold underline"
                    style={{ color: 'var(--color-secondary)' }}>support@gfitness.com</a> or visit the front desk.
                </p>
              </div>
              <div className="h-6" />
            </div>
          </motion.div>
        </div>
      </div>
    </MobileFrame>
  );
}
