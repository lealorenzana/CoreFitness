import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Standard pill button — single source of truth for all admin CTAs.
 * Variants:
 *   primary    = violet fill, white text
 *   secondary  = yellow fill, black text
 *   ghost      = transparent, violet text
 *   danger     = yellow outline + yellow text (no red anywhere)
 *   outline    = subtle border + white text
 */
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline' | 'gradient' | 'default' | 'destructive' | 'link';
type Size    = 'default' | 'sm' | 'lg' | 'icon';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  asChild?: boolean;
}

const baseClasses =
  'inline-flex items-center justify-center gap-2 whitespace-nowrap font-semibold transition-colors ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ' +
  'disabled:opacity-50 disabled:pointer-events-none';

const sizeClasses: Record<Size, string> = {
  default: 'h-10 px-5 text-sm rounded-full',
  sm:      'h-9  px-4 text-sm rounded-full',
  lg:      'h-11 px-6 text-sm rounded-full',
  icon:    'h-10 w-10 rounded-full',
};

const PRIMARY        = 'var(--color-primary)';
const PRIMARY_HOVER  = 'var(--color-primary-hover)';
const PRIMARY_LIGHT  = 'var(--color-primary-light)';
const SECONDARY      = 'var(--color-secondary)';
const SECONDARY_HOV  = 'var(--color-secondary-hover)';
const SECONDARY_BG   = 'var(--color-secondary-light)';
const BORDER         = 'var(--color-border)';

const variantStyles: Record<Variant, React.CSSProperties> = {
  primary:     { background: PRIMARY,   color: '#fff' },
  gradient:    { background: PRIMARY,   color: '#fff' },
  default:     { background: PRIMARY,   color: '#fff' },
  secondary:   { background: SECONDARY, color: '#000' },
  ghost:       { background: 'transparent', color: PRIMARY },
  danger:      { background: 'transparent', color: SECONDARY, border: `1px solid ${SECONDARY}` },
  destructive: { background: 'transparent', color: SECONDARY, border: `1px solid ${SECONDARY}` },
  outline:     { background: 'transparent', color: '#fff',     border: `1px solid ${BORDER}` },
  link:        { background: 'transparent', color: PRIMARY },
};

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'default', asChild = false, style, onMouseEnter, onMouseLeave, ...props }, ref) => {
    const v = variantStyles[variant] ?? variantStyles.primary;

    const handleEnter = (e: React.MouseEvent<HTMLButtonElement>) => {
      const target = e.currentTarget;
      if (variant === 'primary' || variant === 'gradient' || variant === 'default') target.style.background = PRIMARY_HOVER;
      else if (variant === 'secondary') target.style.background = SECONDARY_HOV;
      else if (variant === 'ghost') target.style.background = PRIMARY_LIGHT;
      else if (variant === 'outline') target.style.borderColor = PRIMARY;
      else if (variant === 'danger' || variant === 'destructive') target.style.background = SECONDARY_BG;
      onMouseEnter?.(e);
    };

    const handleLeave = (e: React.MouseEvent<HTMLButtonElement>) => {
      const reset = variantStyles[variant] ?? variantStyles.primary;
      e.currentTarget.style.background = (reset.background as string) ?? '';
      if (variant === 'outline') e.currentTarget.style.borderColor = BORDER;
      onMouseLeave?.(e);
    };

    const composedStyle: React.CSSProperties = { ...v, ...style };
    const classes = cn(baseClasses, sizeClasses[size], className);

    if (asChild && props.children) {
      const child = React.Children.only(props.children) as React.ReactElement<React.HTMLAttributes<HTMLElement>>;
      return React.cloneElement(child, {
        ...props,
        className: cn(classes, child.props.className),
        style: composedStyle,
        ref,
      } as React.HTMLAttributes<HTMLElement> & { ref: React.Ref<HTMLButtonElement> });
    }
    return (
      <button
        ref={ref}
        className={classes}
        style={composedStyle}
        onMouseEnter={handleEnter}
        onMouseLeave={handleLeave}
        {...props}
      />
    );
  },
);
Button.displayName = 'Button';

export default Button;
export { Button };
