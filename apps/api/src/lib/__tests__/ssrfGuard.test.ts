import { describe, it, expect } from 'vitest';
import { isPrivateIp, assertSafePublicUrl } from '../ssrfGuard.js';

describe('isPrivateIp', () => {
  it('flags loopback / private / link-local / reserved v4', () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '0.0.0.0', '100.64.0.1', '224.0.0.1', '255.255.255.255']) {
      expect(isPrivateIp(ip), ip).toBe(true);
    }
  });
  it('allows public v4', () => {
    for (const ip of ['8.8.8.8', '1.1.1.1', '93.184.216.34', '172.32.0.1', '11.0.0.1']) {
      expect(isPrivateIp(ip), ip).toBe(false);
    }
  });
  it('flags loopback / ula / link-local v6 (incl. v4-mapped private)', () => {
    for (const ip of ['::1', '::', 'fe80::1', 'fc00::1', 'fd12::1', '::ffff:127.0.0.1', '::ffff:10.0.0.1']) {
      expect(isPrivateIp(ip), ip).toBe(true);
    }
  });
  it('treats non-IP as unsafe', () => {
    expect(isPrivateIp('not-an-ip')).toBe(true);
  });
});

describe('assertSafePublicUrl', () => {
  it('rejects non-http(s) schemes', async () => {
    await expect(assertSafePublicUrl('file:///etc/passwd')).rejects.toThrow(/scheme/);
    await expect(assertSafePublicUrl('ftp://example.com')).rejects.toThrow(/scheme/);
  });
  it('rejects localhost + internal hostnames', async () => {
    await expect(assertSafePublicUrl('http://localhost/x')).rejects.toThrow();
    await expect(assertSafePublicUrl('http://foo.internal/x')).rejects.toThrow();
  });
  it('rejects private/metadata IP literals (no DNS needed)', async () => {
    await expect(assertSafePublicUrl('http://127.0.0.1/x')).rejects.toThrow(/private/);
    await expect(assertSafePublicUrl('http://169.254.169.254/latest/meta-data/')).rejects.toThrow(/private/);
    await expect(assertSafePublicUrl('http://10.0.0.5:8080/')).rejects.toThrow(/private/);
  });
  it('accepts a public IP literal', async () => {
    const u = await assertSafePublicUrl('https://8.8.8.8/robots.txt');
    expect(u.hostname).toBe('8.8.8.8');
  });
});
