import { describe, expect, it } from 'vitest';
import { actionsFor, getAction, isServerAction, SERVER_ACTIONS } from './actions.js';

describe('actions registry', () => {
  it('offers universal actions on any object type', () => {
    const ids = actionsFor('token', 'operator').map((a) => a.id);
    expect(ids).toContain('watchlist_add');
    expect(ids).toContain('flag_review');
  });

  it('scopes project-only actions to projects', () => {
    expect(actionsFor('project', 'operator').map((a) => a.id)).toContain('start_deal');
    expect(actionsFor('token', 'operator').map((a) => a.id)).not.toContain('start_deal');
  });

  it('gates by role — a viewer only gets viewer-level actions', () => {
    const viewer = actionsFor('project', 'viewer').map((a) => a.id);
    expect(viewer).toContain('open_workspace');
    expect(viewer).not.toContain('watchlist_add'); // operator-min
    expect(viewer).not.toContain('flag_review');
  });

  it('separates server actions from client-only navigation', () => {
    expect(isServerAction('watchlist_add')).toBe(true);
    expect(isServerAction('start_deal')).toBe(false); // client:true
    expect(SERVER_ACTIONS).not.toContain('open_workspace');
    expect(getAction('start_deal')?.client).toBe(true);
  });

  it('pairs toggle actions to their inverse', () => {
    expect(getAction('watchlist_remove')?.toggleOf).toBe('watchlist_add');
    expect(getAction('unflag')?.toggleOf).toBe('flag_review');
  });
});
