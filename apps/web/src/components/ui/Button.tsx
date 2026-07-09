import { forwardRef, ButtonHTMLAttributes } from 'react';
import { clsx } from 'clsx';
type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> { variant?: ButtonVariant; children: React.ReactNode; }
const variantStyles: Record<ButtonVariant, string> = {
  primary: 'bg-navy text-card hover:bg-navy-deep focus:ring-navy',
  secondary: 'bg-ice-soft text-navy border border-line hover:bg-ice focus:ring-navy',
  ghost: 'bg-transparent text-navy hover:bg-ice-soft focus:ring-navy',
  danger: 'bg-status-blocked text-white hover:bg-red-dark focus:ring-status-blocked',
};
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(({ variant = 'primary', className, children, ...props }, ref) => (
  <button ref={ref} className={clsx('inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed', variantStyles[variant], className)} {...props}>{children}</button>
));
Button.displayName = 'Button';
