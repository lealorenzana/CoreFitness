import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Shield } from 'lucide-react';
import MobileFrame from '../components/layout/MobileFrame';

export default function Privacy() {
  const navigate = useNavigate();

  return (
    <MobileFrame>
      <div className="h-full bg-gradient-to-b from-dark-bg via-dark-lighter to-dark-bg flex flex-col">
        <div className="flex-1 flex flex-col px-6 py-6 overflow-hidden">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex-1 flex flex-col min-h-0"
          >
            {/* Header */}
            <div className="flex items-center gap-4 mb-6 flex-shrink-0">
              <button
                onClick={() => navigate(-1)}
                className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors group"
              >
                <div className="p-1.5 rounded-lg bg-dark-lighter border border-dark-border group-hover:border-primary-start transition-all">
                  <ArrowLeft size={18} />
                </div>
              </button>
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-gradient-to-br from-green-500 to-emerald-500">
                  <Shield size={20} className="text-white" />
                </div>
                <h1 className="text-2xl font-orbitron font-bold text-gradient">Privacy Policy</h1>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto scrollbar-hide space-y-6 text-gray-300">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="bg-dark-lighter border border-dark-border rounded-xl p-5"
              >
                <p className="text-sm text-gray-400 mb-4">Last Updated: May 19, 2026</p>
                <p className="text-sm leading-relaxed">
                  At Core Fitness, we take your privacy seriously. This Privacy Policy explains how we collect, use, and protect your personal information.
                </p>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="space-y-4"
              >
                <div className="bg-dark-lighter border border-dark-border rounded-xl p-5">
                  <h2 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-gradient-to-r from-green-500 to-emerald-500"></div>
                    1. Information We Collect
                  </h2>
                  <p className="text-sm leading-relaxed mb-3">
                    We collect information that you provide directly to us, including:
                  </p>
                  <ul className="text-sm space-y-2 ml-4">
                    <li className="flex items-start gap-2">
                      <span className="text-primary-start mt-1">•</span>
                      <span>Personal details (name, email, phone number, address, birthdate)</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-primary-start mt-1">•</span>
                      <span>Membership and payment information</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-primary-start mt-1">•</span>
                      <span>Gym attendance and usage data</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-primary-start mt-1">•</span>
                      <span>Health and fitness information (optional)</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-primary-start mt-1">•</span>
                      <span>Communication preferences and feedback</span>
                    </li>
                  </ul>
                </div>

                <div className="bg-dark-lighter border border-dark-border rounded-xl p-5">
                  <h2 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-gradient-to-r from-green-500 to-emerald-500"></div>
                    2. How We Use Your Information
                  </h2>
                  <p className="text-sm leading-relaxed mb-3">
                    We use the information we collect to:
                  </p>
                  <ul className="text-sm space-y-2 ml-4">
                    <li className="flex items-start gap-2">
                      <span className="text-primary-start mt-1">•</span>
                      <span>Provide and manage your gym membership</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-primary-start mt-1">•</span>
                      <span>Process payments and maintain billing records</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-primary-start mt-1">•</span>
                      <span>Send important updates about your membership</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-primary-start mt-1">•</span>
                      <span>Improve our services and facilities</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-primary-start mt-1">•</span>
                      <span>Communicate promotional offers (with your consent)</span>
                    </li>
                  </ul>
                </div>

                <div className="bg-dark-lighter border border-dark-border rounded-xl p-5">
                  <h2 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-gradient-to-r from-green-500 to-emerald-500"></div>
                    3. Information Sharing
                  </h2>
                  <p className="text-sm leading-relaxed">
                    We do not sell your personal information. We may share your information only with:
                  </p>
                  <ul className="text-sm space-y-2 ml-4 mt-3">
                    <li className="flex items-start gap-2">
                      <span className="text-primary-start mt-1">•</span>
                      <span>Service providers who assist in our operations</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-primary-start mt-1">•</span>
                      <span>Payment processors for transaction handling</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-primary-start mt-1">•</span>
                      <span>Legal authorities when required by law</span>
                    </li>
                  </ul>
                </div>

                <div className="bg-dark-lighter border border-dark-border rounded-xl p-5">
                  <h2 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-gradient-to-r from-green-500 to-emerald-500"></div>
                    4. Data Security
                  </h2>
                  <p className="text-sm leading-relaxed">
                    We implement industry-standard security measures to protect your personal information from unauthorized access, disclosure, or destruction. This includes encryption, secure servers, and regular security audits.
                  </p>
                </div>

                <div className="bg-dark-lighter border border-dark-border rounded-xl p-5">
                  <h2 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-gradient-to-r from-green-500 to-emerald-500"></div>
                    5. Your Rights
                  </h2>
                  <p className="text-sm leading-relaxed mb-3">
                    You have the right to:
                  </p>
                  <ul className="text-sm space-y-2 ml-4">
                    <li className="flex items-start gap-2">
                      <span className="text-primary-start mt-1">•</span>
                      <span>Access and review your personal information</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-primary-start mt-1">•</span>
                      <span>Request corrections to inaccurate data</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-primary-start mt-1">•</span>
                      <span>Request deletion of your data (subject to legal requirements)</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-primary-start mt-1">•</span>
                      <span>Opt-out of marketing communications</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-primary-start mt-1">•</span>
                      <span>Export your data in a portable format</span>
                    </li>
                  </ul>
                </div>

                <div className="bg-dark-lighter border border-dark-border rounded-xl p-5">
                  <h2 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-gradient-to-r from-green-500 to-emerald-500"></div>
                    6. Cookies & Tracking
                  </h2>
                  <p className="text-sm leading-relaxed">
                    Our mobile app may use cookies and similar technologies to enhance your experience, analyze usage patterns, and provide personalized content. You can manage cookie preferences in your device settings.
                  </p>
                </div>

                <div className="bg-dark-lighter border border-dark-border rounded-xl p-5">
                  <h2 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-gradient-to-r from-green-500 to-emerald-500"></div>
                    7. Data Retention
                  </h2>
                  <p className="text-sm leading-relaxed">
                    We retain your personal information for as long as your membership is active and for a reasonable period thereafter to comply with legal obligations and resolve disputes.
                  </p>
                </div>

                <div className="bg-dark-lighter border border-dark-border rounded-xl p-5">
                  <h2 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-gradient-to-r from-green-500 to-emerald-500"></div>
                    8. Children's Privacy
                  </h2>
                  <p className="text-sm leading-relaxed">
                    Our services are not intended for individuals under 18 years of age. We do not knowingly collect personal information from children. Minors must have parental consent to use our facilities.
                  </p>
                </div>

                <div className="bg-dark-lighter border border-dark-border rounded-xl p-5">
                  <h2 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-gradient-to-r from-green-500 to-emerald-500"></div>
                    9. Changes to Privacy Policy
                  </h2>
                  <p className="text-sm leading-relaxed">
                    We may update this Privacy Policy periodically. We will notify you of significant changes via email or in-app notification. Continued use of our services after changes constitutes acceptance.
                  </p>
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="bg-gradient-to-br from-green-500/10 to-emerald-500/5 border border-green-500/30 rounded-xl p-5"
              >
                <p className="text-sm leading-relaxed">
                  <span className="font-bold text-white">Privacy Concerns?</span> Contact our Data Protection Officer at{' '}
                  <a href="mailto:privacy@gfitness.com" className="text-primary-start font-semibold hover:underline">
                    privacy@gfitness.com
                  </a>{' '}
                  or call us at +63 912 345 6789.
                </p>
              </motion.div>

              <div className="h-6"></div>
            </div>
          </motion.div>
        </div>
      </div>
    </MobileFrame>
  );
}
