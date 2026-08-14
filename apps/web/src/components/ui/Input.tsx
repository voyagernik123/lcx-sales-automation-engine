import { forwardRef, InputHTMLAttributes } from 'react';
import { clsx } from 'clsx';
interface InputProps extends InputHTMLAttributes<HTMLInputElement> { label?: string; error?: string; }
export const Input = forwardRef<HTMLInputElement, InputProps>(({ label, error, className, id, ...props }, ref) => {
  const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');
  return (
    <div className="w-full">
      {label && <label htmlFor={inputId} className="block text-sm font-medium text-navy mb-1">{label}</label>}
      {/* --control-border, not --line: this hairline is the ONLY thing marking the edge of
        * the field, so WCAG 2.2 SC 1.4.11 requires 3:1 against the surface behind it. On
        * --line it measured 1.72 light on --card and 1.03 dark on --ice — the dark case is
        * very nearly invisible. --control-border measures 3.97 and 3.43 on those same two.
        * --line stays correct for table rules and card edges, which 1.4.11 does not cover;
        * see the token comment in styles/tokens.css. */}
      <input ref={ref} id={inputId} aria-invalid={!!error} aria-describedby={error ? `${inputId}-error` : undefined} className={clsx('block w-full rounded-md border bg-card px-3 py-2 text-sm shadow-sm placeholder:text-grey-light focus-ring focus:border-navy disabled:opacity-50 disabled:cursor-not-allowed', error ? 'border-status-blocked' : 'border-control', className)} {...props} />
      {error && <p id={`${inputId}-error`} className="mt-1 text-xs text-status-blocked" role="alert">{error}</p>}
    </div>
  );
});
Input.displayName = 'Input';
