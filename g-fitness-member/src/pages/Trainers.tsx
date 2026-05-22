import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { Star, Award, Calendar, ArrowRight, Users, X, TrendingDown, TrendingUp, Activity } from 'lucide-react';
import { trainers } from '../data/trainers';
import { SharedStorage } from '../utils/sharedStorage';
import { getCurrentUser } from '../utils/auth';
import { getMembersForTrainer, type AssignedMember } from '../data/mockTrainerAssignments';
import EmptyState from '../components/ui/EmptyState';

// Detect if logged-in user is a trainer by matching name
function useTrainerView() {
  const currentUser = getCurrentUser();
  const name = currentUser?.name || localStorage.getItem('memberName') || '';
  if (name.length < 2) return null;
  const first = name.toLowerCase().split(' ')[0];
  return trainers.find((t) => t.name.toLowerCase().includes(first)) || null;
}

// Rating prompt for Premium members after a session
function RatingPrompt({ booking, onRate, onDismiss }: { booking: any; onRate: (stars: number, comment: string) => void; onDismiss: () => void }) {
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState('');
  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl p-4 mb-4" style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-secondary)' }}>
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="text-white font-semibold text-sm">Rate your session</p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>{booking.className} with {booking.trainerName}</p>
        </div>
        <button onClick={onDismiss} style={{ color: 'var(--color-text-muted)' }}><X size={16} /></button>
      </div>
      <div className="flex gap-2 mb-3">
        {[1, 2, 3, 4, 5].map(s => (
          <button key={s} onClick={() => setStars(s)}>
            <Star size={24} style={{ color: s <= stars ? 'var(--color-secondary)' : 'var(--color-border)', fill: s <= stars ? 'var(--color-secondary)' : 'none' }} />
          </button>
        ))}
      </div>
      <input value={comment} onChange={e => setComment(e.target.value)}
        placeholder="Leave a comment (optional)…"
        className="w-full px-3 py-2 rounded-xl text-white text-xs focus:outline-none mb-3"
        style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }} />
      <div className="flex gap-2">
        <button onClick={onDismiss} className="flex-1 py-2 rounded-xl text-xs font-semibold"
          style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', color: 'var(--color-text-muted)' }}>
          Skip
        </button>
        <button onClick={() => stars > 0 && onRate(stars, comment)} disabled={stars === 0}
          className="flex-1 py-2 rounded-xl text-xs font-semibold text-black disabled:opacity-40"
          style={{ background: 'var(--color-secondary)' }}>
          Submit Rating
        </button>
      </div>
    </motion.div>
  );
}

function MyMembersTab({ trainerId }: { trainerId: string }) {
  const members: AssignedMember[] = getMembersForTrainer(trainerId);

  if (members.length === 0) {
    return <EmptyState icon={Users} title="No members assigned"
      message="Once an admin assigns members, they'll appear here." />;
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: 'Total Members', value: members.length, color: 'var(--color-secondary)' },
          { label: 'Avg Workouts',  value: Math.round(members.reduce((s, m) => s + m.workoutsThisMonth, 0) / members.length), color: 'var(--color-primary)' },
          { label: 'On Track',       value: members.filter(m => m.attendanceThisMonth >= 12).length, color: 'var(--color-primary)' },
        ].map(s => (
          <div key={s.label} className="rounded-xl p-3 text-center"
            style={{ background: 'var(--color-surface-raised)', border: `1px solid ${s.color}30` }}>
            <p className="text-2xl font-bold" style={{ color: s.color }}>{s.value}</p>
            <p className="text-[10px] mt-1" style={{ color: 'var(--color-text-muted)' }}>{s.label}</p>
          </div>
        ))}
      </div>

      {members.map(m => {
        const lostWeight = m.weightChangeKg < 0;
        return (
          <div key={m.id} className="rounded-2xl p-4"
            style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}>
            <div className="flex items-start gap-3 mb-3">
              <div className="w-12 h-12 rounded-full flex items-center justify-center text-black font-bold text-base flex-shrink-0"
                style={{ background: 'var(--color-secondary)' }}>
                {m.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white font-semibold text-sm truncate">{m.name}</p>
                <p className="text-[11px] truncate" style={{ color: 'var(--color-text-muted)' }}>{m.email}</p>
                <span className="inline-block mt-1 text-[10px] px-2 py-0.5 rounded-full font-semibold"
                  style={{
                    background: m.membershipType === 'Premium' ? 'var(--color-secondary-light)'
                              : m.membershipType === 'Standard' ? 'var(--color-primary-light)'
                              : 'rgba(107,96,128,0.15)',
                    color: m.membershipType === 'Premium' ? 'var(--color-secondary)'
                         : m.membershipType === 'Standard' ? 'var(--color-primary)'
                         : 'var(--color-text-secondary)',
                  }}>
                  {m.membershipType}
                </span>
              </div>
            </div>

            <p className="text-xs mb-3" style={{ color: 'var(--color-text-secondary)' }}>🎯 {m.goalSummary}</p>

            <div className="grid grid-cols-3 gap-2">
              {[
                { icon: Calendar, label: 'Visits',     value: m.attendanceThisMonth, color: 'var(--color-secondary)' },
                { icon: Activity, label: 'Workouts',   value: m.workoutsThisMonth,   color: 'var(--color-primary)' },
                {
                  icon: lostWeight ? TrendingDown : TrendingUp,
                  label: 'Weight Δ',
                  value: `${m.weightChangeKg > 0 ? '+' : ''}${m.weightChangeKg} kg`,
                  color: lostWeight ? 'var(--color-primary)' : 'var(--color-secondary)',
                },
              ].map(s => {
                const Icon = s.icon;
                return (
                  <div key={s.label} className="rounded-lg p-2 flex items-center gap-1.5"
                    style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}>
                    <Icon size={12} style={{ color: s.color }} />
                    <div className="min-w-0">
                      <p className="text-[10px] truncate" style={{ color: 'var(--color-text-muted)' }}>{s.label}</p>
                      <p className="text-xs font-bold text-white truncate">{s.value}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function Trainers() {
  const navigate = useNavigate();
  const trainerSelf = useTrainerView();
  const currentUser = getCurrentUser();
  const memberEmail = currentUser?.email || localStorage.getItem('memberEmail') || 'eya.lorenzana@email.com';

  // Tab state — only relevant when logged-in user is a trainer
  const [tab, setTab] = useState<'browse' | 'my-members'>(trainerSelf ? 'my-members' : 'browse');

  // Premium-only ratings detection
  const memberData = SharedStorage.getMember(memberEmail);
  const isPremium = memberData?.membershipType === 'Premium';

  const [pendingRatings, setPendingRatings] = useState<any[]>([]);
  const [dismissedRatings, setDismissedRatings] = useState<string[]>(() => {
    const s = localStorage.getItem('dismissed_ratings');
    return s ? JSON.parse(s) : [];
  });

  useEffect(() => {
    if (!isPremium) return;
    const bookings = SharedStorage.getMemberBookings(memberEmail);
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yStr = yesterday.toISOString().split('T')[0];
    const rated = JSON.parse(localStorage.getItem('rated_sessions') || '[]');
    const pending = bookings.filter((b: any) =>
      b.status === 'Confirmed' &&
      b.date === yStr &&
      !rated.includes(b.id) &&
      !dismissedRatings.includes(b.id)
    );
    setPendingRatings(pending);
  }, [memberEmail, isPremium, dismissedRatings]);

  const handleRate = (bookingId: string, stars: number, comment: string) => {
    const rated = JSON.parse(localStorage.getItem('rated_sessions') || '[]');
    rated.push(bookingId);
    localStorage.setItem('rated_sessions', JSON.stringify(rated));
    const ratings = JSON.parse(localStorage.getItem('session_ratings') || '[]');
    ratings.push({ bookingId, stars, comment, date: new Date().toISOString() });
    localStorage.setItem('session_ratings', JSON.stringify(ratings));
    setPendingRatings(prev => prev.filter(b => b.id !== bookingId));
  };

  const handleDismiss = (bookingId: string) => {
    const updated = [...dismissedRatings, bookingId];
    setDismissedRatings(updated);
    localStorage.setItem('dismissed_ratings', JSON.stringify(updated));
    setPendingRatings(prev => prev.filter(b => b.id !== bookingId));
  };

  return (
    <div className="space-y-5 pb-4">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-2xl font-bold text-white">{trainerSelf ? 'Trainer Hub' : 'Our Trainers'}</h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
          {trainerSelf ? `Welcome, ${trainerSelf.name}` : 'Expert coaches to guide your fitness journey'}
        </p>
      </motion.div>

      {/* Tab strip — only for trainer-role users */}
      {trainerSelf && (
        <div className="flex gap-2 p-1 rounded-xl" style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}>
          {[
            { id: 'my-members', label: 'My Members' },
            { id: 'browse',     label: 'All Trainers' },
          ].map(t => (
            <button key={t.id} onClick={() => setTab(t.id as any)}
              className="flex-1 py-2 rounded-lg text-sm font-semibold"
              style={{
                background: tab === t.id ? 'var(--color-secondary)' : 'transparent',
                color: tab === t.id ? '#000' : 'var(--color-text-muted)',
              }}>
              {t.label}
            </button>
          ))}
        </div>
      )}

      {/* Rating prompts for Premium members */}
      {isPremium && pendingRatings.map(b => (
        <RatingPrompt key={b.id} booking={b} onRate={(s, c) => handleRate(b.id, s, c)} onDismiss={() => handleDismiss(b.id)} />
      ))}

      {/* Trainer's "My Members" view */}
      {trainerSelf && tab === 'my-members' && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <MyMembersTab trainerId={trainerSelf.id} />
        </motion.div>
      )}

      {/* Browse all trainers */}
      {(!trainerSelf || tab === 'browse') && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
          {trainers.map((trainer, index) => (
            <motion.div key={trainer.id} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.06 }}
              onClick={() => navigate(`/member/trainer/${trainer.id.toLowerCase()}`)}
              className="rounded-2xl p-4 cursor-pointer transition-colors"
              style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--color-secondary)')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--color-border)')}>
              <div className="flex items-start gap-4">
                <div className="w-16 h-16 rounded-full flex items-center justify-center text-black font-bold text-xl flex-shrink-0"
                  style={{ background: 'var(--color-secondary)' }}>
                  {trainer.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between mb-1">
                    <div>
                      <h3 className="text-white font-bold">{trainer.name}</h3>
                      <p className="text-sm font-semibold" style={{ color: 'var(--color-secondary)' }}>{trainer.specialty}</p>
                    </div>
                    <ArrowRight size={18} style={{ color: 'var(--color-text-muted)' }} />
                  </div>
                  <div className="flex items-center gap-2 mb-2">
                    <div className="flex items-center gap-1">
                      <Star size={14} style={{ color: 'var(--color-secondary)', fill: 'var(--color-secondary)' }} />
                      <span className="text-white text-sm font-bold">{trainer.rating}</span>
                    </div>
                    <span style={{ color: 'var(--color-border)' }}>•</span>
                    <span className="text-sm" style={{ color: 'var(--color-text-muted)' }}>{trainer.experience} experience</span>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap mb-2">
                    <Award size={12} style={{ color: 'var(--color-primary)' }} />
                    {trainer.certifications.slice(0, 2).map((cert, i) => (
                      <span key={i} className="text-xs px-2 py-0.5 rounded-full"
                        style={{ background: 'var(--color-primary-light)', color: 'var(--color-primary)', border: '1px solid rgba(124,58,237,0.20)' }}>
                        {cert}
                      </span>
                    ))}
                    {trainer.certifications.length > 2 && (
                      <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>+{trainer.certifications.length - 2}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--color-text-muted)' }}>
                    <Calendar size={12} /> Available {trainer.availability.length} days/week
                  </div>
                </div>
              </div>
              <p className="text-xs mt-3 line-clamp-2" style={{ color: 'var(--color-text-muted)' }}>{trainer.bio}</p>
              <button onClick={e => { e.stopPropagation(); navigate(`/member/trainer/${trainer.id.toLowerCase()}`); }}
                className="w-full mt-3 py-2.5 rounded-xl font-semibold text-sm text-black transition-colors flex items-center justify-center gap-2"
                style={{ background: 'var(--color-secondary)' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-secondary-hover)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'var(--color-secondary)')}>
                <ArrowRight size={14} /> View Profile & Book
              </button>
            </motion.div>
          ))}

          {/* Help banner — flat */}
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
            className="rounded-2xl p-5" style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-primary)' }}>
            <h3 className="text-white font-bold mb-1">Need Help Choosing?</h3>
            <p className="text-sm mb-3" style={{ color: 'var(--color-text-secondary)' }}>
              Not sure which trainer is right for you? Our AI assistant can help.
            </p>
            <button onClick={() => navigate('/member/book-class')}
              className="px-5 py-2 rounded-xl font-semibold text-sm text-black flex items-center gap-2"
              style={{ background: 'var(--color-secondary)' }}>
              <Calendar size={14} /> Book a Class
            </button>
          </motion.div>
        </motion.div>
      )}
    </div>
  );
}
