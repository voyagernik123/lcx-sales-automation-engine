import { forwardRef, SelectHTMLAttributes } from 'react';
import { clsx } from 'clsx';
interface SelectOption { value: string; label: string; }
interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'children'> { label?: string; error?: string; options: SelectOption[]; }
export const Select = forwardRef<HTMLSelectElement, SelectProps>(({ label, error, options, className, id, ...props }, ref) => {
  const selectId = id || label?.toLowerCase().replace(/\s+/g, '-');
  return (
    <div className="w-full">
      {label && <label htmlFor={selectId} className="block text-sm font-medium text-navy mb-1">{label}</label>}
      {/* --control-border, not --line — same 1.4.11 defect as Input.tsx: on --line this
        * edge measured 1.72:1 light on --card and 1.03:1 dark on --ice against a 3:1
        * floor. --control-border measures 3.97 / 3.43 there. */}
      <select ref={ref} id={selectId} aria-invalid={!!error} className={clsx('block w-full rounded-md border bg-card px-3 py-2 text-sm shadow-sm focus-ring focus:border-navy disabled:opacity-50', error ? 'border-status-blocked' : 'border-control', className)} {...props}>
        {options.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
      </select>
      {error && <p id={`${selectId}-error`} className="mt-1 text-xs text-status-blocked" role="alert">{error}</p>}
    </div>
  );
});
Select.displayName = 'Select';
