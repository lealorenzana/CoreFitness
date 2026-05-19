import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, FileText } from 'lucide-react';
import MobileFrame from '../components/layout/MobileFrame';

export default function Terms() {
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
                <div className="p-2 rounded-lg bg-gradient-to-br from-primary-start to-primary-end">
                  <FileText size={20} className="text-white" />
                </div>
                <h1 className="text-2xl font-orbitron font-bold text-gradient">Terms of Service</h1>
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
                  Welcome to Core Fitness. By accessing or using our gym facilities and services, you agree to be bound by these Terms of Service.
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
                    <div className="w-2 h-2 rounded-full bg-gradient-to-r from-primary-start to-primary-end"></div>
                    1. Membership Agreement
                  </h2>
                  <p className="text-sm leading-relaxed">
                    Your membership grants you access to our facilities during operating hours. Membership fees are non-refundable and must be paid on time to maintain active status.
                  </p>
                </div>

                <div className="bg-dark-lighter border border-dark-border rounded-xl p-5">
                  <h2 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-gradient-to-r from-primary-start to-primary-end"></div>
                    2. Facility Usage
                  </h2>
                  <p className="text-sm leading-relaxed mb-3">
                    Members must follow all gym rules and regulations. This includes:
                  </p>
                  <ul className="text-sm space-y-2 ml-4">
                    <li className="flex items-start gap-2">
                      <span className="text-primary-start mt-1">•</span>
                      <span>Proper gym attire and footwear required at all times</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-primary-start mt-1">•</span>
                      <span>Equipment must be returned to designated areas after use</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-primary-start mt-1">•</span>
                      <span>Respect other members and maintain cleanliness</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-primary-start mt-1">•</span>
                      <span>No photography or video recording without permission</span>
                    </li>
                  </ul>
                </div>

                <div className="bg-dark-lighter border border-dark-border rounded-xl p-5">
                  <h2 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-gradient-to-r from-primary-start to-primary-end"></div>
                    3. Health & Safety
                  </h2>
                  <p className="text-sm leading-relaxed">
                    Members use gym facilities at their own risk. We recommend consulting with a healthcare provider before starting any fitness program. Members must report any injuries or equipment malfunctions immediately.
                  </p>
                </div>

                <div className="bg-dark-lighter border border-dark-border rounded-xl p-5">
                  <h2 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-gradient-to-r from-primary-start to-primary-end"></div>
                    4. Cancellation Policy
                  </h2>
                  <p className="text-sm leading-relaxed">
                    Membership cancellations must be submitted in writing at least 30 days before the next billing cycle. Early termination fees may apply based on your membership type.
                  </p>
                </div>

                <div className="bg-dark-lighter border border-dark-border rounded-xl p-5">
                  <h2 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-gradient-to-r from-primary-start to-primary-end"></div>
                    5. Personal Training
                  </h2>
                  <p className="text-sm leading-relaxed">
                    Personal training sessions must be scheduled in advance. Cancellations require 24-hour notice, or the session will be forfeited.
                  </p>
                </div>

                <div className="bg-dark-lighter border border-dark-border rounded-xl p-5">
                  <h2 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-gradient-to-r from-primary-start to-primary-end"></div>
                    6. Liability Waiver
                  </h2>
                  <p className="text-sm leading-relaxed">
                    By using our facilities, you acknowledge that physical exercise involves inherent risks. Core Fitness is not liable for any injuries, losses, or damages incurred during your use of our facilities.
                  </p>
                </div>

                <div className="bg-dark-lighter border border-dark-border rounded-xl p-5">
                  <h2 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-gradient-to-r from-primary-start to-primary-end"></div>
                    7. Code of Conduct
                  </h2>
                  <p className="text-sm leading-relaxed">
                    We maintain a zero-tolerance policy for harassment, discrimination, or inappropriate behavior. Violations may result in immediate membership termination without refund.
                  </p>
                </div>

                <div className="bg-dark-lighter border border-dark-border rounded-xl p-5">
                  <h2 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-gradient-to-r from-primary-start to-primary-end"></div>
                    8. Changes to Terms
                  </h2>
                  <p className="text-sm leading-relaxed">
                    We reserve the right to modify these terms at any time. Members will be notified of significant changes via email or in-app notifications.
                  </p>
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="bg-gradient-to-br from-primary-start/10 to-primary-end/5 border border-primary-start/30 rounded-xl p-5"
              >
                <p className="text-sm leading-relaxed">
                  <span className="font-bold text-white">Questions?</span> Contact us at{' '}
                  <a href="mailto:support@gfitness.com" className="text-primary-start font-semibold hover:underline">
                    support@gfitness.com
                  </a>{' '}
                  or visit our front desk during operating hours.
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
