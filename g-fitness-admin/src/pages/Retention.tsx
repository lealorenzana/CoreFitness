import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import { AlertTriangle, Users, Target, Activity } from 'lucide-react';
import { showToast } from '../utils/toast';
import { exportToCSV } from '../utils/exportUtils';
import { notifyUser } from '../lib/api/notify';
import {
  dashboardService,
  type AtRiskMemberRow, type RetentionSummary,
} from '../services/dashboardService';

export default function Retention() {
  const years = dashboardService.getYears();
  const [selectedYear, setSelectedYear] = useState(years[0]);
  const [atRiskMembers, setAtRiskMembers] = useState<AtRiskMemberRow[]>([]);
  const [summary, setSummary] = useState<RetentionSummary | null>(null);
  const [chartData, setChartData] = useState<{ month: string; rate: number }[]>([]);
  const [, setLoading] = useState(true);
  const [reachingOut, setReachingOut] = useState<string | null>(null);
  const [reachedOut, setReachedOut] = useState<Set<string>>(new Set());

  /**
   * What "at risk" is *for*.
   *
   * This button used to fire a toast reading "Rule action triggered" and do
   * nothing whatsoever — no row written, no message sent, no record that the
   * gym had noticed. A control that reports success and changes nothing is the
   * same class of lie as the admin "Remember me" that was a `useState` nobody
   * read, and it is worse here because it is on a screen about people the gym
   * is about to lose.
   *
   * It now sends the member a real notification: it lands in their inbox, and
   * pushes to their phone if they installed the app. That is the whole action —
   * deliberately not an automated campaign, because a gym of this size wins
   * people back with a message from a person, and an automatic one would go out
   * whether or not anyone meant it.
   *
   * The wording names how long it has been, because "we noticed" is the part
   * that works, and it is the one fact this screen actually knows.
   */
  const reachOut = async (m: AtRiskMemberRow) => {
    setReachingOut(m.id);
    try {
      await notifyUser({
        userId: m.id,
        type: 'system',
        title: 'We miss you at Core Fitness',
        message:
          `It has been ${m.daysInactive} days since your last visit. ` +
          'Nothing needs booking — just come in when you can, and tell the front desk ' +
          'if anything is getting in the way.',
        actionUrl: '/member/book-class',
      });
      setReachedOut((prev) => new Set(prev).add(m.id));
      showToast(`Message sent to ${m.name}`, 'success');
    } catch (err) {
      // Named, because the whole point is that the member actually hears from
      // the gym. A silent failure here would be the old bug with extra steps.
      showToast(err instanceof Error ? err.message : `Could not message ${m.name}`, 'error');
    } finally {
      setReachingOut(null);
    }
  };

  useEffect(() => {
    Promise.all([dashboardService.getAtRiskMembers(), dashboardService.getRetentionSummary()])
      .then(([rows, s]) => {
        setAtRiskMembers(rows);
        setSummary(s);
      })
      .catch((err) => showToast(err instanceof Error ? err.message : 'Failed to load retention data', 'error'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    dashboardService.getRetentionTrend(selectedYear).then(setChartData).catch(() => {});
  }, [selectedYear]);

  const retentionStats = [
    { label: 'At Risk Members', value: summary ? String(summary.atRisk) : '—', icon: AlertTriangle },
    { label: 'Retention Rate',  value: summary ? `${summary.retentionRate}%` : '—', icon: Target },
    { label: 'Avg. Attendance', value: summary ? `${summary.avgVisitsPerWeek}x/wk` : '—', icon: Activity },
    { label: 'Active Members',  value: summary ? String(summary.activeMembers) : '—', icon: Users },
  ];

  const getRiskBadgeVariant = (level: string) =>
    level === 'high' ? 'Suspended' : level === 'medium' ? 'Pending' : 'Active';

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
        <Button variant="secondary" onClick={() => exportToCSV(atRiskMembers, 'at-risk-members')}>
          Export List
        </Button>
      </motion.div>

      {/* Stats row — compact */}
      <div className="grid grid-cols-4 gap-3 flex-shrink-0">
        {retentionStats.map((stat) => {
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
                <p className="text-lg font-bold text-white">{stat.value}</p>
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
              <p className="text-[9px]" style={{ color: 'var(--color-text-muted)' }}>
                Share of members who checked in that month
              </p>
            </div>
            <div className="flex items-center gap-2">
              <select value={selectedYear} onChange={e => setSelectedYear(e.target.value)}
                className="text-[10px] font-semibold px-2 py-1 rounded-full cursor-pointer appearance-none"
                style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}>
                {years.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          </div>
          <div className="flex-1 p-3 min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                <XAxis dataKey="month" stroke="var(--color-text-muted)" tick={{ fill: '#9CA3AF', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis stroke="var(--color-text-muted)" tick={{ fill: '#9CA3AF', fontSize: 10 }} axisLine={false} tickLine={false} domain={[0, 100]} />
                <Tooltip contentStyle={{ backgroundColor: '#1E1B30', border: '1px solid var(--color-border)', borderRadius: 12, color: '#fff', fontSize: 11 }} formatter={(value) => [`${Number(value)}%`, "Retention"]} />
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
                          <p className="text-[8px]" style={{ color: 'var(--color-text-muted)' }}>{m.planName}</p>
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
                        disabled={reachingOut === m.id || reachedOut.has(m.id)}
                        onClick={() => reachOut(m)}>
                        {reachedOut.has(m.id) ? 'Sent'
                          : reachingOut === m.id ? 'Sending…' : 'Reach out'}
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
