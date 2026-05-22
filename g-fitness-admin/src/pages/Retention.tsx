import { motion } from 'framer-motion';
import { useState } from 'react';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import {
  TrendingDown, AlertTriangle, Users, Target, Calendar, Activity,
  ArrowUp, ArrowDown, ClipboardList, CheckCircle, Flame, Clock,
} from 'lucide-react';
import { showToast, exportToCSV } from '../utils/toast';
import {
  MOCK_AT_RISK_MEMBERS,
  MOCK_RETENTION_TREND,
  MOCK_STAFF_TASKS,
  MOCK_MEMBER_RETENTION,
  type AtRiskMember,
} from '../data/mockRetention';

type RoleView = 'Admin' | 'Staff' | 'Member';

export default function Retention() {
  const [role, setRole] = useState<RoleView>('Admin');

  const atRiskMembers = MOCK_AT_RISK_MEMBERS;
  const retentionTrends = MOCK_RETENTION_TREND;
  const staffTasks = MOCK_STAFF_TASKS;
  const personal = MOCK_MEMBER_RETENTION;
  const maxRate = Math.max(...retentionTrends.map(t => t.rate));

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
    <div className="space-y-6">
      {/* Header + role toggle */}
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}
        className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white">Retention Analytics</h1>
          <p className="mt-1" style={{ color: 'var(--color-text-muted)' }}>
            Predictive member retention insights — switch role to preview
          </p>
        </div>
        <div className="flex items-center gap-2 p-1 rounded-full"
          style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}>
          {(['Admin', 'Staff', 'Member'] as RoleView[]).map(r => {
            const isActive = role === r;
            return (
              <button key={r} onClick={() => setRole(r)}
                className="px-4 py-1.5 rounded-full text-sm font-semibold transition-colors"
                style={{
                  background: isActive ? 'var(--color-secondary)' : 'transparent',
                  color: isActive ? '#000' : 'var(--color-text-secondary)',
                }}>
                {r}
              </button>
            );
          })}
        </div>
      </motion.div>

      {/* ─────────── ADMIN VIEW ─────────── */}
      {role === 'Admin' && (
        <>
          {/* Stats grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {retentionStats.map((stat, i) => {
              const Icon = stat.icon;
              return (
                <motion.div key={stat.label}
                  initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}>
                  <Card>
                    <div className="flex items-start justify-between mb-4">
                      <div className="w-12 h-12 rounded-xl flex items-center justify-center"
                        style={{ background: 'var(--color-primary-light)' }}>
                        <Icon size={22} style={{ color: 'var(--color-primary)' }} />
                      </div>
                      <div className="flex items-center gap-1 text-sm font-semibold"
                        style={{ color: stat.trend === 'up' ? 'var(--color-primary)' : 'var(--color-secondary)' }}>
                        {stat.trend === 'up' ? <ArrowUp size={14} /> : <ArrowDown size={14} />}
                        <span>{stat.change}</span>
                      </div>
                    </div>
                    <p className="text-sm mb-1" style={{ color: 'var(--color-text-muted)' }}>{stat.label}</p>
                    <p className="text-3xl font-bold text-white">{stat.value}</p>
                  </Card>
                </motion.div>
              );
            })}
          </div>

          {/* Retention trend chart */}
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            <Card>
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-xl font-semibold text-white">Retention Trend</h3>
                  <p className="text-sm mt-1" style={{ color: 'var(--color-text-muted)' }}>6-month retention rate history</p>
                </div>
                <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--color-secondary)' }}>
                  <TrendingDown size={18} /> -2% this month
                </div>
              </div>
              <div className="flex items-end justify-between gap-4 h-64">
                {retentionTrends.map((t, i) => {
                  const h = (t.rate / maxRate) * 100;
                  return (
                    <div key={t.month} className="flex-1 flex flex-col items-center gap-3">
                      <motion.div
                        initial={{ height: 0 }} animate={{ height: `${h}%` }}
                        transition={{ delay: 0.3 + i * 0.06, duration: 0.5 }}
                        className="w-full rounded-t-xl relative group"
                        style={{ background: 'var(--color-primary)' }}>
                        <div className="absolute -top-8 left-1/2 -translate-x-1/2 px-2.5 py-1 rounded-lg text-xs text-white opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap"
                          style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}>
                          {t.rate}%
                        </div>
                      </motion.div>
                      <span className="text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>{t.month}</span>
                    </div>
                  );
                })}
              </div>
            </Card>
          </motion.div>

          {/* At-Risk members */}
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
            <Card>
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-xl font-semibold text-white flex items-center gap-2">
                    <AlertTriangle size={20} style={{ color: 'var(--color-secondary)' }} />
                    At-Risk Members
                  </h3>
                  <p className="text-sm mt-1" style={{ color: 'var(--color-text-muted)' }}>
                    Members with declining attendance patterns
                  </p>
                </div>
                <Button variant="secondary" onClick={() => exportToCSV(atRiskMembers, 'at-risk-members.csv')}>
                  Export List
                </Button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--color-border)' }}>
                      {['Member', 'Last Visit', 'Days Inactive', 'Attendance Rate', 'Risk', 'Re-Engagement'].map(h => (
                        <th key={h} className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wider"
                          style={{ color: 'var(--color-text-muted)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {atRiskMembers.map(m => (
                      <tr key={m.id} style={{ borderBottom: '1px solid var(--color-border)' }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-surface-raised)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                        <td className="py-4 px-4">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-sm"
                              style={{ background: 'var(--color-primary)' }}>{m.name[0]}</div>
                            <div>
                              <p className="text-white font-medium">{m.name}</p>
                              <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{m.membershipType}</p>
                            </div>
                          </div>
                        </td>
                        <td className="py-4 px-4">
                          <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                            <Calendar size={13} style={{ color: 'var(--color-text-muted)' }} />
                            {new Date(m.lastVisit).toLocaleDateString()}
                          </div>
                        </td>
                        <td className="py-4 px-4">
                          <span className="text-white font-semibold">{m.daysInactive} days</span>
                        </td>
                        <td className="py-4 px-4">
                          <div className="flex items-center gap-3">
                            <div className="w-24 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--color-border)' }}>
                              <div className="h-full"
                                style={{
                                  width: `${m.attendanceRate}%`,
                                  background: m.attendanceRate >= 50 ? 'var(--color-primary)' : 'var(--color-secondary)',
                                }} />
                            </div>
                            <span className="text-sm font-medium text-white">{m.attendanceRate}%</span>
                          </div>
                        </td>
                        <td className="py-4 px-4">
                          <Badge variant={getRiskBadgeVariant(m.riskLevel)}>{m.riskLevel.toUpperCase()}</Badge>
                        </td>
                        <td className="py-4 px-4">
                          <div className="flex items-center gap-2">
                            <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>{getReEngagementSuggestion(m)}</p>
                            <Button variant="ghost" size="sm"
                              onClick={() => showToast(`Re-engagement initiated for ${m.name}`, 'success')}>
                              Take Action
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </motion.div>
        </>
      )}

      {/* ─────────── STAFF VIEW ─────────── */}
      {role === 'Staff' && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              { label: 'Today\'s Check-ins', value: '34', icon: Calendar },
              { label: 'Pending Bookings',   value: '7',  icon: Clock },
              { label: 'Tasks To Do',        value: String(staffTasks.filter(t => !t.done).length), icon: ClipboardList },
            ].map((s) => {
              const Icon = s.icon;
              return (
                <Card key={s.label}>
                  <div className="flex items-start justify-between mb-3">
                    <div className="w-12 h-12 rounded-xl flex items-center justify-center"
                      style={{ background: 'var(--color-primary-light)' }}>
                      <Icon size={20} style={{ color: 'var(--color-primary)' }} />
                    </div>
                  </div>
                  <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>{s.label}</p>
                  <p className="text-3xl font-bold text-white mt-1">{s.value}</p>
                </Card>
              );
            })}
          </div>

          <Card>
            <h3 className="text-xl font-semibold text-white flex items-center gap-2 mb-4">
              <ClipboardList size={20} style={{ color: 'var(--color-secondary)' }} /> Operational Tasks
            </h3>
            <div className="space-y-2">
              {staffTasks.map(task => (
                <div key={task.id} className="flex items-center justify-between p-3 rounded-xl"
                  style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}>
                  <div className="flex items-center gap-3">
                    <CheckCircle size={18} style={{
                      color: task.done ? 'var(--color-primary)' : 'var(--color-text-muted)',
                    }} />
                    <div>
                      <p className="text-sm text-white font-medium">{task.task}</p>
                      <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Due: {task.due}</p>
                    </div>
                  </div>
                  <Badge variant={task.priority === 'high' ? 'Pending' : task.priority === 'medium' ? 'Standard' : 'Inactive'}>
                    {task.priority.toUpperCase()}
                  </Badge>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <h3 className="text-xl font-semibold text-white mb-4">At-Risk Members (action required)</h3>
            <div className="space-y-2">
              {atRiskMembers.filter(m => m.riskLevel !== 'low').map(m => (
                <div key={m.id} className="flex items-center justify-between p-3 rounded-xl"
                  style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}>
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-sm"
                      style={{ background: 'var(--color-primary)' }}>{m.name[0]}</div>
                    <div>
                      <p className="text-sm text-white font-medium">{m.name}</p>
                      <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{m.daysInactive} days inactive</p>
                    </div>
                  </div>
                  <Button variant="secondary" size="sm"
                    onClick={() => showToast(`Reminder sent to ${m.name}`, 'success')}>
                    Send Reminder
                  </Button>
                </div>
              ))}
            </div>
          </Card>
        </>
      )}

      {/* ─────────── MEMBER VIEW ─────────── */}
      {role === 'Member' && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card>
              <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-3"
                style={{ background: 'var(--color-primary-light)' }}>
                <Activity size={20} style={{ color: 'var(--color-primary)' }} />
              </div>
              <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Visits This Month</p>
              <p className="text-3xl font-bold text-white mt-1">
                {personal.attendanceThisMonth}
                <span className="text-base ml-1" style={{ color: 'var(--color-text-muted)' }}>
                  / {personal.attendanceGoal}
                </span>
              </p>
              <div className="w-full h-1.5 rounded-full mt-3 overflow-hidden" style={{ background: 'var(--color-border)' }}>
                <div className="h-full rounded-full"
                  style={{
                    width: `${(personal.attendanceThisMonth / personal.attendanceGoal) * 100}%`,
                    background: 'var(--color-secondary)',
                  }} />
              </div>
            </Card>

            <Card>
              <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-3"
                style={{ background: 'var(--color-secondary-light)' }}>
                <Flame size={20} style={{ color: 'var(--color-secondary)' }} />
              </div>
              <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Current Streak</p>
              <p className="text-3xl font-bold text-white mt-1">{personal.streakDays} days</p>
            </Card>

            <Card>
              <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-3"
                style={{ background: 'var(--color-primary-light)' }}>
                <Calendar size={20} style={{ color: 'var(--color-primary)' }} />
              </div>
              <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Member Since</p>
              <p className="text-xl font-bold text-white mt-1">{personal.memberSince}</p>
              <Badge variant={personal.membershipStatus} className="mt-2">{personal.membershipStatus}</Badge>
            </Card>
          </div>

          <Card>
            <h3 className="text-xl font-semibold text-white mb-1">Your retention summary</h3>
            <p className="text-sm mb-4" style={{ color: 'var(--color-text-muted)' }}>
              Membership renewal: <span className="text-white font-semibold">{personal.nextRenewal}</span>
            </p>
            <h4 className="text-sm font-semibold text-white mb-2 mt-4">Recent Activity</h4>
            <div className="space-y-2">
              {personal.recentActivity.map(a => (
                <div key={a} className="flex items-center gap-3 p-3 rounded-xl"
                  style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}>
                  <div className="w-8 h-8 rounded-full flex items-center justify-center"
                    style={{ background: 'var(--color-primary-light)' }}>
                    <CheckCircle size={14} style={{ color: 'var(--color-primary)' }} />
                  </div>
                  <p className="text-sm text-white">{a}</p>
                </div>
              ))}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
