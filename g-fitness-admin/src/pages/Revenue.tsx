import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import { Banknote, TrendingUp, Clock, Calendar, Download, ArrowRight } from 'lucide-react';
import { exportToCSV } from '../utils/exportUtils';
import { showToast } from '../utils/toast';
import { formatCurrency } from '../utils/formatters';
import {
  dashboardService,
  type RevenueSummary, type MonthlyBreakdown, type TierRevenue,
} from '../services/dashboardService';
import { listPlans } from '../lib/api/membershipPlans';
import type { MembershipPlanRow } from '../types/db';

const PIE_COLORS = ['#7C3AED', '#F59E0B', '#22c55e', '#6b7280', '#ef4444'];

export default function Revenue() {
  const navigate = useNavigate();
  const years = dashboardService.getYears();
  const [year, setYear] = useState(years[0]);

  const [summary, setSummary] = useState<RevenueSummary | null>(null);
  const [monthly, setMonthly] = useState<MonthlyBreakdown[]>([]);
  const [byTier, setByTier] = useState<TierRevenue[]>([]);
  const [plans, setPlans] = useState<MembershipPlanRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      dashboardService.getRevenueSummary(),
      dashboardService.getRevenueByTier(),
      listPlans(),
    ])
      .then(([s, t, p]) => {
        setSummary(s);
        setByTier(t);
        setPlans(p);
      })
      .catch((err) => showToast(err instanceof Error ? err.message : 'Failed to load revenue', 'error'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    dashboardService.getMonthlyBreakdown(year).then(setMonthly).catch(() => {});
  }, [year]);

  const stats = [
    { label: 'Total Revenue', value: summary ? formatCurrency(summary.totalRevenue) : '—', icon: Banknote },
    { label: 'This Month', value: summary ? formatCurrency(summary.thisMonth) : '—', icon: Calendar },
    { label: 'Avg per Paying Member', value: summary ? formatCurrency(summary.avgPerPayingMember) : '—', icon: TrendingUp },
    { label: 'Pending Payments', value: summary ? formatCurrency(summary.pendingAmount) : '—', icon: Clock },
  ];

  const exportRows = monthly.map((m) => ({
    Month: m.month,
    'New Members': m.newMembers,
    Payments: m.payments,
    Revenue: m.revenue,
  }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Revenue Reports</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--color-text-muted)' }}>
            Financial performance from recorded cash payments
          </p>
        </div>
        <Button variant="outline" onClick={() => exportToCSV(exportRows, `revenue-${year}`)}>
          <Download size={16} />
          Export Report
        </Button>
      </div>

      {/* KPI pills — real figures, no invented growth badges */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <div key={stat.label} className="flex items-center gap-3 rounded-full px-4 py-2"
              style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
              <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ background: 'var(--color-primary-light)' }}>
                <Icon size={16} style={{ color: 'var(--color-primary)' }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] truncate" style={{ color: 'var(--color-text-muted)' }}>{stat.label}</p>
                <p className="text-sm font-bold text-white">{stat.value}</p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* LEFT — 2/3 */}
        <div className="lg:col-span-2 space-y-6">
          {/* Revenue by plan */}
          <Card>
            <h3 className="text-lg font-semibold text-white mb-4">Revenue by Plan</h3>
            {loading ? (
              <p className="py-10 text-center text-sm" style={{ color: 'var(--color-text-muted)' }}>Loading…</p>
            ) : byTier.length === 0 ? (
              <p className="py-10 text-center text-sm" style={{ color: 'var(--color-text-muted)' }}>
                No completed payments yet — record a payment on the Payments page to see this chart.
              </p>
            ) : (
              <div className="flex flex-col md:flex-row items-center gap-6">
                <div className="w-full md:w-1/2" style={{ height: 220 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={byTier} cx="50%" cy="50%" innerRadius={50} outerRadius={90} dataKey="value" stroke="none">
                        {byTier.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          background: 'var(--color-surface-raised)',
                          border: '1px solid var(--color-border)',
                          borderRadius: 12,
                          color: '#fff',
                        }}
                        formatter={(value) => [`₱${Number(value).toLocaleString()}`, 'Revenue']}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-3 w-full md:w-1/2">
                  {byTier.map((item, i) => (
                    <div key={item.name} className="flex items-center gap-3">
                      <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                      <div className="flex-1">
                        <p className="text-sm text-white font-medium">{item.name}</p>
                        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                          ₱{item.value.toLocaleString()}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>

          {/* Monthly breakdown */}
          <Card>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">Monthly Breakdown</h3>
              <select value={year} onChange={(e) => setYear(e.target.value)}
                className="px-3 py-1.5 rounded-full text-xs font-medium cursor-pointer"
                style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}>
                {years.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            {/*
              Twelve full-width rows for a year where nine of them are ₱0 spent
              most of the page saying nothing. This is the same twelve months as
              a bar strip: each month is a column you can read at a glance, and
              only the months that actually had activity carry figures.

              Nothing is hidden — the totals row and every month's numbers are
              still here, and the tooltip carries the exact figures. What is
              gone is nine rows of zeros.
            */}
            {monthly.length === 0 ? (
              <p className="py-8 text-center text-sm" style={{ color: 'var(--color-text-muted)' }}>
                No data for {year}
              </p>
            ) : (() => {
              const peak = Math.max(...monthly.map((m) => m.revenue), 1);
              const totalRev = monthly.reduce((s, m) => s + m.revenue, 0);
              const totalNew = monthly.reduce((s, m) => s + m.newMembers, 0);
              const totalPay = monthly.reduce((s, m) => s + m.payments, 0);
              return (
                <>
                  <div className="flex items-end gap-1.5" style={{ height: 132 }}>
                    {monthly.map((row) => {
                      const active = row.revenue > 0 || row.newMembers > 0 || row.payments > 0;
                      return (
                        <div key={row.month} className="flex-1 flex flex-col items-center justify-end gap-1.5 h-full"
                          title={`${row.month} — ₱${row.revenue.toLocaleString()} · ${row.payments} payment${row.payments === 1 ? '' : 's'} · ${row.newMembers} new member${row.newMembers === 1 ? '' : 's'}`}>
                          {/* The amount sits above its own bar, so a reader
                              never has to match a column to a legend. */}
                          <span className="text-[9px] font-semibold tabular-nums"
                            style={{ color: active ? 'var(--color-secondary)' : 'transparent' }}>
                            {active ? `₱${row.revenue.toLocaleString()}` : '·'}
                          </span>
                          <div className="w-full rounded-t"
                            style={{
                              // A month with activity but no revenue still gets a
                              // visible stub, or "3 new members, ₱0" looks like
                              // nothing happened.
                              height: `${row.revenue > 0 ? Math.max(6, (row.revenue / peak) * 88) : active ? 3 : 2}px`,
                              background: row.revenue > 0 ? 'var(--color-secondary)'
                                : active ? 'var(--color-primary)' : 'var(--color-border)',
                            }} />
                          <span className="text-[9px]"
                            style={{ color: active ? 'var(--color-text-secondary)' : 'var(--color-text-muted)' }}>
                            {row.month.slice(0, 3)}
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  <div className="grid grid-cols-3 gap-3 mt-4 pt-3"
                    style={{ borderTop: '1px solid var(--color-border)' }}>
                    {[
                      { label: `${year} revenue`, value: `₱${totalRev.toLocaleString()}`, tone: 'var(--color-secondary)' },
                      { label: 'Payments taken', value: String(totalPay), tone: 'var(--color-text-primary)' },
                      { label: 'New members', value: String(totalNew), tone: 'var(--color-text-primary)' },
                    ].map((t) => (
                      <div key={t.label}>
                        <p className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--color-text-muted)' }}>{t.label}</p>
                        <p className="text-lg font-bold tabular-nums" style={{ color: t.tone }}>{t.value}</p>
                      </div>
                    ))}
                  </div>
                </>
              );
            })()}
          </Card>
        </div>

        {/* RIGHT — 1/3: the real plan catalogue */}
        <div className="space-y-4">
          <Card>
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-lg font-semibold text-white">Membership Plans</h3>
            </div>
            <p className="text-[11px] mb-4" style={{ color: 'var(--color-text-muted)' }}>
              These are the real plans members are billed against. Edit them on the Membership Plans page.
            </p>

            <div className="space-y-2">
              {plans.length === 0 ? (
                <p className="text-xs py-4 text-center" style={{ color: 'var(--color-text-muted)' }}>No plans defined yet.</p>
              ) : plans.map((plan) => (
                <div key={plan.id} className="flex items-center gap-3 rounded-xl p-3"
                  style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white font-medium truncate">{plan.name}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] px-2 py-0.5 rounded-full uppercase font-semibold"
                        style={{ background: 'var(--color-primary-light)', color: 'var(--color-primary)' }}>
                        {plan.tier}
                      </span>
                      <span className="text-xs font-bold" style={{ color: 'var(--color-secondary)' }}>
                        ₱{Number(plan.price).toLocaleString()}
                      </span>
                      <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
                        / {plan.duration_days == null ? 'no expiry' : `${plan.duration_days}d`}
                      </span>
                    </div>
                  </div>
                  {!plan.is_active && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full" style={{ background: 'var(--color-border)', color: 'var(--color-text-muted)' }}>
                      inactive
                    </span>
                  )}
                </div>
              ))}
            </div>

            <button onClick={() => navigate('/membership-plans')}
              className="w-full mt-3 py-2 rounded-full text-xs font-semibold flex items-center justify-center gap-1.5"
              style={{ background: 'var(--color-primary-light)', color: 'var(--color-primary)' }}>
              Manage Plans <ArrowRight size={12} />
            </button>
          </Card>
        </div>
      </div>
    </div>
  );
}
