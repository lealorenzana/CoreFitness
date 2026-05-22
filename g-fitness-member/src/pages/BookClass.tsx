import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Calendar, Clock, User, CheckCircle, ArrowLeft, MapPin, Star, Users } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { trainers as trainerData } from '../data/trainers';
import { SharedStorage } from '../utils/sharedStorage';
import { getCurrentUser } from '../utils/auth';
import Modal from '../components/ui/Modal';
import { toast } from '../components/ui/Toast';
import RatingPrompt from '../components/ui/RatingPrompt';

interface Trainer {
  id: string; name: string; specialization: string;
  photo: string; rating: number;
  availability: { day: string; slots: string[] }[];
}

interface ClassType {
  id: string; name: string; icon: string; duration: string; description: string;
}

const classTypes: ClassType[] = [
  { id: '1', name: 'Strength Training', icon: '💪', duration: '60 min', description: 'Build muscle and increase strength' },
  { id: '2', name: 'HIIT', icon: '🔥', duration: '45 min', description: 'High-intensity interval training' },
  { id: '3', name: 'Yoga', icon: '🧘', duration: '60 min', description: 'Flexibility and mindfulness' },
  { id: '4', name: 'Boxing', icon: '🥊', duration: '50 min', description: 'Combat training and cardio' },
  { id: '5', name: 'CrossFit', icon: '⚡', duration: '60 min', description: 'Functional fitness workout' },
];

const STEPS = ['Class', 'Trainer', 'Day', 'Time'];

export default function BookClass() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [selectedClass, setSelectedClass] = useState<ClassType | null>(null);
  const [selectedTrainer, setSelectedTrainer] = useState<Trainer | null>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [isBooked, setIsBooked] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showRating, setShowRating] = useState(false);

  const trainers: Trainer[] = trainerData.map(t => ({
    id: t.id, name: t.name, specialization: t.specialty,
    photo: t.image, rating: t.rating, availability: t.availability,
  }));

  const handleConfirmBooking = () => {
    if (!selectedClass || !selectedTrainer || !selectedDay || !selectedTime) return;
    setShowConfirm(true);
  };

  const handleFinalize = () => {
    if (!selectedClass || !selectedTrainer || !selectedDay || !selectedTime) return;
    setIsLoading(true);

    const currentUser = getCurrentUser();
    const booking = {
      id: `booking-${Date.now()}`,
      memberId: currentUser?.email || localStorage.getItem('memberEmail') || 'eya.lorenzana@email.com',
      memberName: currentUser?.name || localStorage.getItem('memberName') || 'Eya Lorenzana',
      memberEmail: currentUser?.email || localStorage.getItem('memberEmail') || 'eya.lorenzana@email.com',
      className: selectedClass.name,
      classType: selectedClass.name,
      trainerName: selectedTrainer.name,
      trainerId: selectedTrainer.id,
      day: selectedDay,
      time: selectedTime,
      date: new Date().toISOString().split('T')[0],
      status: 'Pending',
      createdAt: new Date().toISOString(),
    };

    try {
      SharedStorage.addBooking(booking);
    } catch {
      toast.error('Could not save booking. Please try again.');
      setIsLoading(false);
      setShowConfirm(false);
      return;
    }

    setTimeout(() => {
      setIsLoading(false);
      setShowConfirm(false);
      setIsBooked(true);
      toast.success('Booking submitted!');
    }, 600);
  };

  const handleDone = () => {
    navigate('/member/booking-history');
  };

  // Show rating prompt for Premium members after booking
  useEffect(() => {
    if (isBooked) {
      const userData = localStorage.getItem('currentUser');
      let isPremium = false;
      if (userData) {
        try {
          const user = JSON.parse(userData);
          isPremium = user.plan === 'Premium' || user.membershipPlan === 'Premium';
        } catch { /* ignore */ }
      }
      if (!isPremium) {
        const plan = localStorage.getItem('memberPlan') || '';
        isPremium = plan.toLowerCase() === 'premium';
      }
      if (isPremium) {
        const timer = setTimeout(() => setShowRating(true), 2000);
        return () => clearTimeout(timer);
      }
    }
  }, [isBooked]);

  // ─── Success screen ───
  if (isBooked) {
    return (
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
        className="flex flex-col items-center justify-center min-h-[60vh] space-y-6 text-center px-2">
        <div className="w-20 h-20 rounded-full flex items-center justify-center"
          style={{ background: 'var(--color-primary-light)', border: '2px solid var(--color-primary)' }}>
          <CheckCircle size={40} style={{ color: 'var(--color-primary)' }} />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-white mb-2">Booking Submitted!</h2>
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Your booking is pending admin approval.</p>
        </div>
        <div className="w-full rounded-2xl p-4 space-y-3 text-sm"
          style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}>
          {[
            { label: 'Class', value: selectedClass?.name },
            { label: 'Trainer', value: selectedTrainer?.name },
            { label: 'Day', value: selectedDay },
            { label: 'Time', value: selectedTime },
            { label: 'Location', value: 'Core Fitness Main Studio' },
          ].map(row => (
            <div key={row.label} className="flex justify-between py-1"
              style={{ borderBottom: '1px solid var(--color-border)' }}>
              <span style={{ color: 'var(--color-text-muted)' }}>{row.label}</span>
              <span className="font-semibold text-white">{row.value}</span>
            </div>
          ))}
        </div>
        <button onClick={handleDone}
          className="w-full h-12 rounded-full font-semibold text-black"
          style={{ background: 'var(--color-secondary)' }}>
          View My Bookings
        </button>
        <RatingPrompt
          isOpen={showRating}
          onClose={() => setShowRating(false)}
          trainerName={selectedTrainer?.name || ''}
        />
      </motion.div>
    );
  }

  return (
    <div className="space-y-5 pb-4">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-3">
        <button
          onClick={() => step > 1 ? setStep(step - 1) : navigate('/member/home')}
          className="w-10 h-10 rounded-full flex items-center justify-center transition-colors"
          style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}>
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-white">Book a Class</h1>
          <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Step {step} of 4 — {STEPS[step - 1]}</p>
        </div>
        {/* Step indicator pills */}
        <div className="flex items-center gap-1">
          {STEPS.map((_, i) => (
            <div key={i} className="w-2 h-2 rounded-full transition-all"
              style={{
                background: i < step ? 'var(--color-secondary)' : i === step - 1 ? 'var(--color-secondary)' : 'var(--color-border)',
                transform: i === step - 1 ? 'scale(1.3)' : 'scale(1)',
              }} />
          ))}
        </div>
      </motion.div>

      {/* Progress bar — segmented */}
      <div className="flex gap-1">
        {STEPS.map((_, i) => (
          <div key={i} className="flex-1 h-1 rounded-full overflow-hidden"
            style={{ background: 'var(--color-border)' }}>
            <motion.div
              className="h-full rounded-full"
              initial={{ width: 0 }}
              animate={{ width: i < step ? '100%' : '0%' }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
              style={{ background: 'var(--color-secondary)' }}
            />
          </div>
        ))}
      </div>

      {/* ─── Step 1 — Class Type ─── */}
      {step === 1 && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className="space-y-3"
        >
          <h2 className="text-base font-bold text-white">Select Class Type</h2>
          {classTypes.map((ct, i) => {
            const isSelected = selectedClass?.id === ct.id;
            return (
              <motion.button
                key={ct.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                onClick={() => { setSelectedClass(ct); setStep(2); }}
                className="w-full rounded-2xl p-4 text-left transition-all active:scale-[0.98]"
                style={{
                  background: 'var(--color-surface-raised)',
                  border: `1.5px solid ${isSelected ? 'var(--color-primary)' : 'var(--color-border)'}`,
                }}
              >
                <div className="flex items-center gap-3">
                  {/* Icon circle */}
                  <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ background: 'var(--color-primary-light)' }}>
                    <span className="text-xl leading-none">{ct.icon}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-bold text-sm">{ct.name}</p>
                    <p className="text-[11px] mt-0.5" style={{ color: 'var(--color-text-muted)' }}>{ct.description}</p>
                    <p className="text-[11px] mt-1 font-bold" style={{ color: 'var(--color-secondary)' }}>{ct.duration}</p>
                  </div>
                </div>
              </motion.button>
            );
          })}
        </motion.div>
      )}

      {/* ─── Step 2 — Trainer ─── */}
      {step === 2 && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className="space-y-3"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-white">Select Trainer</h2>
            {selectedClass && (
              <span className="px-2.5 py-1 rounded-full text-[10px] font-bold"
                style={{ background: 'var(--color-primary-light)', color: 'var(--color-primary)' }}>
                {selectedClass.icon} {selectedClass.name}
              </span>
            )}
          </div>
          {trainers.map((trainer, i) => {
            const isSelected = selectedTrainer?.id === trainer.id;
            return (
              <motion.button
                key={trainer.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                onClick={() => { setSelectedTrainer(trainer); setStep(3); }}
                className="w-full rounded-2xl p-4 text-left transition-all active:scale-[0.98]"
                style={{
                  background: 'var(--color-surface-raised)',
                  border: `1.5px solid ${isSelected ? 'var(--color-primary)' : 'var(--color-border)'}`,
                }}
              >
                <div className="flex items-center gap-4">
                  {/* Avatar */}
                  <div className="w-12 h-12 rounded-full flex items-center justify-center text-black font-bold text-sm flex-shrink-0"
                    style={{ background: 'var(--color-secondary)' }}>
                    {trainer.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-semibold text-sm">{trainer.name}</p>
                    <p className="text-[11px] mt-0.5" style={{ color: 'var(--color-text-muted)' }}>{trainer.specialization}</p>
                    <div className="flex items-center gap-2 mt-1.5">
                      <div className="flex items-center gap-0.5">
                        <Star size={11} style={{ color: 'var(--color-secondary)' }} />
                        <span className="text-[11px] font-semibold text-white">{trainer.rating}</span>
                      </div>
                      <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
                        · {trainer.availability.length} days available
                      </span>
                    </div>
                  </div>
                  {isSelected && <CheckCircle size={18} style={{ color: 'var(--color-primary)' }} />}
                </div>
              </motion.button>
            );
          })}
        </motion.div>
      )}

      {/* ─── Step 3 — Day ─── */}
      {step === 3 && selectedTrainer && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className="space-y-3"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-white">Select Day</h2>
            <span className="px-2.5 py-1 rounded-full text-[10px] font-bold"
              style={{ background: 'var(--color-secondary-light)', color: 'var(--color-secondary)' }}>
              {selectedTrainer.name}
            </span>
          </div>
          {selectedTrainer.availability.map((avail, i) => {
            const isSelected = selectedDay === avail.day;
            return (
              <motion.button
                key={avail.day}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                onClick={() => { setSelectedDay(avail.day); setStep(4); }}
                className="w-full rounded-2xl p-4 text-left transition-all active:scale-[0.98]"
                style={{
                  background: 'var(--color-surface-raised)',
                  border: `1.5px solid ${isSelected ? 'var(--color-primary)' : 'var(--color-border)'}`,
                }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                      style={{ background: 'var(--color-primary-light)' }}>
                      <Calendar size={18} style={{ color: 'var(--color-primary)' }} />
                    </div>
                    <span className="text-white font-semibold text-sm">{avail.day}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold"
                      style={{ background: 'var(--color-secondary-light)', color: 'var(--color-secondary)' }}>
                      {avail.slots.length} slots
                    </span>
                    {isSelected && <CheckCircle size={16} style={{ color: 'var(--color-primary)' }} />}
                  </div>
                </div>
              </motion.button>
            );
          })}
        </motion.div>
      )}

      {/* ─── Step 4 — Time + Summary ─── */}
      {step === 4 && selectedTrainer && selectedDay && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className="space-y-4"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-white">Select Time</h2>
            <span className="px-2.5 py-1 rounded-full text-[10px] font-bold"
              style={{ background: 'var(--color-primary-light)', color: 'var(--color-primary)' }}>
              {selectedDay}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {selectedTrainer.availability.find(a => a.day === selectedDay)?.slots.map((slot, idx) => {
              const slotsRemaining = [3, 5, 2, 8, 1, 6, 4][idx % 7];
              const isFull = slotsRemaining === 0;
              const isSelected = selectedTime === slot;
              return (
                <motion.button
                  key={slot}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: idx * 0.04 }}
                  onClick={() => !isFull && setSelectedTime(slot)}
                  disabled={isFull}
                  className="rounded-2xl p-3 text-center transition-all active:scale-[0.96] disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{
                    background: isSelected ? 'var(--color-primary)' : 'var(--color-surface-raised)',
                    border: `1.5px solid ${isSelected ? 'var(--color-primary)' : 'var(--color-border)'}`,
                  }}
                >
                  <Clock size={16} className="mx-auto mb-1.5"
                    style={{ color: isSelected ? '#fff' : 'var(--color-text-muted)' }} />
                  <span className="text-sm font-bold block"
                    style={{ color: isSelected ? '#fff' : 'var(--color-text-primary)' }}>
                    {slot}
                  </span>
                  <span
                    className="inline-block mt-2 px-2 py-0.5 rounded-full text-[9px] font-bold"
                    style={{
                      background: isSelected ? 'rgba(255,255,255,0.18)' : 'var(--color-secondary-light)',
                      color: isSelected ? '#fff' : 'var(--color-secondary)',
                    }}>
                    <Users size={8} className="inline mr-0.5" style={{ verticalAlign: 'middle' }} />
                    {slotsRemaining} left
                  </span>
                </motion.button>
              );
            })}
          </div>

          {/* Booking Summary */}
          <AnimatePresence>
            {selectedTime && (
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-2xl p-4 space-y-3"
                style={{ background: 'var(--color-surface-raised)', border: '1.5px solid var(--color-primary)' }}
              >
                <h3 className="text-white font-bold text-sm">Booking Summary</h3>
                <div className="space-y-2">
                  {[
                    { icon: <span className="text-base">{selectedClass?.icon}</span>, label: 'Class', value: selectedClass?.name },
                    { icon: <User size={13} style={{ color: 'var(--color-secondary)' }} />, label: 'Trainer', value: selectedTrainer.name },
                    { icon: <Calendar size={13} style={{ color: 'var(--color-secondary)' }} />, label: 'Day', value: selectedDay },
                    { icon: <Clock size={13} style={{ color: 'var(--color-secondary)' }} />, label: 'Time', value: selectedTime },
                    { icon: <MapPin size={13} style={{ color: 'var(--color-secondary)' }} />, label: 'Location', value: 'Core Fitness Main Studio' },
                  ].map(row => (
                    <div key={row.label} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2" style={{ color: 'var(--color-text-muted)' }}>
                        {row.icon} {row.label}
                      </div>
                      <span className="font-semibold text-white">{row.value}</span>
                    </div>
                  ))}
                </div>

                <button
                  onClick={handleConfirmBooking}
                  disabled={isLoading}
                  className="w-full h-12 rounded-full font-semibold text-black mt-2 transition-all active:scale-[0.97] disabled:opacity-60"
                  style={{ background: 'var(--color-secondary)' }}
                >
                  {isLoading ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                      Submitting…
                    </span>
                  ) : 'Confirm Booking'}
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}

      {/* Confirmation modal */}
      <Modal
        isOpen={showConfirm}
        onClose={() => !isLoading && setShowConfirm(false)}
        title="Confirm your booking"
        subtitle="Review your selection before submitting"
        confirmLabel={isLoading ? 'Submitting…' : 'Yes, Submit'}
        cancelLabel="Cancel"
        confirmDisabled={isLoading}
        onConfirm={handleFinalize}
      >
        <div className="space-y-2 text-sm">
          {[
            { label: 'Class',    value: selectedClass?.name },
            { label: 'Trainer',  value: selectedTrainer?.name },
            { label: 'Day',      value: selectedDay },
            { label: 'Time',     value: selectedTime },
            { label: 'Location', value: 'Core Fitness Main Studio' },
          ].map(row => (
            <div key={row.label} className="flex items-center justify-between py-2"
              style={{ borderBottom: '1px solid var(--color-border)' }}>
              <span style={{ color: 'var(--color-text-muted)' }}>{row.label}</span>
              <span className="font-semibold text-white text-right">{row.value}</span>
            </div>
          ))}
          <p className="text-xs mt-3 text-center" style={{ color: 'var(--color-text-muted)' }}>
            Your booking will be sent to admin for approval.
          </p>
        </div>
      </Modal>
    </div>
  );
}
