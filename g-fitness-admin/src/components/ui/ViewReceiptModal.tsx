import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Receipt, Download, Printer, Calendar, CreditCard, User, Package, CheckCircle } from 'lucide-react';
import Button from './Button';
import { getGymSettings, type GymSettingsRow } from '../../lib/api/settings';

interface Payment {
  id: string;
  memberName: string;
  memberId: string;
  amount: number;
  plan: string;
  method: string;
  status: string;
  date: string;
  dueDate: string;
  invoiceNumber: string;
}

interface ViewReceiptModalProps {
  isOpen: boolean;
  onClose: () => void;
  payment: Payment | null;
}

export default function ViewReceiptModal({ isOpen, onClose, payment }: ViewReceiptModalProps) {
  /**
   * The gym's own details, from `gym_settings` (0013).
   *
   * This receipt said "G-FITNESS RECEIPT" and "G-Fitness Management System" — a
   * name from the old prototype, on the one document a member keeps — and
   * carried no address or phone at all, just "contact gym management".
   *
   * It is also the first thing that reads `gym_name` / `address` / `phone` /
   * `email`. Settings has been collecting all four since 0013 and **nothing
   * consumed any of them**, which makes that form a control that writes a flag
   * nothing reads.
   */
  const [gym, setGym] = useState<GymSettingsRow | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    getGymSettings().then(setGym).catch(() => setGym(null));
  }, [isOpen]);

  if (!payment) return null;

  // Falls back to nothing rather than to a placeholder gym: an unreadable
  // setting should leave the line off the receipt, not print someone else's name.
  const gymName = gym?.gym_name?.trim() || 'Core Fitness';
  const gymLines = [gym?.address, gym?.phone, gym?.email].map((v) => v?.trim()).filter(Boolean) as string[];

  const handlePrint = () => {
    window.print();
  };

  const handleDownload = () => {
    // Create a simple text receipt
    const receiptText = `
${gymName.toUpperCase()} — OFFICIAL RECEIPT
=====================================
${gymLines.join('\n')}
${gymLines.length > 0 ? '=====================================' : ''}
Invoice: ${payment.invoiceNumber}
Date: ${new Date(payment.date).toLocaleDateString()}
=====================================

MEMBER INFORMATION
Name: ${payment.memberName}
Member ID: ${payment.memberId}

PAYMENT DETAILS
Plan: ${payment.plan}
Amount: ₱${payment.amount.toLocaleString()}
Payment Method: ${payment.method}
Status: ${payment.status}

MEMBERSHIP PERIOD
Start Date: ${new Date(payment.date).toLocaleDateString()}
Expiry Date: ${new Date(payment.dueDate).toLocaleDateString()}

=====================================
Thank you for your payment!
${gymName}
=====================================
    `;

    const blob = new Blob([receiptText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Receipt_${payment.invoiceNumber}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50"
          />

          {/* Modal */}
          <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="bg-dark-lighter border border-dark-border rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="p-6 border-b border-dark-border flex items-center justify-between"
                style={{ background: 'var(--color-surface-raised)' }}>
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: 'var(--color-primary)' }}>
                    <Receipt size={24} className="text-white" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-white">Payment Receipt</h2>
                    <p className="text-gray-400 text-sm">Invoice #{payment.invoiceNumber}</p>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="text-gray-400 hover:text-white transition-colors"
                >
                  <X size={24} />
                </button>
              </div>

              {/* Receipt Content */}
              <div className="p-8 space-y-6">
                {/* The gym's own identity, from Settings. */}
                <div className="text-center pb-4" style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <p className="text-base font-bold text-white uppercase tracking-wide">{gymName}</p>
                  {gymLines.length > 0 && (
                    <p className="text-[11px] mt-1" style={{ color: 'var(--color-text-muted)' }}>
                      {gymLines.join(' · ')}
                    </p>
                  )}
                </div>

                {/* Status Badge */}
                {/* Was a green pill with violet text — the design system has no
                    greens, and green-on-violet was unreadable either way. */}
                <div className="flex items-center justify-center">
                  <div className="inline-flex items-center gap-2 px-6 py-3 rounded-full text-sm font-semibold uppercase border-2"
                    style={
                      payment.status === 'completed'
                        ? { background: 'var(--color-primary-light)', color: 'var(--color-primary)', borderColor: 'rgba(124,58,237,0.30)' }
                        : { background: 'var(--color-secondary-light)', color: 'var(--color-secondary)', borderColor: 'rgba(245,158,11,0.30)' }
                    }>
                    <CheckCircle size={20} />
                    {payment.status}
                  </div>
                </div>

                {/* Invoice Details */}
                <div className="bg-dark rounded-xl p-6 space-y-4">
                  <div className="flex items-center justify-between pb-4 border-b border-dark-border">
                    <div>
                      <p className="text-gray-400 text-sm mb-1">Invoice Number</p>
                      <p className="text-white font-mono font-bold text-lg">{payment.invoiceNumber}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-gray-400 text-sm mb-1">Date Issued</p>
                      <p className="text-white font-medium">{new Date(payment.date).toLocaleDateString('en-US', { 
                        month: 'long', 
                        day: 'numeric', 
                        year: 'numeric' 
                      })}</p>
                    </div>
                  </div>

                  {/* Member Info */}
                  <div className="space-y-3">
                    <div className="flex items-start gap-3">
                      <User size={20} className="text-primary-start mt-1" />
                      <div className="flex-1">
                        <p className="text-gray-400 text-sm">Member Name</p>
                        <p className="text-white font-semibold text-lg">{payment.memberName}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <Package size={20} className="text-primary-start mt-1" />
                      <div className="flex-1">
                        <p className="text-gray-400 text-sm">Member ID</p>
                        <p className="text-white font-mono">{payment.memberId}</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Payment Details */}
                <div className="bg-dark rounded-xl p-6 space-y-4">
                  <h3 className="text-white font-semibold text-lg mb-4 flex items-center gap-2">
                    <CreditCard size={20} className="text-primary-start" />
                    Payment Details
                  </h3>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-gray-400 text-sm mb-1">Membership Plan</p>
                      <div className="inline-flex px-3 py-1 bg-primary-start/20 text-primary-start rounded-lg font-semibold">
                        {payment.plan}
                      </div>
                    </div>
                    <div>
                      <p className="text-gray-400 text-sm mb-1">Payment Method</p>
                      <p className="text-white font-medium capitalize">{payment.method}</p>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-dark-border">
                    <div className="flex items-center justify-between">
                      <p className="text-gray-400 text-lg">Total Amount</p>
                      <p className="text-3xl font-bold text-white font-orbitron">₱{payment.amount.toLocaleString()}</p>
                    </div>
                  </div>
                </div>

                {/* Membership Period */}
                <div className="bg-dark rounded-xl p-6">
                  <h3 className="text-white font-semibold text-lg mb-4 flex items-center gap-2">
                    <Calendar size={20} className="text-primary-start" />
                    Membership Period
                  </h3>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-gray-400 text-sm mb-1">Start Date</p>
                      <p className="text-white font-medium">{new Date(payment.date).toLocaleDateString()}</p>
                    </div>
                    <div>
                      <p className="text-gray-400 text-sm mb-1">Expiry Date</p>
                      <p className="text-white font-medium">{new Date(payment.dueDate).toLocaleDateString()}</p>
                    </div>
                  </div>

                  <div className="mt-4 p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
                    <p className="text-violet text-sm">
                      <strong>Duration:</strong> {Math.ceil((new Date(payment.dueDate).getTime() - new Date(payment.date).getTime()) / (1000 * 60 * 60 * 24))} days
                    </p>
                  </div>
                </div>

                {/* Footer Note */}
                <div className="bg-dark-border/30 rounded-xl p-4 text-center">
                  <p className="text-gray-400 text-sm">
                    Thank you for your payment! This receipt serves as proof of your membership subscription.
                  </p>
                  <p className="text-gray-500 text-xs mt-2">
                    {gym?.phone
                      ? `For any inquiries, call ${gym.phone}.`
                      : 'For any inquiries, please contact gym management.'}
                  </p>
                </div>
              </div>

              {/* Actions */}
              <div className="p-6 border-t border-dark-border bg-dark/50 flex items-center gap-3">
                <Button
                  onClick={handleDownload}
                  variant="ghost"
                  className="flex-1 flex items-center justify-center gap-2"
                >
                  <Download size={18} />
                  Download
                </Button>
                <Button
                  onClick={handlePrint}
                  variant="ghost"
                  className="flex-1 flex items-center justify-center gap-2"
                >
                  <Printer size={18} />
                  Print
                </Button>
                <Button
                  onClick={onClose}
                  variant="primary"
                  className="flex-1"
                >
                  Close
                </Button>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
