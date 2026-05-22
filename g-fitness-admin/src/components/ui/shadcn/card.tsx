import * as React from 'react';
import { cn } from '@/lib/utils';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  header?: React.ReactNode;
}

const SURFACE = 'var(--color-surface)';
const BORDER  = 'var(--color-border)';

/**
 * Standard surface card — bg var(--color-surface-raised), 16px radius, subtle border + shadow.
 * Used everywhere in the admin app.
 */
const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, header, children, style, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('p-4 sm:p-5', className)}
      style={{
        background: SURFACE,
        border: `1px solid ${BORDER}`,
        borderRadius: 'var(--radius-card)',
        boxShadow: 'var(--shadow-card)',
        ...style,
      }}
      {...props}
    >
      {header && <div className="mb-4">{header}</div>}
      {children}
    </div>
  ),
);
Card.displayName = 'Card';

const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex flex-col space-y-1.5 pb-4', className)} {...props} />
  ),
);
CardHeader.displayName = 'CardHeader';

const CardTitle = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3 ref={ref} className={cn('text-base font-semibold leading-none tracking-tight text-white', className)} {...props} />
  ),
);
CardTitle.displayName = 'CardTitle';

const CardDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p ref={ref} className={cn('text-sm', className)} style={{ color: 'var(--color-text-secondary)' }} {...props} />
  ),
);
CardDescription.displayName = 'CardDescription';

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} className={cn('pt-0', className)} {...props} />,
);
CardContent.displayName = 'CardContent';

const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} className={cn('flex items-center pt-4', className)} {...props} />,
);
CardFooter.displayName = 'CardFooter';

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent };
export default Card;
