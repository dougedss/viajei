import { describe, expect, it } from 'vitest';
import { detectPlatform, subscriptionRow } from './subscription-row.ts';

const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148';
const ANDROID =
  'Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 Chrome/131.0 Mobile Safari/537.36';
const MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/131.0 Safari/537.36';

describe('assinatura push', () => {
  it('detecta a plataforma pelo user agent', () => {
    expect(detectPlatform(IPHONE)).toBe('ios');
    expect(detectPlatform(ANDROID)).toBe('android');
    expect(detectPlatform(MAC)).toBe('desktop');
  });

  it('monta a linha com a origem que assinou e recusa assinatura incompleta', () => {
    const row = subscriptionRow(
      { endpoint: 'https://push.example/x', keys: { p256dh: 'P', auth: 'A' } },
      {
        uid: 'u',
        origin: 'http://localhost:4173',
        userAgent: ANDROID,
        now: new Date('2026-12-01T10:00:00Z'),
      },
    );
    expect(row).toEqual({
      user_id: 'u',
      endpoint: 'https://push.example/x',
      p256dh: 'P',
      auth: 'A',
      platform: 'android',
      origin: 'http://localhost:4173',
      user_agent: ANDROID,
      last_seen_at: '2026-12-01T10:00:00.000Z',
      failed_at: null,
    });
    expect(() =>
      subscriptionRow({ endpoint: 'https://x' }, { uid: 'u', origin: 'o', userAgent: '' }),
    ).toThrow();
  });
});
