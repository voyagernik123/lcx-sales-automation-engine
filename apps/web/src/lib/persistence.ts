const VERSION = 'v1'; const mk = (k:string) => `lcx-os:${k}:${VERSION}`;
export const storage = {
  get<T>(key:string, d:T): T { try { const i = localStorage.getItem(mk(key)); return i ? JSON.parse(i) : d; } catch { return d; } },
  set<T>(key:string, v:T): void { try { localStorage.setItem(mk(key), JSON.stringify(v)); } catch {} },
  remove(key:string): void { try { localStorage.removeItem(mk(key)); } catch {} },
};
