import { motion } from 'framer-motion';
import Card from '../components/ui/Card';
import { TrendingDown, AlertTriangle, Users, Target, Calendar, Activity, ArrowUp, ArrowDown } from 'lucide-react';
import { showToast, exportToCSV } from '../utils/toast';

interface AtRiskMember {
  id: string;
  name: string;
  lastVisit: string;
  daysInactive: number;
  attendanceRate: number;
  riskLevel: 'high' | 'medium' | 'low';
  membershipType: string;
  joinDate: string;
}

export default function Retention() {
  const atRiskMembers: AtRiskMember[] = [
    {
      id: '1',
      name: 'Maria Santos',
      lastVisit: '2024-05-20',
      daysInactive: 15,
      attendanceRate: 25,
      riskLevel: 'high',
      membershipType: 'Premium',
      joinDate: '2024-01-15',
    },
    {
      id: '2',
      name: 'Juan Dela Cruz',
      lastVisit: '2024-05-28',
      daysInactive: 7,
      attendanceRate: 45,
      riskLevel: 'medium',
      membershipType: 'Standard',
      joinDate: '2024-02-10',
    },
    {
      id: '3',
      name: 'Pedro Reyes',
      lastVisit: '2024-05-15',
      daysInactive: 20,
      attendanceRate: 15,
      riskLevel: 'high',
      membershipType: 'Basic',
      joinDate: '2024-03-05',
    },
    {
      id: '4',
      name: 'Ana Garcia',
      lastVisit: '2024-05-30',
      daysInactive: 5,
      attendanceRate: 55,
      riskLevel: 'low',
      membershipType: 'Premium',
      joinDate: '2023-12-01',
    },
    {
      id: '5',
      name: 'Carlos Mendoza',
      lastVisit: '2024-05-25',
      daysInactive: 10,
      attendanceRate: 35,
      riskLevel: 'medium',
      membershipType: 'Standard',
      joinDate: '2024-01-20',
    },
  ];

  const retentionStats = [
    {
      label: 'At Risk Members',
      value: '12',
      change: '+3',
      trend: 'up',
      icon: AlertTriangle,
      color: 'from-red-500 to-orange-500',
    },
    {
      label: 'Retention Rate',
      value: '87%',
      change: '-2%',
      trend: 'down',
      icon: Target,
      color: 'from-green-500 to-emerald-500',
    },
    {
      label: 'Avg. Attendance',
      value: '3.2x/week',
      change: '+0.3',
      trend: 'up',
      icon: Activity,
      color: 'from-blue-500 to-cyan-500',
    },
    {
      label: 'Active Members',
      value: '156',
      change: '+8',
      trend: 'up',
      icon: Users,
      color: 'from-purple-500 to-pink-500',
    },
  ];

  const retentionTrends = [
    { month: 'Jan', rate: 85 },
    { month: 'Feb', rate: 88 },
    { month: 'Mar', rate: 90 },
    { month: 'Apr', rate: 89 },
    { month: 'May', rate: 87 },
    { month: 'Jun', rate: 87 },
  ];

  const maxRate = Math.max(...retentionTrends.map((t) => t.rate));

  const getRiskColor = (level: string) => {
    switch (level) {
      case 'high':
        return 'text-red-400 bg-red-500/20 border-red-500/30';
      case 'medium':
        return 'text-yellow-400 bg-yellow-500/20 border-yellow-500/30';
      case 'low':
        return 'text-green-400 bg-green-500/20 border-green-500/30';
      default:
        return 'text-gray-400 bg-gray-500/20 border-gray-500/30';
    }
  };

  const getReEngagementSuggestion = (member: AtRiskMember) => {
    if (member.riskLevel === 'high') {
      return 'Send personalized message + offer free PT session';
    } else if (member.riskLevel === 'medium') {
      return 'Send motivational email + class reminder';
    } else {
      return 'Monitor attendance pattern';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h1 className="text-3xl font-orbitron font-bold text-gradient">Retention Analytics</h1>
        <p className="text-gray-400 mt-1">Predictive member retention insights</p>
      </motion.div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {retentionStats.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
            >
              <Card className="relative overflow-hidden">
                <div className="flex items-start justify-between mb-4">
                  <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${stat.color} flex items-center justify-center`}>
                    <Icon size={24} className="text-white" />
                  </div>
                  <div className={`flex items-center gap-1 text-sm ${stat.trend === 'up' ? 'text-green-400' : 'text-red-400'}`}>
                    {stat.trend === 'up' ? <ArrowUp size={16} /> : <ArrowDown size={16} />}
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

      {/* Retention Trend Chart */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
      >
        <Card>
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-xl font-semibold text-white">Retention Trend</h3>
              <p className="text-gray-400 text-sm mt-1">6-month retention rate history</p>
            </div>
            <div className="flex items-center gap-2">
              <TrendingDown size={20} className="text-red-400" />
              <span className="text-red-400 text-sm font-semibold">-2% this month</span>
            </div>
          </div>

          <div className="flex items-end justify-between gap-4 h-64">
            {retentionTrends.map((trend, index) => {
              const height = (trend.rate / maxRate) * 100;
              return (
                <div key={trend.month} className="flex-1 flex flex-col items-center gap-3">
                  <motion.div
                    initial={{ height: 0 }}
                    animate={{ height: `${height}%` }}
                    transition={{ delay: 0.5 + index * 0.1, duration: 0.5 }}
                    className="w-full bg-gradient-to-t from-primary-start to-primary-end rounded-t-lg relative group"
                  >
                    <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-dark-lighter px-3 py-1 rounded-lg text-sm text-white opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap border border-dark-border">
                      {trend.rate}%
                    </div>
                  </motion.div>
                  <span className="text-sm text-gray-400 font-medium">{trend.month}</span>
                </div>
              );
            })}
          </div>
        </Card>
      </motion.div>

      {/* At-Risk Members Table */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
      >
        <Card>
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-xl font-semibold text-white flex items-center gap-2">
                <AlertTriangle size={24} className="text-red-400" />
                At-Risk Members
              </h3>
              <p className="text-gray-400 text-sm mt-1">Members with declining attendance patterns</p>
            </div>
            <button 
              onClick={() => exportToCSV(atRiskMembers, 'at-risk-members.csv')}
              className="px-4 py-2 bg-gradient-to-r from-primary-start to-primary-end text-white rounded-lg font-semibold hover:shadow-lg hover:shadow-primary-start/30 transition-all"
            >
              Export List
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-dark-border">
                  <th className="text-left py-3 px-4 text-gray-400 font-medium text-sm">Member</th>
                  <th className="text-left py-3 px-4 text-gray-400 font-medium text-sm">Last Visit</th>
                  <th className="text-left py-3 px-4 text-gray-400 font-medium text-sm">Days Inactive</th>
                  <th className="text-left py-3 px-4 text-gray-400 font-medium text-sm">Attendance Rate</th>
                  <th className="text-left py-3 px-4 text-gray-400 font-medium text-sm">Risk Level</th>
                  <th className="text-left py-3 px-4 text-gray-400 font-medium text-sm">Re-Engagement Action</th>
                </tr>
              </thead>
              <tbody>
                {atRiskMembers.map((member, index) => (
                  <motion.tr
                    key={member.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.7 + index * 0.1 }}
                    className="border-b border-dark-border/50 hover:bg-dark-border/30 transition-colors"
                  >
                    <td className="py-4 px-4">
                      <div>
                        <p className="text-white font-medium">{member.name}</p>
                        <p className="text-gray-400 text-xs">{member.membershipType}</p>
                      </div>
                    </td>
                    <td className="py-4 px-4">
                      <div className="flex items-center gap-2 text-gray-300 text-sm">
                        <Calendar size={14} className="text-gray-400" />
                        {new Date(member.lastVisit).toLocaleDateString()}
                      </div>
                    </td>
                    <td className="py-4 px-4">
                      <span className="text-white font-semibold">{member.daysInactive} days</span>
                    </td>
                    <td className="py-4 px-4">
                      <div className="flex items-center gap-3">
                        <div className="flex-1 h-2 bg-dark rounded-full overflow-hidden max-w-[100px]">
                          <div
                            className={`h-full ${
                              member.attendanceRate >= 50
                                ? 'bg-green-500'
                                : member.attendanceRate >= 30
                                ? 'bg-yellow-500'
                                : 'bg-red-500'
                            }`}
                            style={{ width: `${member.attendanceRate}%` }}
                          ></div>
                        </div>
                        <span className="text-white text-sm font-medium">{member.attendanceRate}%</span>
                      </div>
                    </td>
                    <td className="py-4 px-4">
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold uppercase border ${getRiskColor(member.riskLevel)}`}>
                        {member.riskLevel}
                      </span>
                    </td>
                    <td className="py-4 px-4">
                      <div className="flex items-center gap-2">
                        <p className="text-gray-300 text-sm">{getReEngagementSuggestion(member)}</p>
                        <button 
                          onClick={() => showToast(`Re-engagement action initiated for ${member.name}`, 'success')}
                          className="px-3 py-1 bg-primary-start/20 text-primary-start rounded-lg text-xs font-semibold hover:bg-primary-start/30 transition-all whitespace-nowrap"
                        >
                          Take Action
                        </button>
                      </div>
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
