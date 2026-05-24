import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';
import { useNavigate, useLocation } from 'react-router-dom';
import { MapPin, Star, Users, Dumbbell, ArrowRight, Award, TrendingUp, ChevronRight, Map, ExternalLink, Clock, Navigation, Sparkles, Tag } from 'lucide-react';
import MobileFrame from '../components/layout/MobileFrame';
import AuthChoiceSheet from '../components/ui/AuthChoiceSheet';
import GymSelectionSheet from '../components/ui/GymSelectionSheet';
import { GYMS } from '../data/gyms';
import { getSelectedGym, setSelectedGym } from '../utils/prototype';

export default function GymList() {
  const navigate = useNavigate();
  const location = useLocation();
  const [showAuthChoice, setShowAuthChoice] = useState(false);
  const [showGymSelection, setShowGymSelection] = useState(false);
  // Check state immediately - if skipSplash is true, start with false
  const [showSplash, setShowSplash] = useState(() => {
    return location.state?.skipSplash !== true;
  });
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setPortalTarget(document.getElementById('phone-screen'));
  }, []);

  useEffect(() => {
    // Scroll to gym list if coming from detail page
    if (location.state?.scrollToGymList && !showSplash) {
      setTimeout(() => {
        const gymListSection = document.getElementById('gym-list-section');
        if (gymListSection) {
          gymListSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 100);
    }
  }, [location.state, showSplash]);

  const handleGymSelected = (gymId: string, gymName: string) => {
    setSelectedGym(gymId, gymName);
    setShowGymSelection(false);
    setShowAuthChoice(true);
  };

  const listMeta: Record<string, { rating: number; members: number; tagline: string; features: string[]; successStory: string; mapUrl: string; equipmentImages: string[]; distance: string; isOpen: boolean; isFeatured: boolean; specialOffer?: string }> = {
    'g-fitness': {
      rating: 4.9, members: 250, tagline: "LET'S GET STRONGER!",
      features: ['G-Silver', 'G-Gold', 'G-Ruby', 'Per Session'],
      successStory: '"Best gym in Mamburao! Love the G-Ruby package!" - Eya L.',
      mapUrl: 'https://maps.google.com/?q=Brgy.+Payompon,+Mamburao',
      equipmentImages: ['/assets/g-fitness-cover.jpg', '/assets/g-fitness-logo.jpg'],
      distance: '1.2 km',
      isOpen: true,
      isFeatured: true,
      specialOffer: '20% OFF Student Package'
    },
    'fitness-regency': {
      rating: 4.8, members: 180, tagline: 'Where Champions Are Made',
      features: ['Olympic Weights', 'Boxing Ring', 'Sauna', 'Open Gym'],
      successStory: '"Gained 8kg of muscle! Best gym in town!" - Juan D.',
      mapUrl: 'https://maps.google.com/?q=Fitness+Regency+Mamburao',
      equipmentImages: ['/assets/fitness-regency-cover.jpg', '/assets/fitness-regency-logo.jpg'],
      distance: '2.5 km',
      isOpen: true,
      isFeatured: false,
      specialOffer: 'Free Trial Week'
    },
    'ferrer-fitness': {
      rating: 4.7, members: 150, tagline: 'Your Fitness, Our Mission',
      features: ['Personal Trainers', 'Cardio Zone', 'Free Weights', 'Lockers'],
      successStory: '"Finally found a gym that feels like home!" - Ana R.',
      mapUrl: 'https://maps.google.com/?q=Ferrer+Fitness+Mamburao',
      equipmentImages: ['/assets/ferrer-cover.png', '/assets/ferrer-logo.png'],
      distance: '3.8 km',
      isOpen: false,
      isFeatured: false
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
            className="absolute inset-0 z-[80] overflow-hidden"
            style={{ background: 'transparent' }}
          >
            {/* ─── Background Image covering entire screen ─── */}
            <div className="absolute inset-0 -top-8">
              <img src="/assets/micajoy-fitness.jpg.png" alt="Core Fitness"
                className="absolute inset-0 w-full h-full object-cover"
                style={{ transform: 'scale(1.35)', objectPosition: 'center 45%' }} />
              <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.4) 0%, rgba(0,0,0,0.15) 25%, rgba(0,0,0,0.15) 65%, rgba(0,0,0,0.5) 90%, rgba(0,0,0,0.7) 100%)' }} />
            </div>

            {/* Content overlay */}
            <div className="relative z-10 flex flex-col h-full">
              {/* Centered heading at TOP */}
              <div className="pt-14 px-5 text-center">
                <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3, duration: 0.8 }}>
                  <div className="flex flex-col items-center relative">
                    {/* Animated background glow */}
                    <motion.div
                      className="absolute inset-0 -inset-x-8"
                      animate={{ 
                        opacity: [0.3, 0.6, 0.3],
                        scale: [0.95, 1.05, 0.95]
                      }}
                      transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                      style={{
                        background: 'radial-gradient(ellipse, rgba(124,58,237,0.3) 0%, transparent 70%)',
                        filter: 'blur(40px)'
                      }}
                    />
                    
                    {/* Decorative animated lines on sides */}
                    <div className="absolute left-0 right-0 top-1/2 flex items-center justify-between pointer-events-none px-2">
                      <motion.div 
                        className="h-[3px] flex-1 mr-4"
                        initial={{ scaleX: 0, originX: 1 }}
                        animate={{ scaleX: 1 }}
                        transition={{ delay: 0.5, duration: 0.8 }}
                        style={{ 
                          background: 'linear-gradient(to right, transparent, rgba(124,58,237,0.8))',
                          boxShadow: '0 0 15px rgba(124,58,237,0.6)'
                        }}
                      />
                      <motion.div 
                        className="h-[3px] flex-1 ml-4"
                        initial={{ scaleX: 0, originX: 0 }}
                        animate={{ scaleX: 1 }}
                        transition={{ delay: 0.5, duration: 0.8 }}
                        style={{ 
                          background: 'linear-gradient(to left, transparent, rgba(124,58,237,0.8))',
                          boxShadow: '0 0 15px rgba(124,58,237,0.6)'
                        }}
                      />
                    </div>
                    
                    {/* Floating particles */}
                    {[...Array(6)].map((_, i) => (
                      <motion.div
                        key={i}
                        className="absolute w-1 h-1 rounded-full"
                        style={{
                          background: 'rgba(124,58,237,0.6)',
                          boxShadow: '0 0 8px rgba(124,58,237,0.8)',
                          left: `${20 + i * 12}%`,
                          top: `${30 + (i % 2) * 40}%`
                        }}
                        animate={{
                          y: [0, -20, 0],
                          opacity: [0.3, 0.8, 0.3],
                          scale: [1, 1.5, 1]
                        }}
                        transition={{
                          duration: 2 + i * 0.3,
                          repeat: Infinity,
                          delay: i * 0.2,
                          ease: "easeInOut"
                        }}
                      />
                    ))}
                    
                    <motion.h1 
                      className="font-black uppercase whitespace-nowrap relative z-10"
                      initial={{ x: -30, opacity: 0 }}
                      animate={{ x: 0, opacity: 1 }}
                      transition={{ delay: 0.4, duration: 0.6, type: "spring", stiffness: 100 }}
                      style={{ 
                        fontSize: '24px',
                        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
                        fontWeight: 900,
                        lineHeight: 1.1, 
                        color: '#ffffff',
                        textShadow: '0 0 50px rgba(0,0,0,1), 0 0 25px rgba(0,0,0,1), 0 6px 30px rgba(0,0,0,1), 4px 4px 10px rgba(0,0,0,1), 0 0 15px rgba(255,255,255,0.5), -1px -1px 0 rgba(0,0,0,1), 1px -1px 0 rgba(0,0,0,1), -1px 1px 0 rgba(0,0,0,1), 1px 1px 0 rgba(0,0,0,1)',
                        letterSpacing: '1.5px',
                        filter: 'drop-shadow(0 0 15px rgba(255,255,255,0.5)) brightness(1.2) contrast(1.3)'
                      }}>
                      START YOUR FITNESS
                    </motion.h1>
                    
                    <motion.h1 
                      className="font-black italic uppercase whitespace-nowrap relative z-10"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.6, duration: 0.7 }}
                      style={{ 
                        fontSize: '40px',
                        lineHeight: 1.1, 
                        color: '#ffffff',
                        textShadow: '40px 0 40px rgba(124,58,237,0.4), -40px 0 40px rgba(124,58,237,0.4), 25px 0 25px rgba(124,58,237,0.3), -25px 0 25px rgba(124,58,237,0.3), 15px 0 15px rgba(124,58,237,0.2), -15px 0 15px rgba(124,58,237,0.2), 0 4px 15px rgba(0,0,0,1), 3px 3px 6px rgba(0,0,0,1)',
                        letterSpacing: '3px',
                        transform: 'skewX(-8deg)',
                        filter: 'drop-shadow(30px 0 20px rgba(124,58,237,0.3)) drop-shadow(-30px 0 20px rgba(124,58,237,0.3))'
                      }}>
                      JOURNEY
                    </motion.h1>
                    
                    {/* Animated underline with pulse */}
                    <motion.div
                      className="mt-3 relative"
                      initial={{ scaleX: 0 }}
                      animate={{ scaleX: 1 }}
                      transition={{ delay: 0.9, duration: 0.7 }}
                    >
                      <motion.div
                        animate={{ 
                          opacity: [0.6, 1, 0.6],
                          scaleY: [1, 1.3, 1]
                        }}
                        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                        style={{
                          width: '140px',
                          height: '4px',
                          background: 'linear-gradient(90deg, transparent, #7c3aed 20%, #a78bfa 50%, #7c3aed 80%, transparent)',
                          boxShadow: '0 0 20px rgba(124,58,237,0.9), 0 0 10px rgba(124,58,237,0.6)',
                          borderRadius: '2px'
                        }}
                      />
                      {/* Side accent dots */}
                      <motion.div
                        className="absolute -left-3 top-1/2 w-2 h-2 rounded-full"
                        animate={{ scale: [1, 1.5, 1], opacity: [0.6, 1, 0.6] }}
                        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                        style={{
                          background: '#7c3aed',
                          boxShadow: '0 0 10px rgba(124,58,237,0.8)',
                          transform: 'translateY(-50%)'
                        }}
                      />
                      <motion.div
                        className="absolute -right-3 top-1/2 w-2 h-2 rounded-full"
                        animate={{ scale: [1, 1.5, 1], opacity: [0.6, 1, 0.6] }}
                        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut", delay: 1 }}
                        style={{
                          background: '#7c3aed',
                          boxShadow: '0 0 10px rgba(124,58,237,0.8)',
                          transform: 'translateY(-50%)'
                        }}
                      />
                    </motion.div>
                  </div>
                </motion.div>
              </div>
              
              {/* Add shimmer animation to styles */}
              <style>{`
                @keyframes shimmer {
                  0% { background-position: 200% 0; }
                  100% { background-position: -200% 0; }
                }
              `}</style>

              {/* Spacer to push content to bottom */}
              <div className="flex-1"></div>

              {/* ─── GET STARTED ─── */}
              <div className="px-5 pb-6 flex-shrink-0">
                <p className="text-center text-white/90 font-semibold mb-3"
                  style={{ 
                    fontSize: '14px',
                    textShadow: '0 0 20px rgba(0,0,0,0.9), 0 2px 10px rgba(0,0,0,0.8), 1px 1px 3px rgba(0,0,0,1)'
                  }}>
                  Join the <span style={{ color: 'var(--color-primary)' }}>Experience!</span>
                </p>
                <motion.button initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.8 }}
                  onClick={() => setShowSplash(false)}
                  className="w-full h-12 rounded-full font-bold text-sm text-white flex items-center justify-center gap-2"
                  style={{ background: 'var(--color-primary)', boxShadow: '0 4px 20px rgba(124,58,237,0.4)' }}>
                  Get Started <ArrowRight size={16} />
                </motion.button>
              </div>
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

            {/* Core Fitness Logo */}
            <motion.div 
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.2, duration: 0.5 }}
              className="mb-4 flex justify-center"
            >
              <div className="relative">
                <motion.div
                  animate={{ 
                    opacity: [0.85, 1, 0.85]
                  }}
                  transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                >
                  {/* Glowing background */}
                  <div 
                    className="absolute inset-0 rounded-full"
                    style={{
                      background: 'radial-gradient(circle, rgba(124,58,237,0.3) 0%, rgba(124,58,237,0.15) 50%, transparent 70%)',
                      filter: 'blur(20px)',
                      transform: 'scale(1.4)'
                    }}
                  />
                  
                  {/* Logo */}
                  <img 
                    src="/logo.png" 
                    alt="Core Fitness" 
                    className="w-[100px] h-[100px] object-contain relative z-10"
                    style={{ 
                      filter: 'drop-shadow(0 0 40px rgba(124,58,237,0.8)) drop-shadow(0 0 20px rgba(124,58,237,0.6)) brightness(1.1)',
                      opacity: 0.85
                    }} 
                  />
                </motion.div>
              </div>
            </motion.div>

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
        <div id="gym-list-section" className="px-6 pb-6 space-y-4">
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
                  
                  {/* Top badges row */}
                  <div className="absolute top-3 left-3 right-3 flex items-start justify-between gap-2">
                    {/* Left side badges */}
                    <div className="flex flex-col gap-1.5">
                      {/* Featured badge */}
                      {meta.isFeatured && (
                        <div className="px-2.5 py-1 rounded-full flex items-center gap-1"
                          style={{ background: 'rgba(251,191,36,0.95)', backdropFilter: 'blur(8px)' }}>
                          <Sparkles className="w-3 h-3 text-yellow-900" />
                          <span className="text-[10px] font-bold text-yellow-900">FEATURED</span>
                        </div>
                      )}
                      
                      {/* Open/Closed status */}
                      <div className="px-2.5 py-1 rounded-full flex items-center gap-1"
                        style={{ 
                          background: meta.isOpen ? 'rgba(34,197,94,0.95)' : 'rgba(239,68,68,0.95)', 
                          backdropFilter: 'blur(8px)' 
                        }}>
                        <Clock className="w-3 h-3 text-white" />
                        <span className="text-[10px] font-bold text-white">
                          {meta.isOpen ? 'OPEN NOW' : 'CLOSED'}
                        </span>
                      </div>
                    </div>
                    
                    {/* Rating badge */}
                    <div className="px-2.5 py-1 rounded-full flex items-center gap-1"
                      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}>
                      <Star className="w-3 h-3" style={{ color: 'var(--color-primary)', fill: 'var(--color-primary)' }} />
                      <span className="text-white text-xs font-bold">{meta.rating}</span>
                    </div>
                  </div>
                  
                  {/* Bottom right badges */}
                  <div className="absolute bottom-3 right-3 flex flex-col items-end gap-1.5">
                    {/* Distance badge */}
                    <div className="px-2.5 py-1 rounded-full flex items-center gap-1"
                      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}>
                      <Navigation className="w-3 h-3" style={{ color: 'var(--color-primary)' }} />
                      <span className="text-[10px] font-semibold text-white">{meta.distance}</span>
                    </div>
                    
                    {/* Members badge */}
                    <div className="px-2.5 py-1 rounded-full"
                      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}>
                      <span className="text-[10px] font-semibold" style={{ color: 'var(--color-primary)' }}>{meta.members} Members</span>
                    </div>
                  </div>
                </div>

                {/* Info */}
                <div className="p-4">
                  <h3 className="text-base font-bold text-white mb-0.5 group-hover:text-violet-400 transition-colors">{gym.name}</h3>
                  <p className="text-[11px] font-medium italic mb-2" style={{ color: 'var(--color-primary)' }}>"{meta.tagline}"</p>
                  
                  {/* Special Offer Badge */}
                  {meta.specialOffer && (
                    <div className="mb-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full"
                      style={{ 
                        background: 'linear-gradient(135deg, rgba(251,191,36,0.2) 0%, rgba(245,158,11,0.2) 100%)',
                        border: '1px solid rgba(251,191,36,0.4)'
                      }}>
                      <Tag className="w-3.5 h-3.5 text-yellow-400" />
                      <span className="text-[11px] font-bold text-yellow-400">{meta.specialOffer}</span>
                    </div>
                  )}
                  
                  {/* Location */}
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
            <button onClick={() => setShowGymSelection(true)}
              className="h-10 px-6 rounded-full font-bold text-sm inline-flex items-center gap-2 text-white"
              style={{ background: 'var(--color-primary)' }}>
              Start Now <ArrowRight size={14} />
            </button>
          </motion.div>
        </div>
      </div>
      )}

      <GymSelectionSheet
        open={showGymSelection}
        onClose={() => setShowGymSelection(false)}
        onSelectGym={handleGymSelected}
      />

      <AuthChoiceSheet
        open={showAuthChoice}
        onClose={() => setShowAuthChoice(false)}
        onLogin={() => { setShowAuthChoice(false); navigate('/login'); }}
        onSignUp={() => { setShowAuthChoice(false); navigate('/register'); }}
      />
    </MobileFrame>
  );
}
