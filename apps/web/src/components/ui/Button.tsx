import { forwardRef, ButtonHTMLAttributes } from 'react';
import { clsx } from 'clsx';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'xs' | 'sm' | 'md';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: React.ReactNode;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary: 'bg-navy text-card hover:bg-navy-deep',
  secondary: 'bg-ice-soft text-navy border border-line hover:bg-ice',
  ghost: 'bg-transparent text-navy hover:bg-ice-soft',
  danger: 'bg-status-blocked text-white hover:bg-red-dark',
};

// xs matches the dense in-page action buttons the app is full of; md is the
// original default (forms, primary CTAs).
const sizeStyles: Record<ButtonSize, string> = {
  xs: 'gap-1 px-2 py-1 text-micro font-bold rounded',
  sm: 'gap-1.5 px-3 py-1.5 text-label font-semibold rounded-md',
  md: 'gap-2 px-4 py-2 text-sm font-medium rounded-md',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', className, children, ...props }, ref) => (
    <button
      ref={ref}
      className={clsx(
        'inline-flex items-center justify-center transition-colors focus-ring disabled:opacity-50 disabled:cursor-not-allowed',
        sizeStyles[size],
        variantStyles[variant],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  ),
);
Button.displayName = 'Button';
