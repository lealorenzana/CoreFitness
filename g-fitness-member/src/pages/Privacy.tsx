import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Shield } from 'lucide-react';
import MobileFrame from '../components/layout/MobileFrame';

const sections: { title: string; body: string | string[] }[] = [
  {
    title: '1. Information We Collect',
    body: [
      'Personal details (name, email, phone number, address, birthdate)',
      'Membership and payment information',
      'Gym attendance and usage data',
      'Health and fitness information (optional)',
      'Communication preferences and feedback',
    ],
  },
  {
    title: '2. How We Use Your Information',
    body: [
      'Provide and manage your gym membership',
      'Process payments and maintain billing records',
      'Send important updates about your membership',
      'Improve our services and facilities',
      'Communicate promotional offers (with your consent)',
    ],
  },
  {
    title: '3. Information Sharing',
    body: [
      'Service providers who assist in our operations',
      'Payment processors for transaction handling',
      'Legal authorities when required by law',
    ],
  },
  {
    title: '4. Data Security',
    body: 'We implement industry-standard security measures including encryption, secure servers, and regular security audits.',
  },
  {
    title: '5. Your Rights',
    body: [
      'Access and review your personal information',
      'Request corrections to inaccurate data',
      'Request deletion of your data (subject to legal requirements)',
      'Opt-out of marketing communications',
      'Export your data in a portable format',
    ],
  },
  {
    title: '6. Cookies & Tracking',
    body: 'Our mobile app may use cookies to enhance your experience, analyze usage patterns, and provide personalized content.',
  },
  {
    title: '7. Data Retention',
    body: 'We retain personal information for as long as your membership is active and for a reasonable period thereafter to comply with legal obligations.',
  },
  {
    title: "8. Children's Privacy",
    body: 'Our services are not intended for individuals under 18. Minors must have parental consent to use our facilities.',
  },
  {
    title: '9. Changes to Privacy Policy',
    body: 'We may update this Privacy Policy periodically and will notify you of significant changes.',
  },
];

export default function Privacy() {
  const navigate = useNavigate();

  return (
    <MobileFrame>
      <div className="h-full flex flex-col" style={{ background: 'var(--color-bg)' }}>
        <div className="flex-1 flex flex-col px-6 py-6 overflow-hidden">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            className="flex-1 flex flex-col min-h-0">
            {/* Header */}
            <div className="flex items-center gap-3 mb-6 flex-shrink-0">
              <button onClick={() => navigate(-1)}
                className="p-1.5 rounded-lg transition-colors"
                style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}>
                <ArrowLeft size={18} />
              </button>
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg" style={{ background: 'var(--color-primary)' }}>
                  <Shield size={20} className="text-white" />
                </div>
                <h1 className="text-2xl font-bold text-white">Privacy Policy</h1>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto scrollbar-hide space-y-3"
              style={{ color: 'var(--color-text-secondary)' }}>
              <div className="rounded-xl p-4" style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}>
                <p className="text-xs mb-2" style={{ color: 'var(--color-text-muted)' }}>Last Updated: May 19, 2026</p>
                <p className="text-sm leading-relaxed">
                  Core Fitness takes your privacy seriously. This policy explains how we collect, use,
                  and protect your personal information.
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

              <div className="rounded-xl p-4 mt-2"
                style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-primary)' }}>
                <p className="text-sm leading-relaxed">
                  <span className="font-bold text-white">Privacy concerns?</span>{' '}
                  Email <a href="mailto:privacy@gfitness.com" className="font-semibold underline"
                    style={{ color: 'var(--color-secondary)' }}>privacy@gfitness.com</a> or call +63 912 345 6789.
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
