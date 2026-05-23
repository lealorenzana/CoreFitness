import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { MapPin, Star, Users, Dumbbell, ArrowRight, Award, TrendingUp, ChevronRight } from 'lucide-react';
import MobileFrame from '../components/layout/MobileFrame';
import AuthChoiceSheet from '../components/ui/AuthChoiceSheet';
import { GYMS } from '../data/gyms';
import { getSelectedGym, setSelectedGym } from '../utils/prototype';

export default function GymList() {
  const navigate = useNavigate();
  const [showAuthChoice, setShowAuthChoice] = useState(false);
  const [showSplash, setShowSplash] = useState(true);
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setPortalTarget(document.getElementById('phone-screen'));
  }, []);

  const ensureGymForAuth = () => {
    if (!getSelectedGym()) setSelectedGym('g-fitness', 'G-Fitness');
  };

  const listMeta: Record<string, { rating: number; members: number; tagline: string; features: string[]; successStory: string }> = {
    'g-fitness': {
      rating: 4.9, members: 250, tagline: "LET'S GET STRONGER!",
      features: ['G-Silver', 'G-Gold', 'G-Ruby', 'Per Session'],
      successStory: '"Best gym in Mamburao! Love the G-Ruby package!" - Eya L.',
    },
    'fitness-regency': {
      rating: 4.8, members: 180, tagline: 'Where Champions Are Made',
      features: ['Olympic Weights', 'Boxing Ring', 'Sauna', 'Open Gym'],
      successStory: '"Gained 8kg of muscle! Best gym in town!" - Juan D.',
    },
    'ferrer-fitness': {
      rating: 4.7, members: 150, tagline: 'Your Fitness, Our Mission',
      features: ['Personal Trainers', 'Cardio Zone', 'Free Weights', 'Lockers'],
      successStory: '"Finally found a gym that feels like home!" - Ana R.',
    },
  };

  return (
    <MobileFrame>
      <AnimatePresence>
        {/* ─── GET STARTED SPLASH ─── */}
        {showSplash && (
          <motion.div
            key="splash"
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.4 }}
            className="absolute inset-0 z-[80] flex flex-col overflow-hidden"
            style={{ background: '#000' }}
          >
            {/* ─── HERO: Photo + centered heading at top ─── */}
            <div className="relative flex-1 overflow-hidden">
              <img src="/assets/micajoy-fitness.jpg.png" alt="Core Fitness"
                className="absolute inset-0 w-full h-full object-cover object-top" />
              <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0.3) 30%, rgba(0,0,0,0.3) 60%, rgba(0,0,0,0.85) 85%, #000 100%)' }} />

              {/* Centered heading at TOP */}
              <div className="absolute top-0 left-0 right-0 pt-14 px-5 z-10 text-center">
                <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3, duration: 0.8 }}>
                  <h1 className="font-black italic text-white uppercase text-center whitespace-nowrap"
                    style={{ fontSize: '32px', lineHeight: 1.1, textShadow: '0 2px 20px rgba(0,0,0,0.9)' }}>
                    SMART <span style={{ color: 'var(--color-primary)' }}>FITNESS.</span>
                  </h1>
                  <h1 className="font-black italic text-white uppercase text-center whitespace-nowrap"
                    style={{ fontSize: '26px', lineHeight: 1.1, textShadow: '0 2px 20px rgba(0,0,0,0.9)' }}>
                    SMARTER <span style={{ color: 'var(--color-primary)' }}>MANAGEMENT.</span>
                  </h1>
                  <div className="flex items-center justify-center gap-2 mt-2">
                    <div className="w-8 h-px" style={{ background: 'rgba(255,255,255,0.2)' }} />
                    <p className="text-[9px] text-white/60 whitespace-nowrap">
                      The Future of <span style={{ color: 'var(--color-primary)' }}>Fitness</span> Starts Here.
                    </p>
                    <div className="w-8 h-px" style={{ background: 'rgba(255,255,255,0.2)' }} />
                  </div>
                </motion.div>
              </div>
            </div>

            {/* ─── FEATURE STRIP ─── */}
            <div className="py-3 overflow-hidden flex-shrink-0" style={{ background: '#000' }}>
              <p className="text-center text-[8px] font-bold uppercase tracking-[0.3em] mb-2" style={{ color: 'var(--color-primary)' }}>Member Features</p>
              <div className="relative">
                <div className="absolute left-0 top-0 bottom-0 w-6 z-10 pointer-events-none" style={{ background: 'linear-gradient(to right, #000, transparent)' }} />
                <div className="absolute right-0 top-0 bottom-0 w-6 z-10 pointer-events-none" style={{ background: 'linear-gradient(to left, #000, transparent)' }} />
                <div className="flex gap-2 w-max hover:[animation-play-state:paused]" style={{ animation: 'feature-strip-scroll 22s linear infinite' }}>
                  {[
                    { icon: '📱', label: 'QR Code' }, { icon: '📊', label: 'Progress' }, { icon: '📅', label: 'Booking' },
                    { icon: '🏋️', label: 'Workouts' }, { icon: '🔔', label: 'Alerts' }, { icon: '💳', label: 'Membership' },
                    { icon: '🎯', label: 'Goals' }, { icon: '🏆', label: 'Badges' }, { icon: '❤️', label: 'Health' }, { icon: '💬', label: 'AI Chat' },
                    { icon: '📱', label: 'QR Code' }, { icon: '📊', label: 'Progress' }, { icon: '📅', label: 'Booking' },
                    { icon: '🏋️', label: 'Workouts' }, { icon: '🔔', label: 'Alerts' }, { icon: '💳', label: 'Membership' },
                    { icon: '🎯', label: 'Goals' }, { icon: '🏆', label: 'Badges' }, { icon: '❤️', label: 'Health' }, { icon: '💬', label: 'AI Chat' },
                  ].map((f, i) => (
                    <div key={i} className="flex-shrink-0 w-[68px] rounded-xl p-2 flex flex-col items-center gap-1 text-center transition-transform hover:scale-110"
                      style={{ background: 'rgba(124,58,237,0.12)', border: '1px solid rgba(124,58,237,0.25)', boxShadow: '0 0 10px rgba(124,58,237,0.1)' }}>
                      <span className="text-sm">{f.icon}</span>
                      <span className="text-[7px] font-bold text-white/70">{f.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* ─── GET STARTED ─── */}
            <div className="px-5 pt-2 pb-6 flex-shrink-0" style={{ background: '#000' }}>
              <motion.button initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.8 }}
                onClick={() => setShowSplash(false)}
                className="w-full h-12 rounded-full font-bold text-sm text-white flex items-center justify-center gap-2"
                style={{ background: 'var(--color-primary)', boxShadow: '0 4px 20px rgba(124,58,237,0.4)' }}>
                Get Started <ArrowRight size={16} />
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── BROWSE GYMS PAGE (only render when splash is dismissed) ─── */}
      {!showSplash && (
      <div className="min-h-screen" style={{ background: 'var(--color-bg)' }}>
        {/* Hero header */}
        <div className="relative px-6 py-10 mb-4">
          <div className="absolute inset-0 overflow-hidden">
            <div className="absolute top-0 right-0 w-40 h-40 rounded-full" style={{ background: 'rgba(124,58,237,0.08)', filter: 'blur(60px)' }} />
            <div className="absolute bottom-0 left-0 w-32 h-32 rounded-full" style={{ background: 'rgba(124,58,237,0.06)', filter: 'blur(50px)' }} />
          </div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center relative z-10">
            <div className="inline-block mb-4">
              <div className="flex items-center gap-2 rounded-full px-4 py-2"
                style={{ background: 'var(--color-primary-light)', border: '1px solid rgba(124,58,237,0.25)' }}>
                <Award className="w-4 h-4" style={{ color: 'var(--color-primary)' }} />
                <span className="text-sm font-semibold" style={{ color: 'var(--color-primary)' }}>Browse Gyms & Services</span>
              </div>
            </div>

            <h1 className="text-3xl font-bold text-white mb-3 leading-tight">
              Start Your<br />
              <span style={{ color: 'var(--color-primary)' }}>Fitness Journey</span>
            </h1>

            <p className="text-white/50 text-sm mb-6 max-w-xs mx-auto">
              Select a gym to view info, then sign in
            </p>

            <div className="flex items-center justify-center gap-8">
              <div className="text-center">
                <Users className="w-5 h-5 mx-auto mb-1" style={{ color: 'var(--color-primary)' }} />
                <p className="text-2xl font-bold text-white">580+</p>
                <p className="text-[10px] text-white/40">Members</p>
              </div>
              <div className="w-px h-12" style={{ background: 'rgba(124,58,237,0.25)' }} />
              <div className="text-center">
                <Star className="w-5 h-5 mx-auto mb-1" style={{ color: 'var(--color-primary)', fill: 'var(--color-primary)' }} />
                <p className="text-2xl font-bold text-white">4.8</p>
                <p className="text-[10px] text-white/40">Rating</p>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Stats row */}
        <div className="px-6 py-3 mb-4">
          <div className="grid grid-cols-3 gap-2">
            {[
              { icon: TrendingUp, label: 'Proven Results', value: '95%' },
              { icon: Users, label: 'Active Members', value: '580+' },
              { icon: Award, label: 'Success Rate', value: '4.8★' },
            ].map((stat, i) => (
              <motion.div key={stat.label}
                initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.2 + i * 0.1 }}
                className="rounded-2xl p-3 text-center"
                style={{ background: 'var(--color-primary-light)', border: '1px solid rgba(124,58,237,0.2)' }}>
                <stat.icon className="w-5 h-5 mx-auto mb-1.5" style={{ color: 'var(--color-primary)' }} />
                <p className="text-base font-bold text-white">{stat.value}</p>
                <p className="text-[9px] text-white/50">{stat.label}</p>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Gym list */}
        <div className="px-6 pb-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-white">Choose Your Gym</h2>
            <span className="text-xs font-semibold" style={{ color: 'var(--color-primary)' }}>{GYMS.length} Locations</span>
          </div>

          {GYMS.map((gym, i) => {
            const meta = listMeta[gym.id];
            return (
              <motion.div key={gym.id}
                initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 + i * 0.12 }}
                onClick={() => navigate(`/gym/${gym.id}`)}
                className="rounded-2xl overflow-hidden cursor-pointer group active:scale-[0.98] transition-transform"
                style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}>
                {/* Cover image */}
                <div className="relative h-36 overflow-hidden">
                  <img src={gym.cover} alt={gym.name}
                    className="w-full h-full object-cover opacity-70 group-hover:opacity-90 transition-opacity" />
                  <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, transparent, rgba(15,15,26,0.8))' }} />
                  {/* Logo */}
                  <img src={gym.logo} alt={gym.name}
                    className="absolute bottom-3 left-3 w-12 h-12 object-contain bg-white rounded-xl p-0.5 shadow-lg z-10" />
                  {/* Rating badge */}
                  <div className="absolute top-3 right-3 px-2.5 py-1 rounded-full flex items-center gap-1"
                    style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}>
                    <Star className="w-3 h-3" style={{ color: 'var(--color-primary)', fill: 'var(--color-primary)' }} />
                    <span className="text-white text-xs font-bold">{meta.rating}</span>
                  </div>
                  {/* Members badge */}
                  <div className="absolute bottom-3 right-3 px-2.5 py-1 rounded-full"
                    style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}>
                    <span className="text-[10px] font-semibold" style={{ color: 'var(--color-primary)' }}>{meta.members} Members</span>
                  </div>
                </div>

                {/* Info */}
                <div className="p-4">
                  <h3 className="text-base font-bold text-white mb-0.5 group-hover:text-violet-400 transition-colors">{gym.name}</h3>
                  <p className="text-[11px] font-medium italic mb-2" style={{ color: 'var(--color-primary)' }}>"{meta.tagline}"</p>
                  <div className="flex items-center gap-1.5 text-[10px] text-white/40 mb-3">
                    <MapPin className="w-3 h-3" style={{ color: 'var(--color-primary)' }} />
                    <span>{gym.location}</span>
                  </div>
                  {/* Feature pills */}
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {meta.features.map(f => (
                      <span key={f} className="text-[9px] px-2.5 py-1 rounded-full font-medium"
                        style={{ background: 'var(--color-primary-light)', border: '1px solid rgba(124,58,237,0.2)', color: 'var(--color-primary)' }}>
                        {f}
                      </span>
                    ))}
                  </div>
                  {/* CTA */}
                  <button className="w-full h-10 rounded-full font-semibold text-sm flex items-center justify-center gap-2 text-white transition-colors"
                    style={{ background: 'var(--color-primary)' }}>
                    View Info <ChevronRight size={14} />
                  </button>
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Bottom CTA */}
        <div className="px-6 pb-8">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.8 }}
            className="rounded-2xl p-5 text-center"
            style={{ background: 'var(--color-primary-light)', border: '1px solid rgba(124,58,237,0.25)' }}>
            <h3 className="text-white font-bold text-base mb-1">Ready to join?</h3>
            <p className="text-white/50 text-xs mb-4">Explore a gym above, or get started now</p>
            <button onClick={() => setShowAuthChoice(true)}
              className="h-10 px-6 rounded-full font-bold text-sm inline-flex items-center gap-2 text-white"
              style={{ background: 'var(--color-primary)' }}>
              Get Started <ArrowRight size={14} />
            </button>
          </motion.div>
        </div>
      </div>
      )}

      <AuthChoiceSheet
        open={showAuthChoice}
        onClose={() => setShowAuthChoice(false)}
        onLogin={() => { ensureGymForAuth(); setShowAuthChoice(false); navigate('/login'); }}
        onSignUp={() => { ensureGymForAuth(); setShowAuthChoice(false); navigate('/register'); }}
      />
    </MobileFrame>
  );
}
