import { motion } from 'framer-motion';
import Card from '../components/ui/Card';
import { DollarSign, TrendingUp, CreditCard, Calendar, Download, ArrowUp } from 'lucide-react';
import { exportToCSV } from '../utils/toast';

export default function Revenue() {
  const revenueStats = [
    { label: 'Total Revenue', value: '₱245,000', change: '+12%', icon: DollarSign, color: 'from-green-500 to-emerald-500' },
    { label: 'This Month', value: '₱52,000', change: '+8%', icon: Calendar, color: 'from-blue-500 to-cyan-500' },
    { label: 'Avg per Member', value: '₱1,570', change: '+5%', icon: TrendingUp, color: 'from-purple-500 to-pink-500' },
    { label: 'Pending Payments', value: '₱8,500', change: '-3', icon: CreditCard, color: 'from-orange-500 to-red-500' },
  ];

  const revenueByPlan = [
    { plan: 'Premium', amount: 162500, percentage: 66, color: 'from-purple-500 to-pink-500' },
    { plan: 'Standard', amount: 58500, percentage: 24, color: 'from-blue-500 to-cyan-500' },
    { plan: 'Basic', amount: 24000, percentage: 10, color: 'from-gray-500 to-gray-600' },
  ];

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-orbitron font-bold text-gradient">Revenue Reports</h1>
          <p className="text-gray-400 mt-1">Financial performance and revenue analytics</p>
        </div>
        <button 
          onClick={() => exportToCSV([], 'revenue-report.csv')}
          className="px-6 py-3 bg-gradient-to-r from-primary-start to-primary-end text-white rounded-xl font-semibold hover:shadow-lg transition-all flex items-center gap-2"
        >
          <Download size={20} />
          Export Report
        </button>
      </motion.div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {revenueStats.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <motion.div key={stat.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.1 }}>
              <Card>
                <div className="flex items-start justify-between mb-4">
                  <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${stat.color} flex items-center justify-center`}>
                    <Icon size={24} className="text-white" />
                  </div>
                  <div className="flex items-center gap-1 text-sm text-green-400">
                    <ArrowUp size={16} />
                    <span>{stat.change}</span>
                  </div>
                </div>
                <p className="text-gray-400 text-sm mb-1">{stat.label}</p>
                <p className="text-3xl font-bold text-white font-orbitron">{stat.value}</p>
              </Card>
            </motion.div>
          );
        })}
      </div>

      {/* Revenue by Plan */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
        <Card>
          <h3 className="text-xl font-semibold text-white mb-6">Revenue by Membership Plan</h3>
          <div className="space-y-6">
            {revenueByPlan.map((item, idx) => (
              <div key={idx}>
                <div className="flex justify-between items-center mb-2">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${item.color}`}></div>
                    <div>
                      <p className="text-white font-semibold">{item.plan}</p>
                      <p className="text-gray-400 text-sm">{item.percentage}% of total</p>
                    </div>
                  </div>
                  <p className="text-2xl font-bold text-white font-orbitron">₱{item.amount.toLocaleString()}</p>
                </div>
                <div className="h-3 bg-dark rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${item.percentage}%` }}
                    transition={{ delay: 0.5 + idx * 0.1, duration: 0.5 }}
                    className={`h-full bg-gradient-to-r ${item.color}`}
                  />
                </div>
              </div>
            ))}
          </div>
        </Card>
      </motion.div>

      {/* Monthly Breakdown */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}>
        <Card>
          <h3 className="text-xl font-semibold text-white mb-6">Monthly Breakdown</h3>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-dark-border">
                  <th className="text-left py-3 px-4 text-gray-400 font-medium text-sm">Month</th>
                  <th className="text-left py-3 px-4 text-gray-400 font-medium text-sm">New Members</th>
                  <th className="text-left py-3 px-4 text-gray-400 font-medium text-sm">Renewals</th>
                  <th className="text-left py-3 px-4 text-gray-400 font-medium text-sm">Total Revenue</th>
                  <th className="text-left py-3 px-4 text-gray-400 font-medium text-sm">Growth</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { month: 'January', newMembers: 12, renewals: 108, revenue: 180000, growth: '+5%' },
                  { month: 'February', newMembers: 15, renewals: 115, revenue: 195000, growth: '+8%' },
                  { month: 'March', newMembers: 18, renewals: 122, revenue: 210000, growth: '+8%' },
                  { month: 'April', newMembers: 14, renewals: 134, revenue: 225000, growth: '+7%' },
                  { month: 'May', newMembers: 16, renewals: 140, revenue: 245000, growth: '+9%' },
                ].map((row, idx) => (
                  <motion.tr
                    key={row.month}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.7 + idx * 0.1 }}
                    className="border-b border-dark-border/50 hover:bg-dark-border/30 transition-colors"
                  >
                    <td className="py-4 px-4 text-white font-medium">{row.month}</td>
                    <td className="py-4 px-4 text-gray-300">{row.newMembers}</td>
                    <td className="py-4 px-4 text-gray-300">{row.renewals}</td>
                    <td className="py-4 px-4 text-white font-bold">₱{row.revenue.toLocaleString()}</td>
                    <td className="py-4 px-4">
                      <span className="text-green-400 font-semibold flex items-center gap-1">
                        <ArrowUp size={14} />
                        {row.growth}
                      </span>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </motion.div>
    </div>
  );
}
