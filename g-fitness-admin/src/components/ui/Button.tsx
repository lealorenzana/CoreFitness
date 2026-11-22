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
  // Design V2: one control height and 8px corners across the app, never a pill.
  default: 'h-9 px-4 text-[13px] rounded-lg',
  sm:      'h-8 px-3 text-[12.5px] rounded-lg',
  lg:      'h-10 px-5 text-[14px] rounded-lg',
  icon:    'h-9 w-9 rounded-lg',
};

const PRIMARY        = 'var(--color-primary)';
const PRIMARY_HOVER  = 'var(--color-primary-hover)';
const PRIMARY_LIGHT  = 'var(--color-primary-light)';
const SECONDARY      = 'var(--color-secondary)';
const SECONDARY_HOV  = 'var(--color-secondary-hover)';
const SECONDARY_BG   = 'var(--color-secondary-light)';
const BORDER         = 'var(--color-border)';

const variantStyles: Record<Variant, React.CSSProperties> = {
  // The main button wears the gym's own action colour (Design V2: one "do this" colour per screen).
  primary:     { background: 'var(--v2-act, #F59E0B)', color: 'var(--v2-on-act, #1a1206)' },
  gradient:    { background: 'var(--v2-act, #F59E0B)', color: 'var(--v2-on-act, #1a1206)' },
  default:     { background: 'var(--v2-act, #F59E0B)', color: 'var(--v2-on-act, #1a1206)' },
  // Words on the gym's second colour: black on amber in dark, white on light mode's solid fill (--on-secondary) — fixed black
  // read dark-on-violet on Add staff (owner, 2026-11-07).
  secondary:   { background: SECONDARY, color: 'var(--on-secondary, #000)' },
  ghost:       { background: 'transparent', color: 'var(--color-text-secondary)' },
  danger:      { background: 'transparent', color: SECONDARY, border: `1px solid ${SECONDARY}` },
  destructive: { background: 'transparent', color: SECONDARY, border: `1px solid ${SECONDARY}` },
  outline:     { background: 'transparent', color: 'var(--color-text-primary)', border: `1px solid ${BORDER}` },
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
