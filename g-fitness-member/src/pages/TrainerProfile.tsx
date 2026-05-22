import { motion } from 'framer-motion';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Star, Award, Calendar, CheckCircle } from 'lucide-react';
import { trainers } from '../data/trainers';

export default function TrainerProfile() {
  const navigate = useNavigate();
  const { trainerId } = useParams();

  const trainer =
    trainers.find(
      t =>
        t.id.toLowerCase() === trainerId?.toLowerCase() ||
        t.name.toLowerCase().includes((trainerId || '').toLowerCase()),
    ) || trainers[0];

  const reviews = [
    { name: 'John Doe',     stars: 5, comment: 'Excellent trainer — knowledgeable and motivating. Hit my goals in 3 months.', date: '2 weeks ago' },
    { name: 'Maria Santos', stars: 5, comment: 'Professional, patient, and genuinely cares about your progress. Highly recommended.', date: '1 month ago' },
  ];

  return (
    <div className="space-y-5 pb-4">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-3">
        <button onClick={() => navigate(-1)}
          className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}>
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-2xl font-bold text-white">Trainer Profile</h1>
      </motion.div>

      {/* Trainer Hero — flat violet */}
      <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.05 }}
        className="rounded-2xl p-5 text-center" style={{ background: 'var(--color-primary)', border: '1px solid var(--color-primary-hover)' }}>
        <div className="w-24 h-24 rounded-full mx-auto flex items-center justify-center text-3xl font-bold text-black mb-3"
          style={{ background: 'var(--color-secondary)' }}>
          {trainer.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
        </div>
        <h2 className="text-xl font-bold text-white">{trainer.name}</h2>
        <p className="text-sm text-white/80 mt-1">{trainer.specialty}</p>
        <div className="flex items-center justify-center gap-5 mt-3 text-sm">
          <div className="flex items-center gap-1.5">
            <Star size={16} style={{ color: 'var(--color-secondary)', fill: 'var(--color-secondary)' }} />
            <span className="text-white font-bold">{trainer.rating}</span>
            <span className="text-white/60 text-xs">rating</span>
          </div>
          <div className="w-px h-4 bg-white/20" />
          <div className="flex items-center gap-1.5">
            <Award size={16} style={{ color: 'var(--color-secondary)' }} />
            <span className="text-white font-bold">{trainer.experience}</span>
          </div>
        </div>
      </motion.div>

      {/* About */}
      <div className="rounded-2xl p-4" style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}>
        <h3 className="text-white font-semibold mb-2 text-sm">About</h3>
        <p className="text-sm leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>{trainer.bio}</p>
      </div>

      {/* Certifications */}
      <div className="rounded-2xl p-4" style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}>
        <h3 className="text-white font-semibold mb-3 text-sm flex items-center gap-2">
          <Award size={16} style={{ color: 'var(--color-secondary)' }} /> Certifications
        </h3>
        <div className="space-y-1.5">
          {trainer.certifications.map(cert => (
            <div key={cert} className="flex items-center gap-2 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
              <CheckCircle size={14} style={{ color: 'var(--color-primary)' }} /> {cert}
            </div>
          ))}
        </div>
      </div>

      {/* Availability */}
      <div className="rounded-2xl p-4" style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}>
        <h3 className="text-white font-semibold mb-3 text-sm flex items-center gap-2">
          <Calendar size={16} style={{ color: 'var(--color-secondary)' }} /> Availability
        </h3>
        <div className="space-y-2">
          {trainer.availability.map(avail => (
            <div key={avail.day} className="rounded-xl p-3" style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold text-white">{avail.day}</span>
                <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{avail.slots.length} slots</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {avail.slots.map(slot => (
                  <span key={slot} className="px-2 py-0.5 rounded-full text-xs font-medium"
                    style={{ background: 'var(--color-secondary-light)', border: '1px solid rgba(245,158,11,0.25)', color: 'var(--color-secondary)' }}>
                    {slot}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Reviews */}
      <div className="rounded-2xl p-4" style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}>
        <h3 className="text-white font-semibold mb-3 text-sm flex items-center gap-2">
          <Star size={16} style={{ color: 'var(--color-secondary)' }} /> Recent Reviews
        </h3>
        <div className="space-y-2">
          {reviews.map(r => (
            <div key={r.name} className="rounded-xl p-3" style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}>
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-black"
                    style={{ background: 'var(--color-secondary)' }}>
                    {r.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                  </div>
                  <span className="text-sm font-semibold text-white">{r.name}</span>
                </div>
                <div className="flex">
                  {Array.from({ length: r.stars }).map((_, i) => (
                    <Star key={i} size={11} style={{ color: 'var(--color-secondary)', fill: 'var(--color-secondary)' }} />
                  ))}
                </div>
              </div>
              <p className="text-xs leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>{r.comment}</p>
              <p className="text-[10px] mt-1.5" style={{ color: 'var(--color-text-muted)' }}>{r.date}</p>
            </div>
          ))}
        </div>
      </div>

      {/* CTA — full-width primary, bottom of page */}
      <button onClick={() => navigate('/member/book-class')}
        className="w-full py-3.5 rounded-xl font-semibold text-black flex items-center justify-center gap-2"
        style={{ background: 'var(--color-secondary)' }}>
        <Calendar size={18} /> Book Session with {trainer.name.split(' ')[1] || trainer.name}
      </button>
    </div>
  );
}
