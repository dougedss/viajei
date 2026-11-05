import { describe, expect, it, vi } from 'vitest';
import { applyBadge, badgeCount, badgeSupported } from './badge.ts';

const at = (h: number, m = 0) => new Date(2026, 11, 11, h, m);

describe('selo no ícone', () => {
  it('pendências primeiro; senão 1 quando a próxima saída está a menos de 30 min; senão nada', () => {
    expect(badgeCount({ pendingQuestions: 2, leaveAt: at(7), now: at(6) })).toBe(2);
    expect(badgeCount({ pendingQuestions: 0, leaveAt: at(7), now: at(6, 40) })).toBe(1);
    expect(badgeCount({ pendingQuestions: 0, leaveAt: at(7), now: at(6, 29) })).toBe(0);
    expect(badgeCount({ pendingQuestions: 0, leaveAt: at(7), now: at(7, 10) })).toBe(1);
    expect(badgeCount({ pendingQuestions: 0, leaveAt: null, now: at(6) })).toBe(0);
  });

  it('aplica pela Badging API quando existe e não quebra sem ela', async () => {
    const setAppBadge = vi.fn().mockResolvedValue(undefined);
    const clearAppBadge = vi.fn().mockResolvedValue(undefined);
    const nav = { setAppBadge, clearAppBadge } as unknown as Navigator;
    expect(badgeSupported(nav)).toBe(true);
    await applyBadge(3, nav);
    await applyBadge(0, nav);
    expect(setAppBadge).toHaveBeenCalledWith(3);
    expect(clearAppBadge).toHaveBeenCalledTimes(1);

    const none = {} as Navigator;
    expect(badgeSupported(none)).toBe(false);
    await expect(applyBadge(1, none)).resolves.toBeUndefined();
    const failing = {
      setAppBadge: vi.fn().mockRejectedValue(new Error('x')),
    } as unknown as Navigator;
    await expect(applyBadge(1, failing)).resolves.toBeUndefined();
  });
});
