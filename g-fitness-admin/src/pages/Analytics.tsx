import { motion } from 'framer-motion';
import Card from '../components/ui/Card';
import { TrendingUp, Users, DollarSign, Activity, ArrowUp, ArrowDown, Calendar } from 'lucide-react';
import { exportToCSV } from '../utils/toast';

export default function Analytics() {
  const metrics = [
    { label: 'Total Revenue', value: '₱245,000', change: '+12%', trend: 'up', icon: DollarSign, color: 'from-green-500 to-emerald-500' },
    { label: 'Active Members', value: '156', change: '+8', trend: 'up', icon: Users, color: 'from-blue-500 to-cyan-500' },
    { label: 'Avg Attendance', value: '3.2x/week', change: '+0.3', trend: 'up', icon: Activity, color: 'from-purple-500 to-pink-500' },
    { label: 'Growth Rate', value: '15%', change: '+3%', trend: 'up', icon: TrendingUp, color: 'from-orange-500 to-red-500' },
  ];

  const monthlyData = [
    { month: 'Jan', revenue: 180000, members: 120 },
    { month: 'Feb', revenue: 195000, members: 130 },
    { month: 'Mar', revenue: 210000, members: 140 },
    { month: 'Apr', revenue: 225000, members: 148 },
    { month: 'May', revenue: 245000, members: 156 },
  ];

  const maxRevenue = Math.max(...monthlyData.map(d => d.revenue));

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-3xl font-orbitron font-bold text-gradient">Analytics Dashboard</h1>
        <p className="text-gray-400 mt-1">Business intelligence and performance metrics</p>
      </motion.div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {metrics.map((metric, index) => {
          const Icon = metric.icon;
          return (
            <motion.div key={metric.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.1 }}>
              <Card className="relative overflow-hidden">
                <div className="flex items-start justify-between mb-4">
                  <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${metric.color} flex items-center justify-center`}>
                    <Icon size={24} className="text-white" />
                  </div>
                  <div className={`flex items-center gap-1 text-sm ${metric.trend === 'up' ? 'text-green-400' : 'text-red-400'}`}>
                    {metric.trend === 'up' ? <ArrowUp size={16} /> : <ArrowDown size={16} />}
                    <span>{metric.change}</span>
                  </div>
                </div>
                <p className="text-gray-400 text-sm mb-1">{metric.label}</p>
                <p className="text-3xl font-bold text-white font-orbitron">{metric.value}</p>
              </Card>
            </motion.div>
          );
        })}
      </div>

      {/* Revenue Chart */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
        <Card>
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-xl font-semibold text-white">Monthly Revenue Trend</h3>
              <p className="text-gray-400 text-sm mt-1">Last 5 months performance</p>
            </div>
            <button 
              onClick={() => exportToCSV(monthlyData, 'analytics-report.csv')}
              className="px-4 py-2 bg-gradient-to-r from-primary-start to-primary-end text-white rounded-lg font-semibold hover:shadow-lg transition-all"
            >
              Export Report
            </button>
          </div>

          <div className="flex items-end justify-between gap-4 h-64">
            {monthlyData.map((data, index) => {
              const height = (data.revenue / maxRevenue) * 100;
              return (
                <div key={data.month} className="flex-1 flex flex-col items-center gap-3">
                  <motion.div
                    initial={{ height: 0 }}
                    animate={{ height: `${height}%` }}
                    transition={{ delay: 0.5 + index * 0.1, duration: 0.5 }}
                    className="w-full bg-gradient-to-t from-primary-start to-primary-end rounded-t-lg relative group"
                  >
                    <div className="absolute -top-16 left-1/2 -translate-x-1/2 bg-dark-lighter px-3 py-2 rounded-lg text-sm text-white opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap border border-dark-border">
                      <p className="font-semibold">₱{(data.revenue / 1000).toFixed(0)}K</p>
                      <p className="text-xs text-gray-400">{data.members} members</p>
                    </div>
                  </motion.div>
                  <span className="text-sm text-gray-400 font-medium">{data.month}</span>
                </div>
              );
            })}
          </div>
        </Card>
      </motion.div>

      {/* Additional Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}>
          <Card>
            <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
              <Calendar size={20} className="text-primary-start" />
              Peak Hours
            </h3>
            <div className="space-y-3">
              {[
                { time: '6:00 AM - 8:00 AM', percentage: 85 },
                { time: '12:00 PM - 2:00 PM', percentage: 65 },
                { time: '6:00 PM - 9:00 PM', percentage: 95 },
              ].map((slot, idx) => (
                <div key={idx}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-400">{slot.time}</span>
                    <span className="text-white font-semibold">{slot.percentage}%</span>
                  </div>
                  <div className="h-2 bg-dark rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${slot.percentage}%` }}
                      transition={{ delay: 0.7 + idx * 0.1, duration: 0.5 }}
                      className="h-full bg-gradient-to-r from-primary-start to-primary-end"
                    />
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.7 }}>
          <Card>
            <h3 className="text-white font-semibold mb-4">Popular Plans</h3>
            <div className="space-y-3">
              {[
                { plan: 'Premium', count: 65, color: 'from-purple-500 to-pink-500' },
                { plan: 'Standard', count: 58, color: 'from-blue-500 to-cyan-500' },
                { plan: 'Basic', count: 33, color: 'from-gray-500 to-gray-600' },
              ].map((item, idx) => (
                <div key={idx} className="flex items-center justify-between p-3 bg-dark rounded-xl">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${item.color}`}></div>
                    <span className="text-white font-medium">{item.plan}</span>
                  </div>
                  <span className="text-2xl font-bold text-white font-orbitron">{item.count}</span>
                </div>
              ))}
            </div>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
