import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';

const TEST_KEY = 'dev-operator-key-change-me';

vi.mock('../../lib/env.js', () => ({
  env: { operatorApiKey: 'dev-operator-key-change-me', supabaseJwksUrl: '', supabaseIssuer: '' },
}));

vi.mock('../../lib/supabaseJwt.js', () => ({
  verifySupabaseAccessToken: vi.fn(),
}));

// Imports after the mocks so the mocked modules are the ones wired in.
const { requireOperator } = await import('../auth.js');
const { verifySupabaseAccessToken } = await import('../../lib/supabaseJwt.js');

function buildApp() {
  const app = new Hono();
  app.get('/probe', requireOperator, (c) => c.json({ operator: c.get('operator') }));
  return app;
}

describe('requireOperator', () => {
  beforeEach(() => {
    vi.mocked(verifySupabaseAccessToken).mockReset();
  });

  it('401s with no credential at all', async () => {
    const res = await buildApp().request('/probe');
    expect(res.status).toBe(401);
    expect((await res.json()).code).toBe('UNAUTHORIZED');
  });

  it('accepts the static operator key (v1, unchanged)', async () => {
    const res = await buildApp().request('/probe', { headers: { Authorization: `Bearer ${TEST_KEY}` } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.operator).toEqual({ id: 'operator', role: 'operator', authMethod: 'api_key' });
  });

  it('401s a garbage token when Supabase verification also rejects it', async () => {
    vi.mocked(verifySupabaseAccessToken).mockResolvedValue(null);
    const res = await buildApp().request('/probe', { headers: { Authorization: 'Bearer not-a-real-token' } });
    expect(res.status).toBe(401);
  });

  it('accepts a verified Supabase token for an @lcx.com address and resolves the roster name', async () => {
    vi.mocked(verifySupabaseAccessToken).mockResolvedValue({ email: 'nik@lcx.com' });
    const res = await buildApp().request('/probe', { headers: { Authorization: 'Bearer some.jwt.token' } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.operator).toMatchObject({ id: 'nik', name: 'Nik', email: 'nik@lcx.com', authMethod: 'google' });
  });

  it('401s a verified Supabase token for a non-@lcx.com address', async () => {
    vi.mocked(verifySupabaseAccessToken).mockResolvedValue({ email: 'someone@gmail.com' });
    const res = await buildApp().request('/probe', { headers: { Authorization: 'Bearer some.jwt.token' } });
    expect(res.status).toBe(401);
  });

  it('resolves an @lcx.com address outside the named roster gracefully instead of rejecting it', async () => {
    vi.mocked(verifySupabaseAccessToken).mockResolvedValue({ email: 'newperson@lcx.com' });
    const res = await buildApp().request('/probe', { headers: { Authorization: 'Bearer some.jwt.token' } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.operator).toMatchObject({ id: 'newperson@lcx.com', name: 'Newperson', authMethod: 'google' });
  });
});
