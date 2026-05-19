import { ReactNode } from 'react';

interface BadgeProps {
  children: ReactNode;
  variant?: 'Active' | 'Expired' | 'Suspended' | 'High' | 'Medium' | 'Low' | 'Basic' | 'Standard' | 'Premium';
  className?: string;
}

export default function Badge({ children, variant = 'Active', className = '' }: BadgeProps) {
  const variantStyles = {
    Active: 'bg-green-500/20 text-green-400 border-green-500/50',
    Expired: 'bg-red-500/20 text-red-400 border-red-500/50',
    Suspended: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50',
    High: 'bg-red-500/20 text-red-400 border-red-500/50',
    Medium: 'bg-orange-500/20 text-orange-400 border-orange-500/50',
    Low: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50',
    Basic: 'bg-gray-500/20 text-gray-400 border-gray-500/50',
    Standard: 'bg-blue-500/20 text-blue-400 border-blue-500/50',
    Premium: 'bg-purple-500/20 text-purple-400 border-purple-500/50',
  };

  return (
    <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium border ${variantStyles[variant]} ${className}`}>
      {children}
    </span>
  );
}
