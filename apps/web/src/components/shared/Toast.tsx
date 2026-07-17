import { create } from 'zustand';
import { X, CheckCircle, AlertTriangle, Info, AlertCircle } from 'lucide-react';
import { clsx } from 'clsx';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastAction {
  label: string;
  onAction: () => void;
}

export interface Toast {
  id: string;
  type: ToastType;
  message: string;
  duration?: number;
  /** Undo-style affordance (plan 4.1 rule 4: undo, don't confirm). */
  action?: ToastAction;
}

interface ToastStore {
  toasts: Toast[];
  addToast: (type: ToastType, message: string, duration?: number, action?: ToastAction) => void;
  removeToast: (id: string) => void;
}

let toastCounter = 0;

const toastConfig: Record<ToastType, { icon: typeof CheckCircle; containerClass: string; iconClass: string }> = {
  success: {
    icon: CheckCircle,
    containerClass: 'border-emerald-500/30 bg-emerald-500/10',
    iconClass: 'text-emerald-500',
  },
  error: {
    icon: AlertCircle,
    containerClass: 'border-red-500/30 bg-red-500/10',
    iconClass: 'text-red-500',
  },
  warning: {
    icon: AlertTriangle,
    containerClass: 'border-amber-500/30 bg-amber-500/10',
    iconClass: 'text-amber-500',
  },
  info: {
    icon: Info,
    containerClass: 'border-blue-500/30 bg-blue-500/10',
    iconClass: 'text-blue-500',
  },
};

export const useToastStore = create<ToastStore>(set => ({
  toasts: [],
  addToast: (type, message, duration = 4000, action) => {
    const id = `toast-${++toastCounter}-${Date.now()}`;
    set(s => ({ toasts: [...s.toasts, { id, type, message, duration, action }] }));
    if (duration > 0) {
      setTimeout(() => {
        set(s => ({ toasts: s.toasts.filter(t => t.id !== id) }));
      }, duration);
    }
  },
  removeToast: id => set(s => ({ toasts: s.toasts.filter(t => t.id !== id) })),
}));

export function toast(type: ToastType, message: string, duration?: number) {
  useToastStore.getState().addToast(type, message, duration);
}

/**
 * The undo pattern: the action already happened; this is the 6-second
 * window to take it back. Never a confirmation dialog for reversible work.
 */
export function toastUndo(message: string, onUndo: () => void, duration = 6000) {
  useToastStore.getState().addToast('success', message, duration, { label: 'Undo', onAction: onUndo });
}

export function ToastContainer() {
  const { toasts, removeToast } = useToastStore();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col-reverse gap-2 max-w-sm w-full pointer-events-none">
      {toasts.map(t => {
        const config = toastConfig[t.type];
        const Icon = config.icon;
        return (
          <div
            key={t.id}
            className={clsx(
              'pointer-events-auto flex items-start gap-3 rounded-lg border p-3 pr-8 shadow-lg animate-slide-in relative',
              config.containerClass
            )}
            role="alert"
          >
            <Icon size={16} className={clsx('shrink-0 mt-0.5', config.iconClass)} />
            <p className="text-xs font-medium text-navy leading-relaxed flex-1">{t.message}</p>
            {t.action && (
              <button
                onClick={() => {
                  t.action?.onAction();
                  removeToast(t.id);
                }}
                className="shrink-0 self-center rounded-md border border-line bg-card px-2 py-1 text-micro font-bold text-navy transition-colors hover:border-cyan-500/60 hover:text-cyan-700 dark:hover:text-cyan-400"
              >
                {t.action.label}
              </button>
            )}
            <button
              onClick={() => removeToast(t.id)}
              className="absolute top-2 right-2 p-0.5 rounded text-grey hover:text-navy transition-colors"
              aria-label="Dismiss notification"
            >
              <X size={12} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

export function useToast() {
  return { toast };
}
