import { motion, AnimatePresence } from 'framer-motion';
import { useState } from 'react';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import { Plus, Edit2, Trash2, X, Check, Users, DollarSign } from 'lucide-react';
import { showToast } from '../utils/toast';

interface MembershipPlan {
  id: string;
  name: string;
  type: 'Basic' | 'Standard' | 'Premium';
  price: number;
  duration: number; // in months
  features: string[];
  activeMembers: number;
  status: 'Active' | 'Inactive';
  description: string;
}

const MOCK_PLANS: MembershipPlan[] = [
  {
    id: 'plan-001',
    name: 'Basic Plan',
    type: 'Basic',
    price: 500,
    duration: 1,
    features: [
      'Access to gym equipment',
      'Locker room access',
      'Basic workout guidance',
    ],
    activeMembers: 45,
    status: 'Active',
    description: 'Perfect for beginners starting their fitness journey',
  },
  {
    id: 'plan-002',
    name: 'Standard Plan',
    type: 'Standard',
    price: 1200,
    duration: 1,
    features: [
      'All Basic features',
      'Group fitness classes',
      'Nutrition consultation',
      'Progress tracking',
      'Free gym merchandise',
    ],
    activeMembers: 78,
    status: 'Active',
    description: 'Most popular choice for regular gym-goers',
  },
  {
    id: 'plan-003',
    name: 'Premium Plan',
    type: 'Premium',
    price: 2500,
    duration: 1,
    features: [
      'All Standard features',
      'Personal training sessions',
      'Customized workout plans',
      'Priority booking',
      'Trainer evaluation access',
      'Guest passes (2/month)',
      'Spa & sauna access',
    ],
    activeMembers: 32,
    status: 'Active',
    description: 'Complete fitness experience with personal attention',
  },
  {
    id: 'plan-004',
    name: 'Basic Quarterly',
    type: 'Basic',
    price: 1350,
    duration: 3,
    features: [
      'Access to gym equipment',
      'Locker room access',
      'Basic workout guidance',
      '10% discount vs monthly',
    ],
    activeMembers: 28,
    status: 'Active',
    description: '3-month commitment with savings',
  },
];

const emptyForm = {
  name: '',
  type: 'Standard' as const,
  price: '',
  duration: '1',
  description: '',
  status: 'Active' as const,
};

export default function MembershipPlans() {
  const [plans, setPlans] = useState<MembershipPlan[]>(() => {
    try {
      const s = localStorage.getItem('admin_membership_plans');
      if (s) return JSON.parse(s);
    } catch {}
    localStorage.setItem('admin_membership_plans', JSON.stringify(MOCK_PLANS));
    return MOCK_PLANS;
  });

  const [showModal, setShowModal] = useState(false);
  const [editingPlan, setEditingPlan] = useState<MembershipPlan | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [features, setFeatures] = useState<string[]>([]);
  const [newFeature, setNewFeature] = useState('');

  const savePlans = (updated: MembershipPlan[]) => {
    setPlans(updated);
    localStorage.setItem('admin_membership_plans', JSON.stringify(updated));
  };

  const openAdd = () => {
    setEditingPlan(null);
    setForm(emptyForm);
    setFeatures([]);
    setShowModal(true);
  };

  const openEdit = (plan: MembershipPlan) => {
    setEditingPlan(plan);
    setForm({
      name: plan.name,
      type: plan.type,
      price: String(plan.price),
      duration: String(plan.duration),
      description: plan.description,
      status: plan.status,
    });
    setFeatures([...plan.features]);
    setShowModal(true);
  };

  const handleSave = () => {
    if (!form.name.trim() || !form.price || features.length === 0) {
      showToast('Name, price, and at least one feature are required', 'error');
      return;
    }

    if (editingPlan) {
      const updated = plans.map(p =>
        p.id === editingPlan.id
          ? { ...p, ...form, price: Number(form.price), duration: Number(form.duration), features }
          : p
      );
      savePlans(updated);
      showToast('Plan updated!', 'success');
    } else {
      const created: MembershipPlan = {
        id: `plan-${Date.now()}`,
        ...form,
        price: Number(form.price),
        duration: Number(form.duration),
        features,
        activeMembers: 0,
      };
      savePlans([created, ...plans]);
      showToast('Plan created!', 'success');
    }
    setShowModal(false);
  };

  const handleDelete = (id: string) => {
    const plan = plans.find(p => p.id === id);
    if (plan && plan.activeMembers > 0) {
      showToast(`Cannot delete plan with ${plan.activeMembers} active members`, 'error');
      return;
    }
    if (!window.confirm('Delete this membership plan?')) return;
    savePlans(plans.filter(p => p.id !== id));
    showToast('Plan deleted', 'success');
  };

  const addFeature = () => {
    if (!newFeature.trim()) return;
    setFeatures([...features, newFeature.trim()]);
    setNewFeature('');
  };

  const removeFeature = (index: number) => {
    setFeatures(features.filter((_, i) => i !== index));
  };

  const getPlanColor = (type: string) => {
    switch (type) {
      case 'Basic': return 'var(--color-text-muted)';
      case 'Standard': return 'var(--color-primary)';
      case 'Premium': return 'var(--color-secondary)';
      default: return 'var(--color-text-muted)';
    }
  };

  const totalRevenue = plans.reduce((sum, p) => sum + (p.price * p.activeMembers), 0);
  const totalMembers = plans.reduce((sum, p) => sum + p.activeMembers, 0);

  return (
    <div className="space-y-5">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Membership Plans</h1>
          <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>Manage membership plans and pricing</p>
        </div>
        <Button variant="secondary" onClick={openAdd}>
          <Plus size={16} /> Create Plan
        </Button>
      </motion.div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Total Plans', value: plans.length, icon: DollarSign },
          { label: 'Active Members', value: totalMembers, icon: Users },
          { label: 'Monthly Revenue', value: `₱${totalRevenue.toLocaleString()}`, icon: DollarSign },
          { label: 'Avg Price', value: `₱${Math.round(plans.reduce((s, p) => s + p.price, 0) / plans.length)}`, icon: DollarSign },
        ].map(s => {
          const Icon = s.icon;
          return (
            <div key={s.label} className="rounded-xl p-3 flex items-center gap-3"
              style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}>
              <Icon size={16} style={{ color: 'var(--color-primary)' }} />
              <div>
                <p className="text-[10px] uppercase" style={{ color: 'var(--color-text-muted)' }}>{s.label}</p>
                <p className="text-lg font-bold text-white">{s.value}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Plans Grid */}
      <div className="grid grid-cols-2 gap-4">
        {plans.map((plan, i) => (
          <motion.div key={plan.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
            <Card className="!p-4">
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-bold text-white mb-1">{plan.name}</h3>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
                      style={{ background: `${getPlanColor(plan.type)}20`, color: getPlanColor(plan.type) }}>
                      {plan.type}
                    </span>
                    <Badge variant={plan.status === 'Active' ? 'Active' : 'Expired'}>{plan.status}</Badge>
                  </div>
                </div>
                <div className="flex items-center gap-1 ml-2 flex-shrink-0">
                  <button onClick={() => openEdit(plan)} className="p-1.5 rounded-lg"
                    style={{ background: 'var(--color-primary-light)', color: 'var(--color-primary)' }}>
                    <Edit2 size={11} />
                  </button>
                  <button onClick={() => handleDelete(plan.id)} className="p-1.5 rounded-lg"
                    style={{ background: 'var(--color-secondary-light)', color: 'var(--color-secondary)' }}>
                    <Trash2 size={11} />
                  </button>
                </div>
              </div>

              <p className="text-[10px] mb-3 line-clamp-2" style={{ color: 'var(--color-text-muted)' }}>{plan.description}</p>

              <div className="flex items-baseline gap-1 mb-3">
                <span className="text-2xl font-bold text-white">₱{plan.price}</span>
                <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
                  / {plan.duration} {plan.duration === 1 ? 'month' : 'months'}
                </span>
              </div>

              <div className="space-y-1.5 mb-3">
                {plan.features.slice(0, 4).map((feature, idx) => (
                  <div key={idx} className="flex items-start gap-2 text-[10px]" style={{ color: 'var(--color-text-secondary)' }}>
                    <Check size={10} className="mt-0.5 flex-shrink-0" style={{ color: 'var(--color-secondary)' }} />
                    <span className="flex-1">{feature}</span>
                  </div>
                ))}
                {plan.features.length > 4 && (
                  <p className="text-[9px] pl-4" style={{ color: 'var(--color-text-muted)' }}>
                    +{plan.features.length - 4} more features
                  </p>
                )}
              </div>

              <div className="pt-3" style={{ borderTop: '1px solid var(--color-border)' }}>
                <div className="flex items-center justify-between">
                  <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>Active Members</span>
                  <span className="text-sm font-bold text-white">{plan.activeMembers}</span>
                </div>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>Monthly Revenue</span>
                  <span className="text-sm font-bold" style={{ color: 'var(--color-secondary)' }}>
                    ₱{(plan.price * plan.activeMembers).toLocaleString()}
                  </span>
                </div>
              </div>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Create/Edit Modal */}
      <AnimatePresence>
        {showModal && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/70 z-50" onClick={() => setShowModal(false)} />
            <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
              <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
                className="w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden"
                style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
                onClick={e => e.stopPropagation()}>
                <div className="p-5 flex items-center justify-between" style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <h2 className="text-lg font-bold text-white">{editingPlan ? 'Edit Plan' : 'Create Membership Plan'}</h2>
                  <button onClick={() => setShowModal(false)} style={{ color: 'var(--color-text-muted)' }}><X size={18} /></button>
                </div>
                <div className="p-5 space-y-3 max-h-[500px] overflow-y-auto">
                  <div>
                    <label className="text-xs block mb-1" style={{ color: 'var(--color-text-muted)' }}>Plan Name *</label>
                    <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                      placeholder="e.g. Premium Plan"
                      className="w-full px-4 py-2.5 rounded-xl text-white text-sm focus:outline-none"
                      style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }} />
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="text-xs block mb-1" style={{ color: 'var(--color-text-muted)' }}>Type *</label>
                      <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value as any })}
                        className="w-full px-4 py-2.5 rounded-xl text-white text-sm focus:outline-none"
                        style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}>
                        <option value="Basic">Basic</option>
                        <option value="Standard">Standard</option>
                        <option value="Premium">Premium</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs block mb-1" style={{ color: 'var(--color-text-muted)' }}>Price (₱) *</label>
                      <input type="number" value={form.price} onChange={e => setForm({ ...form, price: e.target.value })}
                        placeholder="1200"
                        className="w-full px-4 py-2.5 rounded-xl text-white text-sm focus:outline-none"
                        style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }} />
                    </div>
                    <div>
                      <label className="text-xs block mb-1" style={{ color: 'var(--color-text-muted)' }}>Duration</label>
                      <select value={form.duration} onChange={e => setForm({ ...form, duration: e.target.value })}
                        className="w-full px-4 py-2.5 rounded-xl text-white text-sm focus:outline-none"
                        style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}>
                        <option value="1">1 month</option>
                        <option value="3">3 months</option>
                        <option value="6">6 months</option>
                        <option value="12">12 months</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs block mb-1" style={{ color: 'var(--color-text-muted)' }}>Description</label>
                    <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
                      placeholder="Brief description of the plan..."
                      rows={2}
                      className="w-full px-4 py-2.5 rounded-xl text-white text-sm focus:outline-none resize-none"
                      style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }} />
                  </div>
                  <div>
                    <label className="text-xs block mb-1" style={{ color: 'var(--color-text-muted)' }}>Status</label>
                    <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value as any })}
                      className="w-full px-4 py-2.5 rounded-xl text-white text-sm focus:outline-none"
                      style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}>
                      <option value="Active">Active</option>
                      <option value="Inactive">Inactive</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs block mb-2" style={{ color: 'var(--color-text-muted)' }}>Features *</label>
                    <div className="flex gap-2 mb-2">
                      <input value={newFeature} onChange={e => setNewFeature(e.target.value)}
                        onKeyPress={e => e.key === 'Enter' && addFeature()}
                        placeholder="Add a feature..."
                        className="flex-1 px-4 py-2 rounded-xl text-white text-sm focus:outline-none"
                        style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }} />
                      <button onClick={addFeature}
                        className="px-4 py-2 rounded-xl text-sm font-semibold text-black"
                        style={{ background: 'var(--color-secondary)' }}>
                        Add
                      </button>
                    </div>
                    <div className="space-y-1.5">
                      {features.map((feature, idx) => (
                        <div key={idx} className="flex items-center gap-2 p-2 rounded-lg"
                          style={{ background: 'var(--color-bg)' }}>
                          <Check size={12} style={{ color: 'var(--color-secondary)' }} />
                          <span className="flex-1 text-xs text-white">{feature}</span>
                          <button onClick={() => removeFeature(idx)} style={{ color: 'var(--color-text-muted)' }}>
                            <X size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="p-5 flex gap-3" style={{ borderTop: '1px solid var(--color-border)' }}>
                  <button onClick={() => setShowModal(false)}
                    className="flex-1 py-2.5 rounded-full font-semibold text-sm"
                    style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}>
                    Cancel
                  </button>
                  <button onClick={handleSave}
                    className="flex-1 py-2.5 rounded-full font-semibold text-sm text-black"
                    style={{ background: 'var(--color-secondary)' }}>
                    {editingPlan ? 'Save Changes' : 'Create Plan'}
                  </button>
                </div>
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
