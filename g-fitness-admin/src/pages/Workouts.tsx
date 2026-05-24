import { motion, AnimatePresence } from 'framer-motion';
import { useState } from 'react';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import { Plus, Edit2, Trash2, X, Dumbbell, Users, Clock, Target } from 'lucide-react';
import { showToast } from '../utils/toast';

interface Exercise {
  id: string;
  name: string;
  sets: number;
  reps: string;
  rest: string;
  notes?: string;
}

interface WorkoutPlan {
  id: string;
  name: string;
  description: string;
  level: 'Beginner' | 'Intermediate' | 'Advanced';
  duration: string;
  daysPerWeek: number;
  exercises: Exercise[];
  assignedTo: number;
  createdAt: string;
}

const MOCK_WORKOUTS: WorkoutPlan[] = [
  {
    id: 'wp-001',
    name: 'Full Body Strength',
    description: 'Complete full body workout focusing on compound movements',
    level: 'Intermediate',
    duration: '45-60 min',
    daysPerWeek: 3,
    exercises: [
      { id: 'ex-1', name: 'Barbell Squat', sets: 4, reps: '8-10', rest: '90s', notes: 'Focus on depth' },
      { id: 'ex-2', name: 'Bench Press', sets: 4, reps: '8-10', rest: '90s' },
      { id: 'ex-3', name: 'Deadlift', sets: 3, reps: '6-8', rest: '2min', notes: 'Keep back straight' },
      { id: 'ex-4', name: 'Pull-ups', sets: 3, reps: '8-12', rest: '60s' },
    ],
    assignedTo: 12,
    createdAt: '2026-05-20',
  },
  {
    id: 'wp-002',
    name: 'Beginner Fat Loss',
    description: 'High-rep circuit training for beginners',
    level: 'Beginner',
    duration: '30-40 min',
    daysPerWeek: 4,
    exercises: [
      { id: 'ex-5', name: 'Bodyweight Squats', sets: 3, reps: '15-20', rest: '45s' },
      { id: 'ex-6', name: 'Push-ups', sets: 3, reps: '10-15', rest: '45s' },
      { id: 'ex-7', name: 'Lunges', sets: 3, reps: '12 each', rest: '45s' },
      { id: 'ex-8', name: 'Plank', sets: 3, reps: '30-60s', rest: '45s' },
    ],
    assignedTo: 25,
    createdAt: '2026-05-18',
  },
  {
    id: 'wp-003',
    name: 'Advanced Hypertrophy',
    description: 'Muscle building program with progressive overload',
    level: 'Advanced',
    duration: '60-75 min',
    daysPerWeek: 5,
    exercises: [
      { id: 'ex-9', name: 'Incline Dumbbell Press', sets: 4, reps: '10-12', rest: '75s' },
      { id: 'ex-10', name: 'Cable Flyes', sets: 3, reps: '12-15', rest: '60s' },
      { id: 'ex-11', name: 'Leg Press', sets: 4, reps: '12-15', rest: '90s' },
      { id: 'ex-12', name: 'Romanian Deadlift', sets: 4, reps: '10-12', rest: '90s' },
    ],
    assignedTo: 8,
    createdAt: '2026-05-15',
  },
];

export default function Workouts() {
  const [workouts, setWorkouts] = useState<WorkoutPlan[]>(() => {
    try {
      const s = localStorage.getItem('admin_workouts');
      if (s) return JSON.parse(s);
    } catch {}
    localStorage.setItem('admin_workouts', JSON.stringify(MOCK_WORKOUTS));
    return MOCK_WORKOUTS;
  });

  const [showModal, setShowModal] = useState(false);
  const [editingWorkout, setEditingWorkout] = useState<WorkoutPlan | null>(null);
  const [viewWorkout, setViewWorkout] = useState<WorkoutPlan | null>(null);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [selectedWorkout, setSelectedWorkout] = useState<WorkoutPlan | null>(null);

  const saveWorkouts = (updated: WorkoutPlan[]) => {
    setWorkouts(updated);
    localStorage.setItem('admin_workouts', JSON.stringify(updated));
  };

  const openAdd = () => {
    setEditingWorkout(null);
    setShowModal(true);
  };

  const openEdit = (workout: WorkoutPlan) => {
    setEditingWorkout(workout);
    setShowModal(true);
  };

  const handleDelete = (id: string) => {
    if (!window.confirm('Delete this workout plan?')) return;
    saveWorkouts(workouts.filter(w => w.id !== id));
    showToast('Workout plan deleted', 'success');
  };

  const openAssign = (workout: WorkoutPlan) => {
    setSelectedWorkout(workout);
    setShowAssignModal(true);
  };

  const getLevelColor = (level: string) => {
    switch (level) {
      case 'Beginner': return 'var(--color-primary)';
      case 'Intermediate': return 'var(--color-secondary)';
      case 'Advanced': return '#ef4444';
      default: return 'var(--color-text-muted)';
    }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Workout Plans</h1>
          <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>Create and assign workout plans to members</p>
        </div>
        <Button variant="secondary" onClick={openAdd}>
          <Plus size={16} /> Create Workout Plan
        </Button>
      </motion.div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Total Plans', value: workouts.length, icon: Dumbbell },
          { label: 'Total Assigned', value: workouts.reduce((s, w) => s + w.assignedTo, 0), icon: Users },
          { label: 'Beginner', value: workouts.filter(w => w.level === 'Beginner').length, icon: Target },
          { label: 'Advanced', value: workouts.filter(w => w.level === 'Advanced').length, icon: Target },
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

      {/* Workout Plans Grid */}
      <div className="grid grid-cols-2 gap-4">
        {workouts.map((workout, i) => (
          <motion.div key={workout.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
            <Card className="!p-4">
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-bold text-white mb-1">{workout.name}</h3>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
                      style={{ background: `${getLevelColor(workout.level)}20`, color: getLevelColor(workout.level) }}>
                      {workout.level}
                    </span>
                    <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
                      {workout.daysPerWeek}x/week • {workout.duration}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1 ml-2 flex-shrink-0">
                  <button onClick={() => openEdit(workout)} className="p-1.5 rounded-lg"
                    style={{ background: 'var(--color-primary-light)', color: 'var(--color-primary)' }}>
                    <Edit2 size={11} />
                  </button>
                  <button onClick={() => handleDelete(workout.id)} className="p-1.5 rounded-lg"
                    style={{ background: 'var(--color-secondary-light)', color: 'var(--color-secondary)' }}>
                    <Trash2 size={11} />
                  </button>
                </div>
              </div>

              <p className="text-[10px] mb-3 line-clamp-2" style={{ color: 'var(--color-text-muted)' }}>{workout.description}</p>

              <div className="space-y-1.5 mb-3">
                {workout.exercises.slice(0, 3).map(ex => (
                  <div key={ex.id} className="flex items-center gap-2 text-[10px]"
                    style={{ color: 'var(--color-text-secondary)' }}>
                    <Dumbbell size={10} style={{ color: 'var(--color-secondary)' }} />
                    <span className="flex-1 truncate">{ex.name}</span>
                    <span style={{ color: 'var(--color-text-muted)' }}>{ex.sets}×{ex.reps}</span>
                  </div>
                ))}
                {workout.exercises.length > 3 && (
                  <p className="text-[9px] pl-4" style={{ color: 'var(--color-text-muted)' }}>
                    +{workout.exercises.length - 3} more exercises
                  </p>
                )}
              </div>

              <div className="flex gap-2 pt-3" style={{ borderTop: '1px solid var(--color-border)' }}>
                <button onClick={() => setViewWorkout(workout)}
                  className="flex-1 py-2 rounded-lg text-[10px] font-semibold"
                  style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}>
                  View Details
                </button>
                <button onClick={() => openAssign(workout)}
                  className="flex-1 py-2 rounded-lg text-[10px] font-semibold text-black flex items-center justify-center gap-1"
                  style={{ background: 'var(--color-secondary)' }}>
                  <Users size={10} /> Assign ({workout.assignedTo})
                </button>
              </div>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* View Workout Details Modal */}
      <AnimatePresence>
        {viewWorkout && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/70 z-50" onClick={() => setViewWorkout(null)} />
            <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
              <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
                className="w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden"
                style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
                onClick={e => e.stopPropagation()}>
                <div className="p-5" style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <div className="flex items-start justify-between">
                    <div>
                      <h2 className="text-lg font-bold text-white">{viewWorkout.name}</h2>
                      <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>{viewWorkout.description}</p>
                      <div className="flex items-center gap-2 mt-2">
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
                          style={{ background: `${getLevelColor(viewWorkout.level)}20`, color: getLevelColor(viewWorkout.level) }}>
                          {viewWorkout.level}
                        </span>
                        <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
                          {viewWorkout.daysPerWeek}x/week • {viewWorkout.duration}
                        </span>
                      </div>
                    </div>
                    <button onClick={() => setViewWorkout(null)} style={{ color: 'var(--color-text-muted)' }}>
                      <X size={18} />
                    </button>
                  </div>
                </div>
                <div className="p-5 max-h-[500px] overflow-y-auto">
                  <h3 className="text-sm font-bold text-white mb-3">Exercises</h3>
                  <div className="space-y-3">
                    {viewWorkout.exercises.map((ex, idx) => (
                      <div key={ex.id} className="rounded-xl p-3"
                        style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}>
                        <div className="flex items-start gap-3">
                          <div className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs flex-shrink-0"
                            style={{ background: 'var(--color-secondary)', color: '#000' }}>
                            {idx + 1}
                          </div>
                          <div className="flex-1">
                            <h4 className="text-sm font-semibold text-white mb-1">{ex.name}</h4>
                            <div className="flex items-center gap-3 text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
                              <span>Sets: {ex.sets}</span>
                              <span>•</span>
                              <span>Reps: {ex.reps}</span>
                              <span>•</span>
                              <span>Rest: {ex.rest}</span>
                            </div>
                            {ex.notes && (
                              <p className="text-[10px] mt-1 italic" style={{ color: 'var(--color-text-secondary)' }}>
                                💡 {ex.notes}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="p-4" style={{ borderTop: '1px solid var(--color-border)' }}>
                  <button onClick={() => setViewWorkout(null)}
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

      {/* Assign Modal Placeholder */}
      <AnimatePresence>
        {showAssignModal && selectedWorkout && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/70 z-50" onClick={() => setShowAssignModal(false)} />
            <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
              <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
                className="w-full max-w-md rounded-2xl shadow-2xl"
                style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
                onClick={e => e.stopPropagation()}>
                <div className="p-5" style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <h2 className="text-lg font-bold text-white">Assign Workout Plan</h2>
                  <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
                    Assign "{selectedWorkout.name}" to members
                  </p>
                </div>
                <div className="p-5">
                  <p className="text-sm text-center" style={{ color: 'var(--color-text-muted)' }}>
                    Member selection interface coming soon...
                  </p>
                  <p className="text-xs text-center mt-2" style={{ color: 'var(--color-text-muted)' }}>
                    Currently assigned to {selectedWorkout.assignedTo} members
                  </p>
                </div>
                <div className="p-4" style={{ borderTop: '1px solid var(--color-border)' }}>
                  <button onClick={() => setShowAssignModal(false)}
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
