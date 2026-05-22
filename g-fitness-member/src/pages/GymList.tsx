import { useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { MapPin, Star, Users, Dumbbell, ArrowRight, Award, TrendingUp } from 'lucide-react';
import MobileFrame from '../components/layout/MobileFrame';
import AuthChoiceSheet from '../components/ui/AuthChoiceSheet';
import { GYMS } from '../data/gyms';
import { getSelectedGym, setSelectedGym } from '../utils/prototype';

export default function GymList() {
  const navigate = useNavigate();
  const [showAuthChoice, setShowAuthChoice] = useState(false);

  const ensureGymForAuth = () => {
    if (!getSelectedGym()) {
      setSelectedGym('g-fitness', 'G-Fitness');
    }
  };

  const listMeta: Record<string, { rating: number; members: number; tagline: string; features: string[]; successStory: string }> = {
    'g-fitness': {
      rating: 4.9,
      members: 250,
      tagline: "LET'S GET STRONGER!",
      features: ['G-Silver', 'G-Gold', 'G-Ruby', 'Per Session ₱100'],
      successStory: '"Best gym in Mamburao! Love the G-Ruby package!" - Eya L.',
    },
    'fitness-regency': {
      rating: 4.8,
      members: 180,
      tagline: 'Where Champions Are Made',
      features: ['Olympic Weights', 'Boxing Ring', 'Sauna', 'Open Gym'],
      successStory: '"Gained 8kg of muscle! Best gym in town!" - Juan D.',
    },
    'ferrer-fitness': {
      rating: 4.7,
      members: 150,
      tagline: 'Your Fitness, Our Mission',
      features: ['Personal Trainers', 'Cardio Zone', 'Free Weights', 'Locker Rooms'],
      successStory: '"Finally found a gym that feels like home!" - Ana R.',
    },
  };

  return (
    <MobileFrame>
      <div className="min-h-screen" style={{ backgroundColor: '#050400' }}>
        <div className="relative px-6 py-10 mb-6">
          <div className="absolute inset-0 overflow-hidden">
            <div className="absolute top-0 right-0 w-40 h-40 rounded-full blur-3xl" style={{ background: 'var(--color-secondary-light)' }} />
            <div className="absolute bottom-0 left-0 w-32 h-32 rounded-full blur-3xl" style={{ background: 'rgba(201,162,39,0.06)' }} />
          </div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center relative z-10">
            <div className="inline-block mb-4">
              <div className="flex items-center gap-2 rounded-full px-4 py-2" style={{ background: 'var(--color-secondary-light)', border: '1px solid rgba(246,201,14,0.22)' }}>
                <Award className="w-4 h-4" style={{ color: '#f6c90e' }} />
                <span className="text-sm font-semibold" style={{ color: '#f6c90e' }}>Browse Gyms & Services</span>
              </div>
            </div>

            <h1 className="text-4xl font-orbitron font-bold text-white mb-3 leading-tight">
              Start Your<br />
              <span className="text-gradient">
                Fitness Journey
              </span>
            </h1>

            <p className="text-white/60 text-base mb-6 max-w-xs mx-auto">
              Select a gym to view info, then sign in
            </p>

            <div className="flex items-center justify-center gap-8">
              <div className="text-center">
                <Users className="w-5 h-5 mx-auto mb-1" style={{ color: '#f6c90e' }} />
                <p className="text-2xl font-bold text-white font-orbitron">580+</p>
                <p className="text-xs text-white/40">Members</p>
              </div>
              <div className="w-px h-12" style={{ background: 'rgba(245,158,11,0.20)' }} />
              <div className="text-center">
                <Star className="w-5 h-5 mx-auto mb-1" style={{ color: '#ffe066', fill: '#ffe066' }} />
                <p className="text-2xl font-bold text-white font-orbitron">4.8</p>
                <p className="text-xs text-white/40">Rating</p>
              </div>
            </div>
          </motion.div>
        </div>

        <div className="px-6 py-4 mb-4">
          <div className="grid grid-cols-3 gap-3">
            {[
              { icon: TrendingUp, label: 'Proven Results', value: '95%' },
              { icon: Users, label: 'Active Members', value: '580+' },
              { icon: Award, label: 'Success Rate', value: '4.8★' },
            ].map((stat, index) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.2 + index * 0.1 }}
                className="rounded-2xl p-4 text-center"
                style={{
                  background: 'var(--color-secondary-light)',
                  border: '1px solid var(--color-secondary-light)',
                }}
              >
                <stat.icon className="w-6 h-6 mx-auto mb-2" style={{ color: '#f6c90e' }} />
                <p className="text-lg font-bold text-white font-orbitron">{stat.value}</p>
                <p className="text-[10px] text-white/60">{stat.label}</p>
              </motion.div>
            ))}
          </div>
        </div>

        <div className="px-6 pb-6 space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-white">Choose Your Gym</h2>
            <div className="text-sm font-semibold" style={{ color: '#f6c90e' }}>{GYMS.length} Locations</div>
          </div>

          {GYMS.map((gym, index) => {
            const meta = listMeta[gym.id];
            return (
              <motion.div
                key={gym.id}
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 + index * 0.15 }}
                onClick={() => navigate(`/gym/${gym.id}`)}
                className="rounded-3xl overflow-hidden cursor-pointer group"
                style={{
                  background: 'rgba(10,8,0,0.65)',
                  border: '1px solid var(--color-secondary-light)',
                  backdropFilter: 'blur(12px)',
                }}
              >
                <div className="relative h-44 overflow-hidden">
                  <img
                    src={gym.cover}
                    alt={`${gym.name} cover`}
                    className="w-full h-full object-cover opacity-60 group-hover:opacity-80 transition-opacity"
                  />
                  <div className="absolute inset-0" style={{ background: 'rgba(5,4,0,0.55)' }} />
                  <img
                    src={gym.logo}
                    alt={gym.name}
                    className="absolute bottom-4 left-4 w-16 h-16 object-contain bg-white rounded-xl p-1 shadow-lg z-10"
                  />
                  <div className="absolute top-4 right-4 px-3 py-1.5 rounded-full flex items-center gap-1.5" style={{ background: 'rgba(5,4,0,0.85)', border: '1px solid rgba(245,158,11,0.30)' }}>
                    <Star className="w-4 h-4" style={{ color: '#f6c90e', fill: '#f6c90e' }} />
                    <span className="text-white text-sm font-bold">{meta.rating}</span>
                  </div>
                  <div className="absolute bottom-4 right-4 px-3 py-1 rounded-full" style={{ background: 'var(--color-secondary-light)', border: '1px solid rgba(246,201,14,0.22)' }}>
                    <span className="text-xs font-semibold" style={{ color: '#ffe066' }}>{meta.members} Members</span>
                  </div>
                </div>

                <div className="p-5">
                  <h3 className="text-xl font-bold text-white mb-1 group-hover:text-yellow-400 transition-colors">
                    {gym.name}
                  </h3>
                  <p className="font-semibold text-sm mb-3 italic" style={{ color: '#f6c90e' }}>&quot;{meta.tagline}&quot;</p>
                  <div className="flex items-center gap-2 text-white/40 text-xs mb-4">
                    <MapPin className="w-3.5 h-3.5" style={{ color: '#f6c90e' }} />
                    <span>{gym.location}</span>
                  </div>
                  <div className="flex flex-wrap gap-2 mb-4">
                    {meta.features.map((feature) => (
                      <span
                        key={feature}
                        className="text-[11px] px-3 py-1.5 rounded-full"
                        style={{
                          background: 'var(--color-secondary-light)',
                          border: '1px solid rgba(246,201,14,0.18)',
                          color: '#ffe066',
                        }}
                      >
                        {feature}
                      </span>
                    ))}
                  </div>
                  <div className="rounded-lg p-3 mb-4" style={{ background: 'var(--color-secondary-light)', borderLeft: '2px solid rgba(245,158,11,0.40)' }}>
                    <p className="text-white/60 text-xs italic">{meta.successStory}</p>
                  </div>
                  <button
                    className="w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2 text-black"
                    style={{ background: 'var(--color-secondary)' }}
                  >
                    <Dumbbell className="w-5 h-5" />
                    <span>View {gym.name} Info</span>
                    <ArrowRight className="w-5 h-5" />
                  </button>
                </div>
              </motion.div>
            );
          })}
        </div>

        <div className="px-6 pb-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.9 }}
            className="rounded-3xl p-6 text-center"
            style={{
              background: 'var(--color-secondary-light)',
              border: '1px solid rgba(246,201,14,0.22)',
            }}
          >
            <h3 className="text-white font-bold text-xl mb-2">Ready to join?</h3>
            <p className="text-white/60 text-sm mb-4">Explore a gym above, or get started now</p>
            <button
              onClick={() => setShowAuthChoice(true)}
              className="px-6 py-3 rounded-xl font-bold inline-flex items-center gap-2 text-black"
              style={{ background: 'var(--color-secondary)' }}
            >
              Get Started
              <ArrowRight className="w-5 h-5" />
            </button>
          </motion.div>
        </div>
      </div>

      <AuthChoiceSheet
        open={showAuthChoice}
        onClose={() => setShowAuthChoice(false)}
        onLogin={() => {
          ensureGymForAuth();
          setShowAuthChoice(false);
          navigate('/login');
        }}
        onSignUp={() => {
          ensureGymForAuth();
          setShowAuthChoice(false);
          navigate('/register');
        }}
      />
    </MobileFrame>
  );
}
