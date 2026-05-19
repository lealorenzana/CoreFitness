import { motion } from 'framer-motion';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, User, Mail, Phone, MapPin, Calendar, CreditCard, Activity, Edit2, Trash2, Ban, CheckCircle } from 'lucide-react';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import { MEMBERS } from '../data/members';
import { formatDate, formatCurrency, formatPhoneNumber } from '../utils/formatters';

export default function MemberDetail() {
  const navigate = useNavigate();
  const { memberId } = useParams();
  
  const member = MEMBERS.find(m => m.id === memberId);

  if (!member) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <p className="text-gray-400 text-lg">Member not found</p>
          <Button onClick={() => navigate('/members')} className="mt-4">
            Back to Members
          </Button>
        </div>
      </div>
    );
  }

  // Mock data for attendance and payments
  const attendanceHistory = [
    { date: '2024-06-15', time: '08:30 AM', method: 'QR Code' },
    { date: '2024-06-14', time: '07:45 AM', method: 'QR Code' },
    { date: '2024-06-12', time: '09:15 AM', method: 'Manual' },
    { date: '2024-06-10', time: '08:00 AM', method: 'QR Code' },
    { date: '2024-06-08', time: '07:30 AM', method: 'QR Code' },
  ];

  const paymentHistory = [
    { date: '2024-06-01', amount: 2500, method: 'GCash', status: 'Completed', invoice: 'INV-2024-001' },
    { date: '2024-05-01', amount: 2500, method: 'Cash', status: 'Completed', invoice: 'INV-2024-002' },
    { date: '2024-04-01', amount: 2500, method: 'Bank Transfer', status: 'Completed', invoice: 'INV-2024-003' },
  ];

  const membershipPrices = { Basic: 800, Standard: 1500, Premium: 2500 };

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/members')}
            className="w-12 h-12 rounded-xl bg-dark-lighter border border-dark-border flex items-center justify-center text-gray-400 hover:text-white hover:border-primary-start transition-all duration-200"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-3xl font-orbitron font-bold text-gradient">Member Details</h1>
            <p className="text-gray-400 mt-1">View and manage member information</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="ghost" className="flex items-center gap-2">
            <Edit2 size={18} />
            Edit
          </Button>
          <Button variant="ghost" className="flex items-center gap-2 text-red-400 hover:text-red-300">
            <Trash2 size={18} />
            Delete
          </Button>
        </div>
      </motion.div>

      {/* Member Profile Card */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.1 }}
      >
        <Card>
          <div className="flex items-start gap-6">
            <div className="relative">
              <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-primary-start to-primary-end flex items-center justify-center text-white font-bold text-3xl shadow-lg">
                {member.firstName[0]}{member.lastName[0]}
              </div>
              {member.membershipStatus === 'Active' && (
                <div className="absolute -bottom-2 -right-2 w-8 h-8 bg-green-500 rounded-full border-4 border-dark-lighter flex items-center justify-center">
                  <CheckCircle size={16} className="text-white" />
                </div>
              )}
            </div>

            <div className="flex-1">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-2xl font-bold text-white">{member.fullName}</h2>
                  <p className="text-gray-400 font-mono mt-1">{member.qrCode}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={member.membershipType}>{member.membershipType}</Badge>
                  <Badge variant={member.membershipStatus}>{member.membershipStatus}</Badge>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6 mt-6">
                <div className="flex items-center gap-3">
                  <Mail size={20} className="text-gray-400" />
                  <div>
                    <p className="text-gray-400 text-xs">Email</p>
                    <p className="text-white">{member.email}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <Phone size={20} className="text-gray-400" />
                  <div>
                    <p className="text-gray-400 text-xs">Phone</p>
                    <p className="text-white">{formatPhoneNumber(member.phone)}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <MapPin size={20} className="text-gray-400" />
                  <div>
                    <p className="text-gray-400 text-xs">Address</p>
                    <p className="text-white">{member.address}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <Calendar size={20} className="text-gray-400" />
                  <div>
                    <p className="text-gray-400 text-xs">Join Date</p>
                    <p className="text-white">{formatDate(member.joinDate)}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Card>
      </motion.div>

      {/* Membership Info */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <Card header={
          <div className="flex items-center gap-2">
            <CreditCard size={20} className="text-primary-start" />
            <h3 className="font-semibold text-white text-lg">Membership Information</h3>
          </div>
        }>
          <div className="grid grid-cols-4 gap-6">
            <div>
              <p className="text-gray-400 text-sm mb-1">Plan</p>
              <p className="text-white font-semibold text-lg">{member.membershipType}</p>
            </div>
            <div>
              <p className="text-gray-400 text-sm mb-1">Monthly Fee</p>
              <p className="text-white font-semibold text-lg">{formatCurrency(membershipPrices[member.membershipType])}</p>
            </div>
            <div>
              <p className="text-gray-400 text-sm mb-1">Start Date</p>
              <p className="text-white font-semibold text-lg">{formatDate(member.joinDate)}</p>
            </div>
            <div>
              <p className="text-gray-400 text-sm mb-1">Expiry Date</p>
              <p className={`font-semibold text-lg ${member.membershipStatus === 'Expired' ? 'text-red-400' : 'text-white'}`}>
                {formatDate(member.expiryDate)}
              </p>
            </div>
          </div>

          {member.membershipStatus === 'Expiring' && (
            <div className="mt-4 bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4 flex items-center gap-3">
              <Ban size={20} className="text-yellow-400" />
              <p className="text-yellow-400 text-sm">
                Membership expires soon. Consider sending a renewal reminder.
              </p>
            </div>
          )}
        </Card>
      </motion.div>

      {/* Attendance History */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        <Card header={
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity size={20} className="text-green-400" />
              <h3 className="font-semibold text-white text-lg">Recent Attendance</h3>
            </div>
            <span className="text-xs text-gray-400 bg-dark-border px-3 py-1 rounded-full">
              Last 5 visits
            </span>
          </div>
        }>
          <div className="space-y-3">
            {attendanceHistory.map((record, index) => (
              <div
                key={index}
                className="flex items-center justify-between p-4 bg-dark rounded-xl border border-dark-border hover:border-primary-start/30 transition-all duration-200"
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center">
                    <Activity size={20} className="text-white" />
                  </div>
                  <div>
                    <p className="text-white font-semibold">{formatDate(record.date)}</p>
                    <p className="text-gray-400 text-sm">{record.time}</p>
                  </div>
                </div>
                <Badge variant={record.method === 'QR Code' ? 'Active' : 'Standard'}>
                  {record.method}
                </Badge>
              </div>
            ))}
          </div>
        </Card>
      </motion.div>

      {/* Payment History */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
      >
        <Card header={
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CreditCard size={20} className="text-blue-400" />
              <h3 className="font-semibold text-white text-lg">Payment History</h3>
            </div>
            <Button variant="primary" size="sm">
              Record Payment
            </Button>
          </div>
        }>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-dark-border">
                  <th className="text-left py-3 px-4 text-gray-400 font-semibold text-xs uppercase">Date</th>
                  <th className="text-left py-3 px-4 text-gray-400 font-semibold text-xs uppercase">Amount</th>
                  <th className="text-left py-3 px-4 text-gray-400 font-semibold text-xs uppercase">Method</th>
                  <th className="text-left py-3 px-4 text-gray-400 font-semibold text-xs uppercase">Invoice</th>
                  <th className="text-left py-3 px-4 text-gray-400 font-semibold text-xs uppercase">Status</th>
                </tr>
              </thead>
              <tbody>
                {paymentHistory.map((payment, index) => (
                  <tr key={index} className="border-b border-dark-border hover:bg-dark-border/50 transition-all duration-200">
                    <td className="py-4 px-4 text-white">{formatDate(payment.date)}</td>
                    <td className="py-4 px-4 text-white font-semibold">{formatCurrency(payment.amount)}</td>
                    <td className="py-4 px-4 text-gray-400">{payment.method}</td>
                    <td className="py-4 px-4 text-gray-400 font-mono text-sm">{payment.invoice}</td>
                    <td className="py-4 px-4">
                      <Badge variant="Active">{payment.status}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </motion.div>
    </div>
  );
}
