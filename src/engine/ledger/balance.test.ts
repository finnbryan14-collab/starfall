import { describe, expect, it } from 'vitest';

import { DEFAULT_ASSUMPTIONS, type IncomeToggles } from '@/engine/income';
import type { Wish } from '@/engine/wish/history';

import { currentBalance, PRIMOGEMS_PER_FATE, type BalanceAnchor } from './balance';

/**
 * The ledger keeps the planner's balance current between confirmations, so a
 * player does not retype their primogems every time they open the app.
 *
 * docs/MATH.md section 3.
 */

const NOTHING: IncomeToggles = {
  dailyCommissions: false,
  welkin: false,
  spiralAbyss: false,
  imaginariumTheater: false,
  events: false,
  compensation: false,
  exploration: false,
  battlePass: false,
  stardustFates: false,
};

const COMMISSIONS_ONLY: IncomeToggles = { ...NOTHING, dailyCommissions: true };

/** Server-local, as the gacha log reports it. */
function wish(time: string, gachaType = '301'): Wish {
  return { id: time, gachaType, rankType: '3', itemType: 'Weapon', name: 'Cool Steel', time };
}

const anchorAt = Date.UTC(2026, 8, 1, 12, 0, 0); // 2026-09-01 12:00 UTC
const ANCHOR: BalanceAnchor = { primogems: 10_000, fates: 10, at: anchorAt };

function balance(overrides: Partial<Parameters<typeof currentBalance>[0]> = {}) {
  return currentBalance({
    anchor: ANCHOR,
    now: new Date(anchorAt),
    wishes: [],
    assumptions: DEFAULT_ASSUMPTIONS,
    enabled: NOTHING,
    ...overrides,
  });
}

describe('currentBalance', () => {
  it('is the confirmation itself at the moment it was made', () => {
    const result = balance();
    expect(result.primogems).toBe(10_000);
    expect(result.fates).toBe(10);
    expect(result.ageDays).toBe(0);
    expect(result.overdrawn).toBe(false);
  });

  it('adds the income earned since the confirmation', () => {
    // Ten daily resets at the sourced commission rate.
    const result = balance({
      now: new Date(anchorAt + 10 * 86_400_000),
      enabled: COMMISSIONS_ONLY,
    });

    expect(result.earnedPrimogems).toBe(10 * DEFAULT_ASSUMPTIONS.dailyCommissions);
    expect(result.primogems).toBe(10_000 + result.earnedPrimogems);
  });

  it('spends fates before it spends primogems', () => {
    const result = balance({
      wishes: [wish('2026-09-01 12:00:01'), wish('2026-09-01 12:00:02')],
      now: new Date(anchorAt + 3_600_000),
    });

    expect(result.pullsSince).toBe(2);
    expect(result.fates).toBe(8);
    expect(result.spentPrimogems).toBe(0);
    expect(result.primogems).toBe(10_000);
  });

  it('converts primogems once the fates run out', () => {
    const wishes = Array.from({ length: 12 }, (_, i) =>
      wish(`2026-09-01 12:00:${String(i + 1).padStart(2, '0')}`),
    );
    const result = balance({ wishes, now: new Date(anchorAt + 3_600_000) });

    // 10 fates cover 10 pulls; the other 2 come out of primogems.
    expect(result.fates).toBe(0);
    expect(result.spentPrimogems).toBe(2 * PRIMOGEMS_PER_FATE);
    expect(result.primogems).toBe(10_000 - 2 * PRIMOGEMS_PER_FATE);
  });

  it('ignores pulls made before the confirmation', () => {
    // The player counted their primogems after these, so they are already in.
    const result = balance({
      wishes: [wish('2026-08-30 09:00:00'), wish('2026-09-01 06:59:59')],
      now: new Date(anchorAt + 3_600_000),
    });

    expect(result.pullsSince).toBe(0);
    expect(result.fates).toBe(10);
  });

  /**
   * The standard and beginner banners take Acquaint Fate, which is not part of
   * the planner's budget, so those pulls must not reduce it.
   *
   *   https://genshin-impact.fandom.com/wiki/Acquaint_Fate
   *   https://game8.co/games/Genshin-Impact/archives/446618 (Chronicled: Intertwined)
   */
  it('only counts pulls that spend Intertwined Fate', () => {
    const result = balance({
      wishes: [
        wish('2026-09-01 12:00:01', '100'), // Beginners', Acquaint
        wish('2026-09-01 12:00:02', '200'), // Standard, Acquaint
        wish('2026-09-01 12:00:03', '301'), // Character
        wish('2026-09-01 12:00:04', '400'), // Character 2
        wish('2026-09-01 12:00:05', '302'), // Weapon
        wish('2026-09-01 12:00:06', '500'), // Chronicled
      ],
      now: new Date(anchorAt + 3_600_000),
    });

    expect(result.pullsSince).toBe(4);
    expect(result.fates).toBe(6);
  });

  it('reads wish times in server-local time, not UTC', () => {
    // 07:30 server time on the 1st is 12:30 UTC — after a 12:00 UTC anchor.
    // Read as UTC it would be 07:30, before the anchor, and go uncounted.
    const result = balance({
      wishes: [wish('2026-09-01 07:30:00')],
      now: new Date(anchorAt + 3_600_000),
    });

    expect(result.pullsSince).toBe(1);
  });

  it('clamps at zero and says so when the spend outruns the confirmation', () => {
    const wishes = Array.from({ length: 80 }, (_, i) =>
      wish(`2026-09-0${1 + (i % 9)} 13:00:0${i % 10}`, '301'),
    );
    const result = currentBalance({
      anchor: { primogems: 500, fates: 0, at: anchorAt },
      now: new Date(anchorAt + 10 * 86_400_000),
      wishes,
      assumptions: DEFAULT_ASSUMPTIONS,
      enabled: NOTHING,
    });

    expect(result.primogems).toBe(0);
    expect(result.fates).toBe(0);
    // Not a rounding wobble: the confirmation or the assumptions are wrong,
    // and the screen has to ask rather than show a confident zero.
    expect(result.overdrawn).toBe(true);
  });

  it('counts a pull with an unreadable timestamp as spent', () => {
    // wish-import stores an empty time rather than dropping an otherwise sound
    // pull. Understating the balance is the safe way to be wrong about it.
    const result = balance({
      wishes: [{ ...wish('2026-09-01 12:00:01'), time: '' }],
      now: new Date(anchorAt + 3_600_000),
    });

    expect(result.pullsSince).toBe(1);
    expect(result.fates).toBe(9);
  });

  it('counts whole days since the confirmation', () => {
    expect(balance({ now: new Date(anchorAt + 86_399_000) }).ageDays).toBe(0);
    expect(balance({ now: new Date(anchorAt + 86_400_000) }).ageDays).toBe(1);
    expect(balance({ now: new Date(anchorAt + 9 * 86_400_000) }).ageDays).toBe(9);
  });

  it('never reports a negative age from a clock behind the confirmation', () => {
    expect(balance({ now: new Date(anchorAt - 86_400_000) }).ageDays).toBe(0);
  });

  it('adds fates earned from the stardust shop', () => {
    const result = balance({
      // Across the 1st of October, when the shop refreshes.
      now: new Date(Date.UTC(2026, 9, 2, 12, 0, 0)),
      enabled: { ...NOTHING, stardustFates: true },
    });

    expect(result.earnedFates).toBe(DEFAULT_ASSUMPTIONS.stardustFatesPerMonth);
    expect(result.fates).toBe(10 + DEFAULT_ASSUMPTIONS.stardustFatesPerMonth);
  });

  it('pays Welkin for the whole window when it is running', () => {
    // The plan holds days remaining from *now*; over a past window the player
    // plainly had at least that many, so the window is paid in full.
    const result = balance({
      now: new Date(anchorAt + 10 * 86_400_000),
      enabled: { ...NOTHING, welkin: true },
    });

    expect(result.earnedPrimogems).toBe(10 * DEFAULT_ASSUMPTIONS.welkinPerDay);
  });
});
