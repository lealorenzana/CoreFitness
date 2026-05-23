import { motion } from 'framer-motion';
import { useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import {
  TrendingDown, AlertTriangle, Users, Target, Activity,
  ArrowUp, ArrowDown,
} from 'lucide-react';
import { showToast, exportToCSV } from '../utils/toast';
import {
  MOCK_AT_RISK_MEMBERS,
  MOCK_RETENTION_TREND,
  type AtRiskMember,
} from '../data/mockRetention';

export default function Retention() {
  const [selectedYear, setSelectedYear] = useState('2026');
  const atRiskMembers = MOCK_AT_RISK_MEMBERS;
  const retentionTrends = MOCK_RETENTION_TREND;
  const retentionByYear: Record<string, typeof MOCK_RETENTION_TREND> = {
    '2024': [
      { month: 'Jan', rate: 78 }, { month: 'Feb', rate: 80 }, { month: 'Mar', rate: 82 },
      { month: 'Apr', rate: 79 }, { month: 'May', rate: 81 }, { month: 'Jun', rate: 83 },
    ],
    '2025': [
      { month: 'Jan', rate: 82 }, { month: 'Feb', rate: 84 }, { month: 'Mar', rate: 86 },
      { month: 'Apr', rate: 85 }, { month: 'May', rate: 83 }, { month: 'Jun', rate: 85 },
    ],
    '2026': MOCK_RETENTION_TREND,
  };
  const chartData = retentionByYear[selectedYear] || MOCK_RETENTION_TREND;

  const retentionStats = [
    { label: 'At Risk Members', value: '12',      change: '+3',  trend: 'up' as const,   icon: AlertTriangle },
    { label: 'Retention Rate',  value: '87%',     change: '-2%', trend: 'down' as const, icon: Target },
    { label: 'Avg. Attendance', value: '3.2x/wk', change: '+0.3', trend: 'up' as const,   icon: Activity },
    { label: 'Active Members',  value: '156',     change: '+8',  trend: 'up' as const,   icon: Users },
  ];

  const getRiskBadgeVariant = (level: string) =>
    level === 'high' ? 'Suspended' : level === 'medium' ? 'Pending' : 'Active';

  const getReEngagementSuggestion = (m: AtRiskMember) => {
    if (m.riskLevel === 'high')   return 'Send personalized message + offer free PT session';
    if (m.riskLevel === 'medium') return 'Send motivational email + class reminder';
    return 'Monitor attendance pattern';
  };

  return (
    <div className="h-[calc(100vh-5rem)] flex flex-col gap-3 overflow-hidden">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-xl font-bold text-white">Rule-Based Retention</h1>
          <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
            Automated retention rules and at-risk member insights
          </p>
        </div>
        <Button variant="secondary" onClick={() => exportToCSV(atRiskMembers, 'at-risk-members.csv')}>
          Export List
        </Button>
      </motion.div>

      {/* Stats row — compact */}
      <div className="grid grid-cols-4 gap-3 flex-shrink-0">
        {retentionStats.map((stat, i) => {
          const Icon = stat.icon;
          return (
            <div key={stat.label} className="rounded-xl p-3 flex items-center gap-3"
              style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}>
              <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ background: 'var(--color-primary-light)' }}>
                <Icon size={16} style={{ color: 'var(--color-primary)' }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[9px] uppercase" style={{ color: 'var(--color-text-muted)' }}>{stat.label}</p>
                <div className="flex items-center gap-1.5">
                  <p className="text-lg font-bold text-white">{stat.value}</p>
                  <span className="text-[9px] font-semibold flex items-center"
                    style={{ color: stat.trend === 'up' ? 'var(--color-primary)' : 'var(--color-secondary)' }}>
                    {stat.trend === 'up' ? <ArrowUp size={9} /> : <ArrowDown size={9} />}{stat.change}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Main content — 2 columns, fills remaining space */}
      <div className="flex-1 min-h-0 grid grid-cols-2 gap-3">
        {/* LEFT: Retention Trend Chart */}
        <div className="rounded-xl overflow-hidden flex flex-col"
          style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
          <div className="flex items-center justify-between p-3 flex-shrink-0" style={{ borderBottom: '1px solid var(--color-border)' }}>
            <div>
              <h3 className="text-xs font-semibold text-white">Retention Trend</h3>
              <p className="text-[9px]" style={{ color: 'var(--color-text-muted)' }}>6-month retention rate</p>
            </div>
            <div className="flex items-center gap-2">
              <select value={selectedYear} onChange={e => setSelectedYear(e.target.value)}
                className="text-[10px] font-semibold px-2 py-1 rounded-full focus:outline-none cursor-pointer appearance-none"
                style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}>
                <option value="2024">2024</option>
                <option value="2025">2025</option>
                <option value="2026">2026</option>
              </select>
              <span className="text-[9px] font-semibold flex items-center gap-0.5" style={{ color: 'var(--color-secondary)' }}>
                <TrendingDown size={11} /> -2%
              </span>
            </div>
          </div>
          <div className="flex-1 p-3 min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                <XAxis dataKey="month" stroke="var(--color-text-muted)" tick={{ fill: '#9CA3AF', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis stroke="var(--color-text-muted)" tick={{ fill: '#9CA3AF', fontSize: 10 }} axisLine={false} tickLine={false} domain={[70, 100]} />
                <Tooltip contentStyle={{ backgroundColor: '#1E1B30', border: '1px solid var(--color-border)', borderRadius: 12, color: '#fff', fontSize: 11 }} formatter={(value: number) => [`${value}%`, 'Retention']} />
                <Bar dataKey="rate" fill="#7C3AED" radius={[4, 4, 0, 0]} maxBarSize={32} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* RIGHT: At-Risk Members */}
        <div className="rounded-xl overflow-hidden flex flex-col"
          style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
          <div className="flex items-center justify-between p-3 flex-shrink-0" style={{ borderBottom: '1px solid var(--color-border)' }}>
            <h3 className="text-xs font-semibold text-white flex items-center gap-1.5">
              <AlertTriangle size={12} style={{ color: 'var(--color-secondary)' }} />
              At-Risk Members
            </h3>
            <span className="text-[9px]" style={{ color: 'var(--color-text-muted)' }}>Auto-detected by rules</span>
          </div>
          <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-dark-border">
            <table className="w-full">
              <thead className="sticky top-0" style={{ background: 'var(--color-surface)' }}>
                <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                  {['Member', 'Inactive', 'Rate', 'Risk', 'Action'].map(h => (
                    <th key={h} className="text-left py-2 px-2.5 text-[8px] font-semibold uppercase tracking-wider"
                      style={{ color: 'var(--color-text-muted)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {atRiskMembers.map(m => (
                  <tr key={m.id} style={{ borderBottom: '1px solid var(--color-border)' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-surface-raised)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                    <td className="py-2 px-2.5">
                      <div className="flex items-center gap-1.5">
                        <div className="w-6 h-6 rounded-full flex items-center justify-center text-white font-bold text-[8px]"
                          style={{ background: 'var(--color-primary)' }}>{m.name[0]}</div>
                        <div>
                          <p className="text-[10px] text-white font-semibold truncate max-w-[80px]">{m.name}</p>
                          <p className="text-[8px]" style={{ color: 'var(--color-text-muted)' }}>{m.membershipType}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-2 px-2.5 text-[10px] font-semibold text-white">{m.daysInactive}d</td>
                    <td className="py-2 px-2.5">
                      <div className="flex items-center gap-1">
                        <div className="w-12 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--color-border)' }}>
                          <div className="h-full" style={{ width: `${m.attendanceRate}%`, background: m.attendanceRate >= 50 ? 'var(--color-primary)' : 'var(--color-secondary)' }} />
                        </div>
                        <span className="text-[9px] text-white">{m.attendanceRate}%</span>
                      </div>
                    </td>
                    <td className="py-2 px-2.5">
                      <Badge variant={getRiskBadgeVariant(m.riskLevel)}>{m.riskLevel.toUpperCase()}</Badge>
                    </td>
                    <td className="py-2 px-2.5">
                      <Button variant="ghost" size="sm" className="!text-[8px] !px-2 !py-0.5 !h-5"
                        onClick={() => showToast(`Rule action triggered for ${m.name}`, 'success')}>
                        Execute
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
