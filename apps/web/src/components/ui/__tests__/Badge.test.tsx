import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Badge } from '@/components/ui';

describe('Badge', () => {
  it('renders its children and an accessible status label', () => {
    const { getByText, getByLabelText } = render(<Badge status="blocked">Blocked</Badge>);
    expect(getByText('Blocked')).toBeInTheDocument();
    expect(getByLabelText('Status: blocked')).toBeInTheDocument();
  });
});

