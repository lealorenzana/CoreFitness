import { motion, AnimatePresence } from 'framer-motion';
import { useState } from 'react';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import { Plus, Edit2, Trash2, X, MapPin, Phone, Clock, Users, Dumbbell } from 'lucide-react';
import { showToast } from '../utils/toast';

interface Gym {
  id: string;
  name: string;
  address: string;
  phone: string;
  email: string;
  openingHours: string;
  capacity: number;
  activeMembers: number;
  trainers: number;
  amenities: string[];
  status: 'Active' | 'Maintenance' | 'Closed';
  image?: string;
}

const MOCK_GYMS: Gym[] = [
  {
    id: 'gym-001',
    name: 'G-Fitness Core',
    address: 'Mamburao, Occidental Mindoro',
    phone: '+63 912 345 6789',
    email: 'core@gfitness.com',
    openingHours: '5:00 AM - 10:00 PM',
    capacity: 150,
    activeMembers: 120,
    trainers: 5,
    amenities: ['Free Weights', 'Cardio Equipment', 'Locker Rooms', 'Shower Facilities', 'WiFi'],
    status: 'Active',
  },
  {
    id: 'gym-002',
    name: 'Fitness Regency',
    address: 'Rizal St, Mamburao',
    phone: '+63 912 345 6790',
    email: 'regency@gfitness.com',
    openingHours: '6:00 AM - 9:00 PM',
    capacity: 100,
    activeMembers: 85,
    trainers: 4,
    amenities: ['Free Weights', 'Cardio Equipment', 'Group Classes', 'Locker Rooms'],
    status: 'Active',
  },
  {
    id: 'gym-003',
    name: 'Ferrer Fitness Hub',
    address: 'Ferrer St, Mamburao',
    phone: '+63 912 345 6791',
    email: 'ferrer@gfitness.com',
    openingHours: '5:30 AM - 10:00 PM',
    capacity: 120,
    activeMembers: 95,
    trainers: 4,
    amenities: ['Free Weights', 'Cardio Equipment', 'Boxing Area', 'Locker Rooms', 'Parking'],
    status: 'Active',
  },
];

const emptyForm = {
  name: '',
  address: '',
  phone: '',
  email: '',
  openingHours: '6:00 AM - 9:00 PM',
  capacity: '100',
  status: 'Active' as const,
};

export default function GymManagement() {
  const [gyms, setGyms] = useState<Gym[]>(() => {
    try {
      const s = localStorage.getItem('admin_gyms');
      if (s) return JSON.parse(s);
    } catch {}
    localStorage.setItem('admin_gyms', JSON.stringify(MOCK_GYMS));
    return MOCK_GYMS;
  });

  const [showModal, setShowModal] = useState(false);
  const [editingGym, setEditingGym] = useState<Gym | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [viewGym, setViewGym] = useState<Gym | null>(null);

  const saveGyms = (updated: Gym[]) => {
    setGyms(updated);
    localStorage.setItem('admin_gyms', JSON.stringify(updated));
  };

  const openAdd = () => {
    setEditingGym(null);
    setForm(emptyForm);
    setShowModal(true);
  };

  const openEdit = (gym: Gym) => {
    setEditingGym(gym);
    setForm({
      name: gym.name,
      address: gym.address,
      phone: gym.phone,
      email: gym.email,
      openingHours: gym.openingHours,
      capacity: String(gym.capacity),
      status: gym.status,
    });
    setShowModal(true);
  };

  const handleSave = () => {
    if (!form.name.trim() || !form.address.trim()) {
      showToast('Name and address are required', 'error');
      return;
    }

    if (editingGym) {
      const updated = gyms.map(g =>
        g.id === editingGym.id
          ? { ...g, ...form, capacity: Number(form.capacity) }
          : g
      );
      saveGyms(updated);
      showToast('Gym updated!', 'success');
    } else {
      const created: Gym = {
        id: `gym-${Date.now()}`,
        ...form,
        capacity: Number(form.capacity),
        activeMembers: 0,
        trainers: 0,
        amenities: [],
      };
      saveGyms([created, ...gyms]);
      showToast('Gym created!', 'success');
    }
    setShowModal(false);
  };

  const handleDelete = (id: string) => {
    if (!window.confirm('Delete this gym? This action cannot be undone.')) return;
    saveGyms(gyms.filter(g => g.id !== id));
    showToast('Gym deleted', 'success');
  };

  const getOccupancyPercentage = (gym: Gym) => {
    return Math.round((gym.activeMembers / gym.capacity) * 100);
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Gym Management</h1>
          <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>Manage gym branches and facilities</p>
        </div>
        <Button variant="secondary" onClick={openAdd}>
          <Plus size={16} /> Add Gym Branch
        </Button>
      </motion.div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Total Gyms', value: gyms.length, icon: Dumbbell },
          { label: 'Total Capacity', value: gyms.reduce((s, g) => s + g.capacity, 0), icon: Users },
          { label: 'Active Members', value: gyms.reduce((s, g) => s + g.activeMembers, 0), icon: Users },
          { label: 'Total Trainers', value: gyms.reduce((s, g) => s + g.trainers, 0), icon: Users },
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

      {/* Gyms Grid */}
      <div className="grid grid-cols-2 gap-4">
        {gyms.map((gym, i) => {
          const occupancy = getOccupancyPercentage(gym);
          return (
            <motion.div key={gym.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
              <Card className="!p-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-bold text-white mb-1">{gym.name}</h3>
                    <Badge variant={gym.status === 'Active' ? 'Active' : gym.status === 'Maintenance' ? 'Pending' : 'Expired'}>
                      {gym.status}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-1 ml-2 flex-shrink-0">
                    <button onClick={() => openEdit(gym)} className="p-1.5 rounded-lg"
                      style={{ background: 'var(--color-primary-light)', color: 'var(--color-primary)' }}>
                      <Edit2 size={11} />
                    </button>
                    <button onClick={() => handleDelete(gym.id)} className="p-1.5 rounded-lg"
                      style={{ background: 'var(--color-secondary-light)', color: 'var(--color-secondary)' }}>
                      <Trash2 size={11} />
                    </button>
                  </div>
                </div>

                <div className="space-y-2 mb-3">
                  <div className="flex items-start gap-2 text-[10px]" style={{ color: 'var(--color-text-secondary)' }}>
                    <MapPin size={10} className="mt-0.5 flex-shrink-0" style={{ color: 'var(--color-primary)' }} />
                    <span className="flex-1">{gym.address}</span>
                  </div>
                  <div className="flex items-center gap-2 text-[10px]" style={{ color: 'var(--color-text-secondary)' }}>
                    <Phone size={10} style={{ color: 'var(--color-primary)' }} />
                    <span>{gym.phone}</span>
                  </div>
                  <div className="flex items-center gap-2 text-[10px]" style={{ color: 'var(--color-text-secondary)' }}>
                    <Clock size={10} style={{ color: 'var(--color-primary)' }} />
                    <span>{gym.openingHours}</span>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 mb-3">
                  <div className="rounded-lg p-2" style={{ background: 'var(--color-bg)' }}>
                    <p className="text-[9px] uppercase" style={{ color: 'var(--color-text-muted)' }}>Capacity</p>
                    <p className="text-xs font-bold text-white">{gym.capacity}</p>
                  </div>
                  <div className="rounded-lg p-2" style={{ background: 'var(--color-bg)' }}>
                    <p className="text-[9px] uppercase" style={{ color: 'var(--color-text-muted)' }}>Members</p>
                    <p className="text-xs font-bold text-white">{gym.activeMembers}</p>
                  </div>
                  <div className="rounded-lg p-2" style={{ background: 'var(--color-bg)' }}>
                    <p className="text-[9px] uppercase" style={{ color: 'var(--color-text-muted)' }}>Trainers</p>
                    <p className="text-xs font-bold text-white">{gym.trainers}</p>
                  </div>
                </div>

                <div className="mb-2">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[9px] uppercase" style={{ color: 'var(--color-text-muted)' }}>Occupancy</span>
                    <span className="text-[9px] font-bold" style={{ color: occupancy > 80 ? '#ef4444' : 'var(--color-secondary)' }}>
                      {occupancy}%
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--color-bg)' }}>
                    <div className="h-full rounded-full transition-all"
                      style={{ width: `${occupancy}%`, background: occupancy > 80 ? '#ef4444' : 'var(--color-secondary)' }} />
                  </div>
                </div>

                <button onClick={() => setViewGym(gym)}
                  className="w-full py-2 rounded-lg text-[10px] font-semibold"
                  style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}>
                  View Details
                </button>
              </Card>
            </motion.div>
          );
        })}
      </div>

      {/* Create/Edit Modal */}
      <AnimatePresence>
        {showModal && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/70 z-50" onClick={() => setShowModal(false)} />
            <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
              <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
                className="w-full max-w-md rounded-2xl shadow-2xl overflow-hidden"
                style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
                onClick={e => e.stopPropagation()}>
                <div className="p-5 flex items-center justify-between" style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <h2 className="text-lg font-bold text-white">{editingGym ? 'Edit Gym' : 'Add Gym Branch'}</h2>
                  <button onClick={() => setShowModal(false)} style={{ color: 'var(--color-text-muted)' }}><X size={18} /></button>
                </div>
                <div className="p-5 space-y-3 max-h-[500px] overflow-y-auto">
                  <div>
                    <label className="text-xs block mb-1" style={{ color: 'var(--color-text-muted)' }}>Gym Name *</label>
                    <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                      placeholder="e.g. G-Fitness Core"
                      className="w-full px-4 py-2.5 rounded-xl text-white text-sm focus:outline-none"
                      style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }} />
                  </div>
                  <div>
                    <label className="text-xs block mb-1" style={{ color: 'var(--color-text-muted)' }}>Address *</label>
                    <input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })}
                      placeholder="Full address"
                      className="w-full px-4 py-2.5 rounded-xl text-white text-sm focus:outline-none"
                      style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs block mb-1" style={{ color: 'var(--color-text-muted)' }}>Phone</label>
                      <input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })}
                        placeholder="+63 912 345 6789"
                        className="w-full px-4 py-2.5 rounded-xl text-white text-sm focus:outline-none"
                        style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }} />
                    </div>
                    <div>
                      <label className="text-xs block mb-1" style={{ color: 'var(--color-text-muted)' }}>Email</label>
                      <input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })}
                        placeholder="gym@email.com"
                        className="w-full px-4 py-2.5 rounded-xl text-white text-sm focus:outline-none"
                        style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }} />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs block mb-1" style={{ color: 'var(--color-text-muted)' }}>Opening Hours</label>
                    <input value={form.openingHours} onChange={e => setForm({ ...form, openingHours: e.target.value })}
                      placeholder="6:00 AM - 9:00 PM"
                      className="w-full px-4 py-2.5 rounded-xl text-white text-sm focus:outline-none"
                      style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs block mb-1" style={{ color: 'var(--color-text-muted)' }}>Capacity</label>
                      <input type="number" value={form.capacity} onChange={e => setForm({ ...form, capacity: e.target.value })}
                        className="w-full px-4 py-2.5 rounded-xl text-white text-sm focus:outline-none"
                        style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }} />
                    </div>
                    <div>
                      <label className="text-xs block mb-1" style={{ color: 'var(--color-text-muted)' }}>Status</label>
                      <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value as any })}
                        className="w-full px-4 py-2.5 rounded-xl text-white text-sm focus:outline-none"
                        style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}>
                        <option value="Active">Active</option>
                        <option value="Maintenance">Maintenance</option>
                        <option value="Closed">Closed</option>
                      </select>
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
                    {editingGym ? 'Save Changes' : 'Add Gym'}
                  </button>
                </div>
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>

      {/* View Details Modal */}
      <AnimatePresence>
        {viewGym && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/70 z-50" onClick={() => setViewGym(null)} />
            <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
              <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
                className="w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden"
                style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
                onClick={e => e.stopPropagation()}>
                <div className="p-5" style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <div className="flex items-start justify-between">
                    <div>
                      <h2 className="text-lg font-bold text-white">{viewGym.name}</h2>
                      <Badge variant={viewGym.status === 'Active' ? 'Active' : 'Pending'} className="mt-2">
                        {viewGym.status}
                      </Badge>
                    </div>
                    <button onClick={() => setViewGym(null)} style={{ color: 'var(--color-text-muted)' }}>
                      <X size={18} />
                    </button>
                  </div>
                </div>
                <div className="p-5">
                  <div className="space-y-3 mb-4">
                    <div className="flex items-start gap-2">
                      <MapPin size={16} className="mt-0.5 flex-shrink-0" style={{ color: 'var(--color-primary)' }} />
                      <div>
                        <p className="text-xs font-semibold text-white">Address</p>
                        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{viewGym.address}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Phone size={16} style={{ color: 'var(--color-primary)' }} />
                      <div>
                        <p className="text-xs font-semibold text-white">Phone</p>
                        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{viewGym.phone}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock size={16} style={{ color: 'var(--color-primary)' }} />
                      <div>
                        <p className="text-xs font-semibold text-white">Opening Hours</p>
                        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{viewGym.openingHours}</p>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-xl p-4 mb-4" style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}>
                    <h3 className="text-sm font-bold text-white mb-3">Amenities</h3>
                    <div className="flex flex-wrap gap-2">
                      {viewGym.amenities.map(amenity => (
                        <span key={amenity} className="text-[10px] px-2 py-1 rounded-full font-semibold"
                          style={{ background: 'var(--color-primary-light)', color: 'var(--color-primary)' }}>
                          {amenity}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div className="rounded-lg p-3 text-center" style={{ background: 'var(--color-surface-raised)' }}>
                      <p className="text-xl font-bold text-white">{viewGym.capacity}</p>
                      <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>Capacity</p>
                    </div>
                    <div className="rounded-lg p-3 text-center" style={{ background: 'var(--color-surface-raised)' }}>
                      <p className="text-xl font-bold text-white">{viewGym.activeMembers}</p>
                      <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>Members</p>
                    </div>
                    <div className="rounded-lg p-3 text-center" style={{ background: 'var(--color-surface-raised)' }}>
                      <p className="text-xl font-bold text-white">{viewGym.trainers}</p>
                      <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>Trainers</p>
                    </div>
                  </div>
                </div>
                <div className="p-4" style={{ borderTop: '1px solid var(--color-border)' }}>
                  <button onClick={() => setViewGym(null)}
                    className="w-full py-2.5 rounded-full font-semibold text-sm text-black"
                    style={{ background: 'var(--color-secondary)' }}>
                    Close
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
