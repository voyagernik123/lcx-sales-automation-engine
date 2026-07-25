import { useState } from 'react';
import { Modal, Button, Select } from '@/components/ui';

/**
 * Win/loss capture dialog — replaces the old window.prompt() flow on the
 * Deal Board. Reason category select + free-text note, consistent with the
 * design system. Loss categories feed the win/loss analytics.
 */

export interface WinLossResult {
  /** Composed human reason (goes to winReason / lossReason). */
  reason: string;
  /** Loss category slug — only for mode 'lost'. */
  category?: string;
}

export interface WinLossModalProps {
  mode: 'won' | 'lost';
  dealName: string;
  onConfirm: (result: WinLossResult) => void;
  onCancel: () => void;
}

const WIN_DRIVERS = [
  { value: 'regulatory_readiness', label: 'Regulatory readiness / MiCAR story' },
  { value: 'pricing', label: 'Pricing / package fit' },
  { value: 'relationship', label: 'Relationship / trust' },
  { value: 'speed', label: 'Speed to list' },
  { value: 'product_fit', label: 'Product fit (EUR pairs, custody…)' },
  { value: 'other', label: 'Other' },
];

const LOSS_CATEGORIES = [
  { value: 'price', label: 'Price / budget' },
  { value: 'competitor', label: 'Chose a competitor' },
  { value: 'timing', label: 'Timing / postponed' },
  { value: 'compliance', label: 'Compliance / eligibility' },
  { value: 'unresponsive', label: 'Went unresponsive' },
  { value: 'other', label: 'Other' },
];

export function WinLossModal({ mode, dealName, onConfirm, onCancel }: WinLossModalProps) {
  const options = mode === 'won' ? WIN_DRIVERS : LOSS_CATEGORIES;
  const [category, setCategory] = useState(options[0].value);
  const [note, setNote] = useState('');

  const label = options.find(o => o.value === category)?.label ?? category;
  const reason = note.trim() ? `${label} — ${note.trim()}` : label;

  return (
    <Modal
      isOpen
      onClose={onCancel}
      title={mode === 'won' ? 'Mark deal won' : 'Mark deal lost'}
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            variant={mode === 'won' ? 'primary' : 'danger'}
            size="sm"
            onClick={() => onConfirm({ reason, category: mode === 'lost' ? category : undefined })}
          >
            {mode === 'won' ? 'Confirm win' : 'Confirm loss'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-label text-grey">
          <span className="font-semibold text-navy">{dealName}</span>
          {mode === 'won'
            ? ' — a win reason is recorded on the deal and the 30/60/90 post-listing triggers are created.'
            : ' — the loss reason and category feed the win/loss analytics.'}
        </p>
        <Select
          label={mode === 'won' ? 'Primary win driver' : 'Loss category'}
          options={options}
          value={category}
          onChange={e => setCategory(e.target.value)}
        />
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-navy">Note (optional)</span>
          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            rows={3}
            placeholder={mode === 'won' ? 'What actually closed it…' : 'What actually killed it…'}
            className="block w-full rounded-md border border-line bg-card px-3 py-2 text-sm shadow-sm focus:border-navy focus-ring focus:ring-2 focus:ring-navy"
          />
        </label>
        <p className="text-micro text-grey">
          Recorded as: <span className="font-medium text-navy">“{reason}”</span>
        </p>
      </div>
    </Modal>
  );
}
