import { motion } from 'framer-motion';

interface LogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  animated?: boolean;
  showText?: boolean;
}

const sizeMap = {
  sm: 40,
  md: 60,
  lg: 100,
  xl: 200,
};

export default function Logo({ size = 'md', animated = false, showText = true }: LogoProps) {
  const dimension = sizeMap[size];

  const logoVariants = {
    initial: { scale: 0.8, opacity: 0 },
    animate: { 
      scale: 1, 
      opacity: 1,
      transition: { duration: 0.5, ease: 'easeOut' as const }
    },
    pulse: {
      scale: [1, 1.05, 1],
      transition: { duration: 2, repeat: Infinity, ease: 'easeInOut' as const }
    }
  };

  const LogoContent = (
    <div className="flex items-center gap-3">
      <img 
        src="/logo.png" 
        alt="Core Fitness Logo" 
        className="object-contain"
        style={{ width: dimension, height: dimension }}
      />
      
      {showText && (
        <div className="flex flex-col">
          <h1 className="font-orbitron font-bold text-gradient leading-none" style={{ fontSize: dimension * 0.35 }}>
            CORE FITNESS
          </h1>
          <p className="text-gray-400 text-xs font-medium tracking-wider">ADMIN</p>
        </div>
      )}
    </div>
  );

  if (animated) {
    return (
      <motion.div
        variants={logoVariants}
        initial="initial"
        animate={["animate", "pulse"]}
        className="inline-block"
      >
        {LogoContent}
      </motion.div>
    );
  }

  return <div className="inline-block">{LogoContent}</div>;
}
