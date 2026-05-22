import { useState } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import { DollarSign, TrendingUp, CreditCard, Calendar, Download, ArrowUp, Plus, X } from 'lucide-react';
import { exportToCSV } from '../utils/toast';

interface Service {
  id: string;
  name: string;
  tier: 'Basic' | 'Standard' | 'Premium';
  price: number;
  active: boolean;
}

const initialServices: Service[] = [
  { id: '1', name: 'Monthly Basic', tier: 'Basic', price: 800, active: true },
  { id: '2', name: 'Monthly Standard', tier: 'Standard', price: 1500, active: true },
  { id: '3', name: 'Monthly Premium', tier: 'Premium', price: 2500, active: true },
  { id: '4', name: 'Per Session', tier: 'Basic', price: 100, active: true },
  { id: '5', name: 'Personal Training', tier: 'Premium', price: 500, active: false },
];

const pieData = [
  { name: 'Basic', value: 24000, color: 'var(--color-border)' },
  { name: 'Standard', value: 58500, color: 'var(--color-secondary)' },
  { name: 'Premium', value: 162500, color: 'var(--color-primary)' },
];

const PIE_COLORS = ['#6b7280', '#F59E0B', '#7C3AED'];

export default function Revenue() {
  const [services, setServices] = useState<Service[]>(initialServices);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newService, setNewService] = useState({ name: '', tier: 'Basic' as Service['tier'], price: '' });

  const revenueStats = [
    { label: 'Total Revenue', value: '₱245,000', change: '+12%', icon: DollarSign },
    { label: 'This Month', value: '₱52,000', change: '+8%', icon: Calendar },
    { label: 'Avg per Member', value: '₱1,570', change: '+5%', icon: TrendingUp },
    { label: 'Pending', value: '₱8,500', change: '-3', icon: CreditCard },
  ];

  const monthlyData = [
    { month: 'January', newMembers: 12, renewals: 108, revenue: 180000, growth: '+5%' },
    { month: 'February', newMembers: 15, renewals: 115, revenue: 195000, growth: '+8%' },
    { month: 'March', newMembers: 18, renewals: 122, revenue: 210000, growth: '+8%' },
    { month: 'April', newMembers: 14, renewals: 134, revenue: 225000, growth: '+7%' },
    { month: 'May', newMembers: 16, renewals: 140, revenue: 245000, growth: '+9%' },
  ];

  const toggleService = (id: string) => {
    setServices(prev => prev.map(s => s.id === id ? { ...s, active: !s.active } : s));
  };

  const handleAddService = () => {
    if (!newService.name || !newService.price) return;
    const created: Service = {
      id: `s-${Date.now()}`,
      name: newService.name,
      tier: newService.tier,
      price: Number(newService.price),
      active: true,
    };
    setServices(prev => [...prev, created]);
    setNewService({ name: '', tier: 'Basic', price: '' });
    setShowAddForm(false);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Revenue Reports</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--color-text-muted)' }}>
            Financial performance and revenue analytics
          </p>
        </div>
        <Button variant="outline" onClick={() => exportToCSV([], 'revenue-report.csv')}>
          <Download size={16} />
          Export Report
        </Button>
      </div>

      {/* Stats Row — 4 compact KPI pills */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {revenueStats.map((stat) => {
          const Icon = stat.icon;
          return (
            <div
              key={stat.label}
              className="flex items-center gap-3 rounded-full px-4 py-2"
              style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
            >
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ background: 'var(--color-primary-light)' }}
              >
                <Icon size={16} style={{ color: 'var(--color-primary)' }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] truncate" style={{ color: 'var(--color-text-muted)' }}>{stat.label}</p>
                <p className="text-sm font-bold text-white">{stat.value}</p>
              </div>
              <span className="text-xs font-semibold flex items-center gap-0.5" style={{ color: 'var(--color-secondary)' }}>
                <ArrowUp size={12} /> {stat.change}
              </span>
            </div>
          );
        })}
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* LEFT — 2/3 */}
        <div className="lg:col-span-2 space-y-6">
          {/* Pie Chart */}
          <Card>
            <h3 className="text-lg font-semibold text-white mb-4">Revenue by Plan</h3>
            <div className="flex flex-col md:flex-row items-center gap-6">
              <div className="w-full md:w-1/2" style={{ height: 220 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={90}
                      dataKey="value"
                      stroke="none"
                    >
                      {pieData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={PIE_COLORS[index]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        background: 'var(--color-surface-raised)',
                        border: '1px solid var(--color-border)',
                        borderRadius: 12,
                        color: '#fff',
                      }}
                      formatter={(value: number) => [`₱${value.toLocaleString()}`, 'Revenue']}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-3 w-full md:w-1/2">
                {pieData.map((item, i) => (
                  <div key={item.name} className="flex items-center gap-3">
                    <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: PIE_COLORS[i] }} />
                    <div className="flex-1">
                      <p className="text-sm text-white font-medium">{item.name}</p>
                      <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                        ₱{item.value.toLocaleString()}
                      </p>
                    </div>
                    <Badge variant={item.name as 'Basic' | 'Standard' | 'Premium'}>{item.name}</Badge>
                  </div>
                ))}
              </div>
            </div>
          </Card>

          {/* Monthly Breakdown Table */}
          <Card>
            <h3 className="text-lg font-semibold text-white mb-4">Monthly Breakdown</h3>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                    <th className="text-left py-3 px-4 text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>Month</th>
                    <th className="text-left py-3 px-4 text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>New Members</th>
                    <th className="text-left py-3 px-4 text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>Renewals</th>
                    <th className="text-left py-3 px-4 text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>Total Revenue</th>
                    <th className="text-left py-3 px-4 text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>Growth</th>
                  </tr>
                </thead>
                <tbody>
                  {monthlyData.map((row) => (
                    <tr key={row.month} style={{ borderBottom: '1px solid var(--color-border)' }}>
                      <td className="py-3 px-4 text-sm text-white font-medium">{row.month}</td>
                      <td className="py-3 px-4 text-sm" style={{ color: 'var(--color-text-secondary)' }}>{row.newMembers}</td>
                      <td className="py-3 px-4 text-sm" style={{ color: 'var(--color-text-secondary)' }}>{row.renewals}</td>
                      <td className="py-3 px-4 text-sm text-white font-bold">₱{row.revenue.toLocaleString()}</td>
                      <td className="py-3 px-4">
                        <span className="text-xs font-semibold flex items-center gap-0.5" style={{ color: 'var(--color-secondary)' }}>
                          <ArrowUp size={12} /> {row.growth}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        {/* RIGHT — 1/3: Service Management */}
        <div className="space-y-4">
          <Card>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">Service Management</h3>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowAddForm(s => !s)}
              >
                {showAddForm ? <X size={14} /> : <Plus size={14} />}
                {showAddForm ? 'Close' : 'Add'}
              </Button>
            </div>

            {/* Add Service Form */}
            {showAddForm && (
              <div
                className="rounded-xl p-3 mb-4 space-y-2"
                style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}
              >
                <input
                  value={newService.name}
                  onChange={e => setNewService({ ...newService, name: e.target.value })}
                  placeholder="Service name"
                  className="w-full px-3 h-9 rounded-lg text-sm text-white focus:outline-none"
                  style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}
                />
                <select
                  value={newService.tier}
                  onChange={e => setNewService({ ...newService, tier: e.target.value as Service['tier'] })}
                  className="w-full px-3 h-9 rounded-lg text-sm text-white focus:outline-none"
                  style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}
                >
                  <option value="Basic">Basic</option>
                  <option value="Standard">Standard</option>
                  <option value="Premium">Premium</option>
                </select>
                <input
                  type="number"
                  value={newService.price}
                  onChange={e => setNewService({ ...newService, price: e.target.value })}
                  placeholder="Price (₱)"
                  className="w-full px-3 h-9 rounded-lg text-sm text-white focus:outline-none"
                  style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}
                />
                <Button variant="secondary" size="sm" className="w-full" onClick={handleAddService}>
                  Save Service
                </Button>
              </div>
            )}

            {/* Service List */}
            <div className="space-y-2">
              {services.map(service => (
                <div
                  key={service.id}
                  className="flex items-center gap-3 rounded-xl p-3"
                  style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white font-medium truncate">{service.name}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant={service.tier}>{service.tier}</Badge>
                      <span className="text-xs font-bold" style={{ color: 'var(--color-secondary)' }}>
                        ₱{service.price.toLocaleString()}
                      </span>
                    </div>
                  </div>
                  {/* Toggle switch */}
                  <button
                    onClick={() => toggleService(service.id)}
                    className="relative w-10 h-5 rounded-full transition-colors flex-shrink-0"
                    style={{
                      background: service.active ? 'var(--color-primary)' : 'var(--color-border)',
                    }}
                  >
                    <div
                      className="absolute top-0.5 w-4 h-4 rounded-full transition-transform"
                      style={{
                        background: '#fff',
                        transform: service.active ? 'translateX(22px)' : 'translateX(2px)',
                      }}
                    />
                  </button>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
