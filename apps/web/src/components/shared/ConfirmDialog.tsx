import { Modal } from '@/components/ui';
import { AlertTriangle } from 'lucide-react';

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning' | 'default';
}

export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'default',
}: ConfirmDialogProps) {
  const handleConfirm = () => {
    onConfirm();
    onClose();
  };

  const variantStyles = {
    danger: 'bg-red-500 hover:bg-red-600 text-white',
    warning: 'bg-amber-500 hover:bg-amber-600 text-white',
    default: 'bg-navy dark:bg-ice text-white dark:text-navy hover:opacity-95',
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title=""
      footer={
        <>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-md border border-line text-xs font-semibold hover:bg-ice-soft dark:hover:bg-ice-soft/10 transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            onClick={handleConfirm}
            className={`px-4 py-2 rounded-md text-xs font-semibold transition-colors ${variantStyles[variant]}`}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      <div className="flex items-start gap-3">
        {(variant === 'danger' || variant === 'warning') && (
          <div className={`shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${variant === 'danger' ? 'bg-red-500/10' : 'bg-amber-500/10'}`}>
            <AlertTriangle size={20} className={variant === 'danger' ? 'text-red-500' : 'text-amber-500'} />
          </div>
        )}
        <div>
          <h3 className="text-sm font-bold text-navy dark:text-ice mb-1">{title}</h3>
          <p className="text-xs text-grey-dark dark:text-grey-light leading-relaxed">{message}</p>
        </div>
      </div>
    </Modal>
  );
}
