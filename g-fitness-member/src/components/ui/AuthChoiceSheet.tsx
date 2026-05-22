import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';
import { useEffect, useState } from 'react';
import { LogIn, UserPlus, X } from 'lucide-react';

interface AuthChoiceSheetProps {
  open: boolean;
  onClose: () => void;
  onLogin: () => void;
  onSignUp: () => void;
}

function getOverlayRoot(): HTMLElement | null {
  return document.getElementById('phone-overlay-root') ?? document.getElementById('phone-screen');
}

export default function AuthChoiceSheet({ open, onClose, onLogin, onSignUp }: AuthChoiceSheetProps) {
  const [overlayRoot, setOverlayRoot] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setOverlayRoot(getOverlayRoot());
  }, []);

  if (!overlayRoot) return null;

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
            <div className="bg-[rgba(10,8,0,0.85)] border border-[var(--color-secondary-light)] rounded-2xl p-5 shadow-2xl">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-white font-bold text-lg">Get Started</h3>
                <button
                  onClick={onClose}
                  className="p-2 rounded-lg bg-gray-800 text-white/40 hover:text-white"
                >
                  <X size={18} />
                </button>
              </div>
              <p className="text-white/40 text-sm mb-5">Choose how you&apos;d like to continue</p>
              <div className="space-y-3">
                <button
                  onClick={onLogin}
                  className="w-full flex items-center justify-center gap-2 py-3.5 bg-white text-black rounded-xl font-bold hover:bg-gray-100 transition-colors"
                >
                  <LogIn size={20} />
                  Login
                </button>
                <button
                  onClick={onSignUp}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold transition-colors text-black"
                  style={{ background: 'var(--color-secondary)' }}
                >
                  <UserPlus size={20} />
                  Sign Up
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    overlayRoot
  );
}
