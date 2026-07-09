import { create } from 'zustand';
import { X, CheckCircle, AlertTriangle, Info, AlertCircle } from 'lucide-react';
import { clsx } from 'clsx';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
  id: string;
  type: ToastType;
  message: string;
  duration?: number;
}

interface ToastStore {
  toasts: Toast[];
  addToast: (type: ToastType, message: string, duration?: number) => void;
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
  addToast: (type, message, duration = 4000) => {
    const id = `toast-${++toastCounter}-${Date.now()}`;
    set(s => ({ toasts: [...s.toasts, { id, type, message, duration }] }));
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
            <p className="text-xs font-medium text-navy dark:text-ice leading-relaxed flex-1">{t.message}</p>
            <button
              onClick={() => removeToast(t.id)}
              className="absolute top-2 right-2 p-0.5 rounded text-grey hover:text-navy dark:hover:text-ice transition-colors"
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
