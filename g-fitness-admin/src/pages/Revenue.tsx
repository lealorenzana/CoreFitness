import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import Button from '../components/ui/Button';
import { PageHeader, StatTiles, Section, EmptyState, OpenChevron } from '../components/ui/kit';
import {
  Banknote, TrendingUp, Clock, Calendar, Download, ArrowRight, CreditCard,
  ChartPie as PieIcon,
} from 'lucide-react';
import { exportToCSV } from '../utils/exportUtils';
import { showToast } from '../utils/toast';
import { formatCurrency } from '../utils/formatters';
import {
  dashboardService,
  type RevenueSummary, type MonthlyBreakdown, type TierRevenue,
} from '../services/dashboardService';
import { listPlans } from '../lib/api/membershipPlans';
import type { MembershipPlanRow } from '../types/db';

const PIE_COLORS = ['#7C3AED', '#F59E0B', 'var(--color-primary)', '#6b7280', 'var(--color-secondary)'];

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
    <div className="space-y-4">
      <PageHeader
        title="Revenue"
        subtitle="Financial performance from recorded cash payments"
        actions={
          <Button variant="outline" size="sm" onClick={() => exportToCSV(exportRows, `revenue-${year}`)}>
            <Download size={14} /> Export {year}
          </Button>
        }
      />

      {/* Real figures, no invented growth badges.
          These were four pills on a 4-column grid — 350px each to hold a peso
          figure, stretched because the grid said so rather than because the
          numbers needed it. */}
      <StatTiles items={stats.map((s) => ({
        label: s.label,
        value: s.value,
        icon: s.icon,
        // Money owed is the one figure here that is a task, not a result.
        tone: s.label === 'Pending Payments' ? 'secondary' : 'primary',
      }))} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
        {/* LEFT — 2/3 */}
        <div className="lg:col-span-2 space-y-4">
          {/* Revenue by plan */}
          <Section title="Revenue by plan" icon={PieIcon}>
            {loading ? (
              <p className="py-10 text-center text-sm" style={{ color: 'var(--color-text-muted)' }}>Loading…</p>
            ) : byTier.length === 0 ? (
              <EmptyState icon={Banknote} title="No completed payments yet"
                hint="Record a payment on the Payments page and this chart fills in." />
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
          </Section>

          {/* Monthly breakdown */}
          <Section
            title="Monthly breakdown" icon={Calendar}
            actions={
              <select value={year} onChange={(e) => setYear(e.target.value)}
                className="h-9 px-3 rounded-lg text-xs font-medium cursor-pointer"
                style={{ background: 'var(--color-surface-high)', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}>
                {years.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            }
          >
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
              <EmptyState compact icon={Calendar} title={`Nothing recorded in ${year}`}
                hint="Pick another year, or record a payment to start the ledger." />
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

                  <div className="flex flex-wrap gap-2 mt-4 pt-3"
                    style={{ borderTop: '1px solid var(--color-border)' }}>
                    {[
                      { label: `${year} revenue`, value: `₱${totalRev.toLocaleString()}`, tone: 'var(--color-secondary)' },
                      { label: 'Payments taken', value: String(totalPay), tone: 'var(--color-text-primary)' },
                      { label: 'New members', value: String(totalNew), tone: 'var(--color-text-primary)' },
                    ].map((t) => (
                      <div key={t.label} className="px-3 py-1.5 rounded-lg" style={{ background: 'var(--color-surface-high)' }}>
                        <p className="text-[9px] uppercase tracking-wide" style={{ color: 'var(--color-text-muted)' }}>{t.label}</p>
                        <p className="text-base font-bold tabular-nums" style={{ color: t.tone }}>{t.value}</p>
                      </div>
                    ))}
                  </div>
                </>
              );
            })()}
          </Section>
        </div>

        {/* RIGHT — 1/3: the real plan catalogue.
            Read-only here on purpose; the plans page owns editing them. Each
            row is a link to it rather than a dead row above one button. */}
        <Section
          title="Membership plans" icon={CreditCard} count={plans.length}
          actions={
            <Button variant="ghost" size="sm" onClick={() => navigate('/membership-plans')}>
              Manage <ArrowRight size={12} />
            </Button>
          }
        >
          <p className="text-[10px] mb-2.5 -mt-1" style={{ color: 'var(--color-text-muted)' }}>
            What members are actually billed against.
          </p>
          {plans.length === 0 ? (
            <EmptyState compact icon={CreditCard} title="No plans yet"
              hint="Nothing can be sold until a plan exists."
              action={<Button variant="secondary" size="sm" onClick={() => navigate('/membership-plans')}>Create one</Button>} />
          ) : (
            <div className="space-y-1.5">
              {plans.map((plan) => (
                <button key={plan.id} onClick={() => navigate('/membership-plans')}
                  className="w-full text-left flex items-center gap-2.5 rounded-lg px-2.5 py-2 group transition-colors"
                  style={{
                    background: 'var(--color-surface-high)',
                    opacity: plan.is_active ? 1 : 0.5,
                  }}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-[12px] text-white font-semibold truncate">{plan.name}</p>
                      {!plan.is_active && (
                        <span className="text-[9px] px-1.5 rounded-full flex-shrink-0"
                          style={{ background: 'var(--color-border)', color: 'var(--color-text-muted)' }}>
                          retired
                        </span>
                      )}
                    </div>
                    <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
                      <span className="font-bold" style={{ color: 'var(--color-secondary)' }}>
                        ₱{Number(plan.price).toLocaleString()}
                      </span>
                      {' · '}
                      {/* A NULL duration is "never expires", which is a real
                          plan setting and not a missing number. */}
                      {plan.duration_days == null ? 'no expiry' : `${plan.duration_days} days`}
                    </p>
                  </div>
                  <OpenChevron />
                </button>
              ))}
            </div>
          )}
        </Section>
      </div>
    </div>
  );
}
