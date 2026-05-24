import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';
import { useEffect, useState } from 'react';
import { X, MapPin, Star, ChevronRight } from 'lucide-react';
import { GYMS } from '../../data/gyms';

interface GymSelectionSheetProps {
  open: boolean;
  onClose: () => void;
  onSelectGym: (gymId: string, gymName: string) => void;
}

function getOverlayRoot(): HTMLElement | null {
  return document.getElementById('phone-overlay-root') ?? document.getElementById('phone-screen');
}

export default function GymSelectionSheet({ open, onClose, onSelectGym }: GymSelectionSheetProps) {
  const [overlayRoot, setOverlayRoot] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setOverlayRoot(getOverlayRoot());
  }, []);

  if (!overlayRoot) return null;

  const gymRatings: Record<string, number> = {
    'g-fitness': 4.9,
    'fitness-regency': 4.8,
    'ferrer-fitness': 4.7,
  };

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/70 backdrop-blur-sm z-[10] pointer-events-auto"
          />
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }}
            className="absolute bottom-0 left-0 right-0 z-[20] pointer-events-auto px-4 pb-6"
          >
            <div className="bg-[rgba(10,8,0,0.95)] border border-[var(--color-secondary-light)] rounded-2xl p-5 shadow-2xl max-h-[70vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-white font-bold text-lg">Choose Your Gym</h3>
                <button
                  onClick={onClose}
                  className="p-2 rounded-lg bg-gray-800 text-white/40 hover:text-white"
                >
                  <X size={18} />
                </button>
              </div>
              <p className="text-white/40 text-sm mb-5">Select a gym to continue with sign up or login</p>
              
              <div className="space-y-3">
                {GYMS.map((gym) => (
                  <button
                    key={gym.id}
                    onClick={() => onSelectGym(gym.id, gym.name)}
                    className="w-full text-left rounded-xl overflow-hidden border border-white/10 hover:border-[var(--color-primary)] transition-all group"
                  >
                    <div className="flex items-center gap-3 p-3 bg-black/40 group-hover:bg-black/60">
                      <img 
                        src={gym.logo} 
                        alt={gym.name}
                        className="w-12 h-12 object-contain bg-white rounded-lg p-1"
                      />
                      <div className="flex-1">
                        <h4 className="text-white font-semibold text-sm mb-0.5">{gym.name}</h4>
                        <div className="flex items-center gap-3 text-xs">
                          <div className="flex items-center gap-1 text-white/40">
                            <MapPin size={12} style={{ color: 'var(--color-primary)' }} />
                            <span>{gym.location}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Star size={12} style={{ color: 'var(--color-primary)', fill: 'var(--color-primary)' }} />
                            <span className="text-white font-semibold">{gymRatings[gym.id]}</span>
                          </div>
                        </div>
                      </div>
                      <ChevronRight size={20} className="text-white/40 group-hover:text-[var(--color-primary)]" />
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    overlayRoot
  );
}
