import { forwardRef, InputHTMLAttributes } from 'react';
import { clsx } from 'clsx';
interface InputProps extends InputHTMLAttributes<HTMLInputElement> { label?: string; error?: string; }
export const Input = forwardRef<HTMLInputElement, InputProps>(({ label, error, className, id, ...props }, ref) => {
  const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');
  return (
    <div className="w-full">
      {label && <label htmlFor={inputId} className="block text-sm font-medium text-navy mb-1">{label}</label>}
      <input ref={ref} id={inputId} aria-invalid={!!error} aria-describedby={error ? `${inputId}-error` : undefined} className={clsx('block w-full rounded-md border bg-card px-3 py-2 text-sm shadow-sm placeholder:text-grey-light focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy disabled:opacity-50 disabled:cursor-not-allowed', error ? 'border-status-blocked focus:ring-status-blocked' : 'border-line', className)} {...props} />
      {error && <p id={`${inputId}-error`} className="mt-1 text-xs text-status-blocked" role="alert">{error}</p>}
    </div>
  );
});
Input.displayName = 'Input';
