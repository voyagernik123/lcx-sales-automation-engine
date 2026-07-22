import { describe, it, expect } from 'vitest';
import { isValidMonitor } from '../monitors.js';

describe('isValidMonitor', () => {
  it('accepts a well-formed monitor', () => {
    expect(isValidMonitor({
      condition: { metric: 'conviction', op: 'gte', threshold: 60 },
      action: { id: 'notify' },
    })).toBeNull();
  });

  it('rejects an unknown metric (whitelist guards SQL)', () => {
    expect(isValidMonitor({
      condition: { metric: 'DROP TABLE', op: 'gte', threshold: 1 },
      action: { id: 'notify' },
    })).toMatch(/metric/);
  });

  it('rejects an unknown operator', () => {
    expect(isValidMonitor({
      condition: { metric: 'conviction', op: 'like', threshold: 1 },
      action: { id: 'notify' },
    })).toMatch(/operator/);
  });

  it('rejects a non-numeric threshold', () => {
    expect(isValidMonitor({
      condition: { metric: 'conviction', op: 'gte', threshold: undefined },
      action: { id: 'notify' },
    })).toMatch(/threshold/);
  });

  it('rejects an unknown action', () => {
    expect(isValidMonitor({
      condition: { metric: 'conviction', op: 'gte', threshold: 60 },
      action: { id: 'launch_missiles' },
    })).toMatch(/action/);
  });
});
