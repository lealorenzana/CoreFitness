import * as React from 'react';
import { cn } from '@/lib/utils';

const SURFACE_RAISED = 'var(--color-surface-raised)';
const BORDER         = 'var(--color-border)';
const PRIMARY        = 'var(--color-primary)';

/**
 * Standard input — surface-raised bg, violet focus ring, white text.
 * Consistent 40px height across the app.
 */
const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, style, onFocus, onBlur, ...props }, ref) => (
    <input
      ref={ref}
      className={cn('w-full px-4 text-sm rounded-xl transition-colors focus:outline-none', className)}
      style={{
        height: 40,
        background: SURFACE_RAISED,
        border: `1px solid ${BORDER}`,
        color: '#fff',
        ...style,
      }}
      onFocus={(e) => {
        e.currentTarget.style.borderColor = PRIMARY;
        e.currentTarget.style.boxShadow = '0 0 0 3px rgba(124,58,237,0.18)';
        onFocus?.(e);
      }}
      onBlur={(e) => {
        e.currentTarget.style.borderColor = BORDER;
        e.currentTarget.style.boxShadow = 'none';
        onBlur?.(e);
      }}
      {...props}
    />
  ),
);
Input.displayName = 'Input';

export default Input;
export { Input };
