import { motion } from 'framer-motion';
import { Loader2 } from 'lucide-react';

interface LoadingOverlayProps {
  message?: string;
}

export default function LoadingOverlay({ message = 'Please wait...' }: LoadingOverlayProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 z-[120] flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm pointer-events-auto"
    >
      <Loader2 className="w-12 h-12 text-yellow animate-spin mb-4" />
      <p className="text-white font-semibold text-lg">{message}</p>
    </motion.div>
  );
}
