import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect } from 'react';
import Card from '../components/ui/Card';
import Pagination from '../components/ui/Pagination';
import RecordPaymentModal from '../components/ui/RecordPaymentModal';
import ViewReceiptModal from '../components/ui/ViewReceiptModal';
import { exportPaymentsToCSV } from '../utils/exportUtils';
import { DollarSign, CheckCircle, XCircle, Clock, Download, Plus, ChevronDown, ChevronRight } from 'lucide-react';
import { showToast } from '../utils/toast';
import { SharedStorage } from '../utils/sharedStorage';

interface Payment {
  id: string; memberName: string; memberId: string;
  amount: number; plan: string; method: string;
  status: 'completed' | 'pending' | 'failed';
  date: string; dueDate: string; invoiceNumber: string;
}

interface MemberGroup {
  memberId: string; memberName: string;
  payments: Payment[];
  totalPaid: number;
  lastPayment: string;
}

const ITEMS_PER_PAGE = 8;

export default function Payments() {
  const [filterStatus, setFilterStatus] = useState<'all' | 'completed' | 'pending' | 'failed'>('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null);
  const [expandedMember, setExpandedMember] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  const defaultPayments: Payment[] = [
    { id: '1', memberName: 'Maria Santos', memberId: 'GF-2024-001', amount: 2500, plan: 'Premium', method: 'gcash', status: 'completed', date: '2024-06-01', dueDate: '2024-07-01', invoiceNumber: 'INV-2024-001' },
    { id: '2', memberName: 'Juan Dela Cruz', memberId: 'GF-2024-002', amount: 1500, plan: 'Standard', method: 'cash', status: 'completed', date: '2024-06-02', dueDate: '2024-07-02', invoiceNumber: 'INV-2024-002' },
    { id: '3', memberName: 'Pedro Reyes', memberId: 'GF-2024-003', amount: 800, plan: 'Basic', method: 'card', status: 'pending', date: '2024-06-03', dueDate: '2024-06-05', invoiceNumber: 'INV-2024-003' },
    { id: '4', memberName: 'Ana Garcia', memberId: 'GF-2024-004', amount: 2500, plan: 'Premium', method: 'bank', status: 'completed', date: '2024-06-03', dueDate: '2024-07-03', invoiceNumber: 'INV-2024-004' },
    { id: '5', memberName: 'Carlos Mendoza', memberId: 'GF-2024-005', amount: 1500, plan: 'Standard', method: 'gcash', status: 'failed', date: '2024-06-04', dueDate: '2024-06-04', invoiceNumber: 'INV-2024-005' },
    { id: '6', memberName: 'Maria Santos', memberId: 'GF-2024-001', amount: 2500, plan: 'Premium', method: 'gcash', status: 'completed', date: '2024-05-01', dueDate: '2024-06-01', invoiceNumber: 'INV-2024-006' },
  ];

  const [payments, setPayments] = useState<Payment[]>(() => {
    const shared = SharedStorage.getPayments();
    if (shared.length === 0) return defaultPayments;
    return shared.map((p: any) => ({
      id: p.id, memberName: p.memberName, memberId: p.memberId || p.memberEmail,
      amount: p.amount, plan: p.plan || 'Standard',
      method: (p.method || 'cash').toLowerCase(),
      status: (p.status === 'Pending' || p.status === 'pending') ? 'pending' :
              (p.status === 'Failed' || p.status === 'failed') ? 'failed' : 'completed',
      date: p.date,
      dueDate: p.expiryDate || new Date(new Date(p.date).setMonth(new Date(p.date).getMonth() + 1)).toISOString().split('T')[0],
      invoiceNumber: p.invoiceNumber || `INV-${p.id}`,
    }));
  });

  useEffect(() => {
    const interval = setInterval(() => {
      const shared = SharedStorage.getPayments();
      if (shared.length > 0) {
        setPayments(shared.map((p: any) => ({
          id: p.id, memberName: p.memberName, memberId: p.memberId || p.memberEmail,
          amount: p.amount, plan: p.plan || 'Standard',
          method: (p.method || 'cash').toLowerCase(),
          status: (p.status === 'Pending' || p.status === 'pending') ? 'pending' :
                  (p.status === 'Failed' || p.status === 'failed') ? 'failed' : 'completed',
          date: p.date,
          dueDate: p.expiryDate || new Date(new Date(p.date).setMonth(new Date(p.date).getMonth() + 1)).toISOString().split('T')[0],
          invoiceNumber: p.invoiceNumber || `INV-${p.id}`,
        })));
      }
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  // Group payments by member
  const memberGroups: MemberGroup[] = Object.values(
    payments.reduce((acc: Record<string, MemberGroup>, p) => {
      const filtered = filterStatus === 'all' || p.status === filterStatus;
      if (!filtered) return acc;
      if (!acc[p.memberId]) {
        acc[p.memberId] = { memberId: p.memberId, memberName: p.memberName, payments: [], totalPaid: 0, lastPayment: p.date };
      }
      acc[p.memberId].payments.push(p);
      if (p.status === 'completed') acc[p.memberId].totalPaid += p.amount;
      if (p.date > acc[p.memberId].lastPayment) acc[p.memberId].lastPayment = p.date;
      return acc;
    }, {})
  );

  const paginatedGroups = memberGroups.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  useEffect(() => { setCurrentPage(1); }, [filterStatus]);

  const handleRecordPayment = (data: any) => {
    const newPayment: Payment = {
      id: `PAY-${Date.now()}`, memberName: data.memberName, memberId: data.memberId,
      amount: data.amount, plan: 'Standard', method: data.method.toLowerCase(),
      status: 'completed', date: data.date,
      dueDate: new Date(new Date(data.date).setMonth(new Date(data.date).getMonth() + 1)).toISOString().split('T')[0],
      invoiceNumber: `INV-${String(Date.now()).slice(-6)}`,
    };
    SharedStorage.addPayment({ ...newPayment, memberEmail: data.memberEmail || '' });
    setPayments([newPayment, ...payments]);
    showToast('Payment recorded!', 'success');
  };

  const confirmPayment = (id: string) => {
    setPayments(payments.map(p => p.id === id ? { ...p, status: 'completed' } : p));
    showToast('Payment confirmed!', 'success');
  };

  const getStatusStyle = (status: string) => {
    if (status === 'completed') return { color: 'var(--color-primary)', background: 'var(--color-primary-light)', border: '1px solid rgba(124,58,237,0.30)' };
    if (status === 'pending') return { color: 'var(--color-secondary)', background: 'var(--color-secondary-light)', border: '1px solid rgba(245,158,11,0.30)' };
    return { color: 'var(--color-secondary)', background: 'var(--color-secondary-light)', border: '1px solid rgba(245,158,11,0.30)' };
  };

  const methodIcon: Record<string, string> = { cash: '💵', card: '💳', gcash: '📱', bank: '🏦' };

  const totalRevenue = payments.filter(p => p.status === 'completed').reduce((s, p) => s + p.amount, 0);
  const stats = [
    { label: 'Total Revenue', value: `₱${totalRevenue.toLocaleString()}`, icon: DollarSign, color: 'var(--color-primary)' },
    { label: 'Completed', value: payments.filter(p => p.status === 'completed').length, icon: CheckCircle, color: 'var(--color-primary)' },
    { label: 'Pending', value: payments.filter(p => p.status === 'pending').length, icon: Clock, color: 'var(--color-secondary)' },
    { label: 'Failed', value: payments.filter(p => p.status === 'failed').length, icon: XCircle, color: 'var(--color-secondary)' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Payments</h1>
          <p className="mt-1" style={{ color: 'var(--color-text-muted)' }}>Member payment records grouped by member</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => setIsModalOpen(true)}
            className="px-5 py-2.5 rounded-xl font-semibold flex items-center gap-2 text-black transition-colors"
            style={{ background: 'var(--color-secondary)' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-secondary-hover)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'var(--color-secondary)')}>
            <Plus size={18} /> Record Payment
          </button>
          <button onClick={() => exportPaymentsToCSV(payments)}
            className="px-5 py-2.5 rounded-xl font-semibold flex items-center gap-2 text-white transition-colors"
            style={{ background: 'var(--color-primary)' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-primary-hover)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'var(--color-primary)')}>
            <Download size={18} /> Export CSV
          </button>
        </div>
      </motion.div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((s, i) => {
          const Icon = s.icon;
          return (
            <motion.div key={s.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}>
              <Card>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${s.color}20` }}>
                    <Icon size={20} style={{ color: s.color }} />
                  </div>
                  <div>
                    <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{s.label}</p>
                    <p className="text-2xl font-bold text-white">{s.value}</p>
                  </div>
                </div>
              </Card>
            </motion.div>
          );
        })}
      </div>

      {/* Filter */}
      <div className="flex items-center gap-2">
        {(['all', 'completed', 'pending', 'failed'] as const).map(s => (
          <button key={s} onClick={() => setFilterStatus(s)}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            style={{
              background: filterStatus === s ? 'var(--color-secondary)' : 'var(--color-surface-raised)',
              color: filterStatus === s ? '#000' : 'var(--color-text-secondary)',
              border: `1px solid ${filterStatus === s ? 'var(--color-secondary)' : 'var(--color-border)'}`,
            }}>
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      {/* Member-centric table */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
        <Card>
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-white">Payment Records by Member</h2>
            <p className="text-sm mt-1" style={{ color: 'var(--color-text-muted)' }}>Click a member row to expand their payment history</p>
          </div>

          <div className="space-y-2">
            {paginatedGroups.map(group => (
              <div key={group.memberId} className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--color-border)' }}>
                {/* Member row */}
                <button
                  onClick={() => setExpandedMember(expandedMember === group.memberId ? null : group.memberId)}
                  className="w-full flex items-center justify-between p-4 text-left transition-colors"
                  style={{ background: expandedMember === group.memberId ? 'var(--color-surface-raised)' : 'var(--color-surface)' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-surface-raised)')}
                  onMouseLeave={e => (e.currentTarget.style.background = expandedMember === group.memberId ? 'var(--color-surface-raised)' : 'var(--color-surface)')}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full flex items-center justify-center text-black font-bold text-sm" style={{ background: 'var(--color-secondary)' }}>
                      {group.memberName.split(' ').map(n => n[0]).join('').slice(0, 2)}
                    </div>
                    <div>
                      <p className="text-white font-semibold">{group.memberName}</p>
                      <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{group.memberId} &bull; {group.payments.length} payment{group.payments.length !== 1 ? 's' : ''}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-6">
                    <div className="text-right">
                      <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Total Paid</p>
                      <p className="font-bold text-white">₱{group.totalPaid.toLocaleString()}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Last Payment</p>
                      <p className="text-sm text-white">{new Date(group.lastPayment).toLocaleDateString()}</p>
                    </div>
                    {expandedMember === group.memberId
                      ? <ChevronDown size={18} style={{ color: 'var(--color-secondary)' }} />
                      : <ChevronRight size={18} style={{ color: 'var(--color-text-muted)' }} />
                    }
                  </div>
                </button>

                {/* Expanded payment rows */}
                <AnimatePresence>
                  {expandedMember === group.memberId && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      style={{ borderTop: '1px solid var(--color-border)' }}
                    >
                      <table className="w-full">
                        <thead>
                          <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                            {['Invoice', 'Plan', 'Amount', 'Method', 'Date', 'Expires', 'Status', 'Actions'].map(h => (
                              <th key={h} className="text-left py-2 px-4 text-xs font-semibold uppercase" style={{ color: 'var(--color-text-muted)' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {group.payments.map(p => (
                            <tr key={p.id} style={{ borderBottom: '1px solid var(--color-border)' }}
                              onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-surface-raised)')}
                              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                              <td className="py-3 px-4 text-xs font-mono" style={{ color: 'var(--color-text-secondary)' }}>{p.invoiceNumber}</td>
                              <td className="py-3 px-4">
                                <span className="text-xs px-2 py-1 rounded-lg font-semibold" style={{ background: 'var(--color-secondary-light)', color: 'var(--color-secondary)' }}>{p.plan}</span>
                              </td>
                              <td className="py-3 px-4 font-bold text-white">₱{p.amount.toLocaleString()}</td>
                              <td className="py-3 px-4 text-sm" style={{ color: 'var(--color-text-secondary)' }}>{methodIcon[p.method] || '💰'} {p.method}</td>
                              <td className="py-3 px-4 text-sm" style={{ color: 'var(--color-text-secondary)' }}>{new Date(p.date).toLocaleDateString()}</td>
                              <td className="py-3 px-4 text-sm" style={{ color: 'var(--color-text-secondary)' }}>{new Date(p.dueDate).toLocaleDateString()}</td>
                              <td className="py-3 px-4">
                                <span className="px-2 py-1 rounded-full text-xs font-semibold uppercase" style={getStatusStyle(p.status)}>{p.status}</span>
                              </td>
                              <td className="py-3 px-4">
                                <div className="flex items-center gap-2">
                                  <button onClick={() => { setSelectedPayment(p); setIsReceiptModalOpen(true); }}
                                    className="px-2 py-1 rounded-lg text-xs font-semibold transition-colors"
                                    style={{ background: 'var(--color-primary-light)', color: 'var(--color-primary)', border: '1px solid rgba(124,58,237,0.30)' }}>
                                    View
                                  </button>
                                  {p.status === 'pending' && (
                                    <button onClick={() => confirmPayment(p.id)}
                                      className="px-2 py-1 rounded-lg text-xs font-semibold transition-colors"
                                      style={{ background: 'var(--color-primary-light)', color: 'var(--color-primary)', border: '1px solid rgba(124,58,237,0.30)' }}>
                                      Confirm
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}

            {memberGroups.length === 0 && (
              <div className="py-12 text-center" style={{ color: 'var(--color-text-muted)' }}>No payment records found.</div>
            )}
          </div>

          <Pagination currentPage={currentPage} totalItems={memberGroups.length} itemsPerPage={ITEMS_PER_PAGE} onPageChange={setCurrentPage} />
        </Card>
      </motion.div>

      <RecordPaymentModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onSubmit={handleRecordPayment} />
      <ViewReceiptModal isOpen={isReceiptModalOpen} onClose={() => { setIsReceiptModalOpen(false); setSelectedPayment(null); }} payment={selectedPayment} />
    </div>
  );
}
