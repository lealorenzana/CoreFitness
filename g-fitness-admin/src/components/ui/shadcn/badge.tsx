import * as React from 'react';
import { cn } from '../../../lib/utils';

const variantClasses = {
  default: 'border-transparent bg-primary text-primary-foreground shadow',
  secondary: 'border-transparent bg-secondary text-secondary-foreground',
  destructive: 'border-transparent bg-destructive text-destructive-foreground shadow',
  outline: 'text-foreground border-border',
  success: 'border-transparent bg-emerald-500/15 text-violet border-emerald-500/30',
  warning: 'border-transparent bg-amber-500/15 text-yellow border-amber-500/30',
  danger: 'border-transparent bg-destructive/15 text-destructive border-destructive/30',
  info: 'border-transparent bg-sky-500/15 text-sky-400 border-sky-500/30',
  muted: 'border-transparent bg-muted text-muted-foreground',
} as const;

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: keyof typeof variantClasses;
}

function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  return (
    <div
      className={cn(
        'inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-colors',
        variantClasses[variant],
        className
      )}
      {...props}
    />
  );
}

export { Badge };
