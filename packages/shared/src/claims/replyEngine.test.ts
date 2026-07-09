import { describe, expect, it } from 'vitest';
import { generateReplyDrafts } from './replyEngine.js';

const base = {
  projectName: 'Flying Tulip',
  projectTicker: 'FT',
  projectBand: 'nurture',
  contactName: 'Andre',
  channel: 'linkedin' as const,
  repliedToTouchIndex: 2,
  jurisdiction: 'eu' as const,
  lcxTelegramHandle: 'lcx_nik',
};

describe('generateReplyDrafts', () => {
  it('returns three distinct angles', () => {
    const { drafts } = generateReplyDrafts(base);
    expect(drafts.map((d) => d.angle)).toEqual(['meeting', 'telegram', 'info']);
  });

  it('every draft pulls to the configured telegram handle', () => {
    const { drafts, warnings } = generateReplyDrafts(base);
    for (const d of drafts) {
      expect(d.body).toContain('t.me/lcx_nik');
      expect(d.body).toContain('Andre');
      expect(d.body).toContain('Flying Tulip');
      expect(d.body).toContain('?');
      expect(d.claimsUsed.length).toBeGreaterThan(0);
      expect(d.requiresHumanReview).toBe(true);
    }
    expect(warnings).toEqual([]);
  });

  it('normalizes @handle and t.me URLs', () => {
    const { drafts } = generateReplyDrafts({ ...base, lcxTelegramHandle: '@lcx_nik' });
    expect(drafts[0].body).toContain('t.me/lcx_nik');
    expect(drafts[0].body).not.toContain('t.me/@');
  });

  it('warns and uses a placeholder when the handle is unset', () => {
    const { drafts, warnings } = generateReplyDrafts({ ...base, lcxTelegramHandle: '' });
    expect(warnings.length).toBe(1);
    expect(drafts[0].body).toContain('YOUR_TELEGRAM_HANDLE');
  });

  it('email replies carry a subject; linkedin replies do not', () => {
    const email = generateReplyDrafts({ ...base, channel: 'email' });
    expect(email.drafts[0].subject).toContain('Flying Tulip');
    const li = generateReplyDrafts(base);
    expect(li.drafts[0].subject).toBe('');
  });
});
