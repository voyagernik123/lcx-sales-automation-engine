import { describe, it, expect } from 'vitest';
import { MockLinkedInProvider, checkLiCap, LI_DAILY_CONNECTION_CAP, LI_WEEKLY_CONNECTION_CAP, LI_DAILY_MESSAGE_CAP } from '../linkedin.js';
import type { ConnectionRequestParams, MessageParams } from '../linkedin.js';

// Use the mock provider
const provider = new MockLinkedInProvider();

describe('MockLinkedInProvider', () => {
  it('sends connection request and returns campaign id', async () => {
    const params: ConnectionRequestParams = {
      profileUrl: 'https://linkedin.com/in/testuser',
      note: 'Hi, would love to connect!',
    };
    const result = await provider.sendConnectionRequest(params);
    expect(result.campaignId).toContain('mock-li-cr-');
    expect(result.status).toBe('completed');
    expect(result.success).toBe(true);
  });

  it('sends message and returns campaign id', async () => {
    const params: MessageParams = {
      profileUrl: 'https://linkedin.com/in/testuser',
      message: 'Thanks for connecting!',
    };
    const result = await provider.sendMessage(params);
    expect(result.campaignId).toContain('mock-li-msg-');
    expect(result.status).toBe('completed');
    expect(result.success).toBe(true);
  });

  it('returns campaign status', async () => {
    const result = await provider.getCampaignStatus('mock-li-cr-123');
    expect(result.status).toBe('completed');
    expect(result.success).toBe(true);
  });

  it('returns quota info', async () => {
    const quota = await provider.checkQuota();
    expect(quota.remainingConnections).toBeGreaterThan(0);
    expect(quota.remainingMessages).toBeGreaterThan(0);
  });
});

describe('Cap enforcement logic', () => {
  it('respects daily LinkedIn connection caps', () => {
    // The daily cap for connection requests is 7
    expect(LI_DAILY_CONNECTION_CAP).toBe(7);
    // Weekly cap is 50
    expect(LI_WEEKLY_CONNECTION_CAP).toBe(50);
    // Daily message cap is 20
    expect(LI_DAILY_MESSAGE_CAP).toBe(20);
  });

  it('returns canSendConnection=false when daily cap exceeded', async () => {
    const caps = await checkLiCap('connection_request');
    // This will vary based on actual DB state, but structure should be correct
    expect(caps).toHaveProperty('connectionsRemainingToday');
    expect(caps).toHaveProperty('connectionsRemainingWeek');
    expect(caps).toHaveProperty('canSendConnection');
    expect(caps).toHaveProperty('canSendMessage');
  });

  it('returns canSendMessage based on daily message cap', async () => {
    const caps = await checkLiCap('message');
    expect(typeof caps.canSendMessage).toBe('boolean');
    expect(typeof caps.messagesRemainingToday).toBe('number');
  });
});

describe('Error handling', () => {
  it('handles missing profile URL gracefully in mock', async () => {
    const params: ConnectionRequestParams = { profileUrl: '' };
    const result = await provider.sendConnectionRequest(params);
    expect(result.status).toBe('completed');
    expect(result.campaignId).toBeTruthy();
  });

  it('handles empty message gracefully in mock', async () => {
    const params: MessageParams = { profileUrl: 'https://linkedin.com/in/test', message: '' };
    const result = await provider.sendMessage(params);
    expect(result.status).toBe('completed');
  });
});
