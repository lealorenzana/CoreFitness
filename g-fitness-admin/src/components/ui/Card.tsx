import { ReactNode } from 'react';
import { motion } from 'framer-motion';

interface CardProps {
  children: ReactNode;
  className?: string;
  header?: ReactNode;
  footer?: ReactNode;
  animated?: boolean;
}

export default function Card({ children, className = '', header, footer, animated = true }: CardProps) {
  const cardContent = (
    <div className={`bg-dark-lighter/80 backdrop-blur-sm border border-dark-border rounded-2xl overflow-hidden shadow-xl hover:shadow-2xl transition-all duration-300 ${className}`}>
      {header && (
        <div className="px-6 py-5 border-b border-dark-border bg-dark-lighter/50">
          {header}
        </div>
      )}
      <div className="px-6 py-6">
        {children}
      </div>
      {footer && (
        <div className="px-6 py-5 border-t border-dark-border bg-dark-lighter/50">
          {footer}
        </div>
      )}
    </div>
  );

  if (animated) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        {cardContent}
      </motion.div>
    );
  }

  return cardContent;
}
