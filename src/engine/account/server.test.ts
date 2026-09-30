import { describe, expect, it } from 'vitest';

import { AMERICA_UTC_OFFSET, DAILY_RESET_HOUR, nextDailyReset, resetHourUtc } from '../time';
import {
  GAME_SERVERS,
  SERVER_NAMES,
  SERVER_UTC_OFFSETS,
  serverFromUid,
  serverUtcOffset,
  utcOffsetForUid,
} from './server';

describe('serverFromUid', () => {
  it('places a UID on each overseas server', () => {
    expect(serverFromUid('600000000')).toBe('os_usa');
    expect(serverFromUid('700000000')).toBe('os_euro');
    expect(serverFromUid('800000000')).toBe('os_asia');
    expect(serverFromUid('900000000')).toBe('os_cht');
  });

  it('places the Chinese servers', () => {
    expect(serverFromUid('100000000')).toBe('cn_gf01');
    expect(serverFromUid('200000000')).toBe('cn_gf01');
    expect(serverFromUid('300000000')).toBe('cn_gf01');
    expect(serverFromUid('500000000')).toBe('cn_qd01');
  });

  /**
   * The case that makes the prefix rule worth writing down: `18` is a newer
   * Asian account, `1` is a Chinese one. Reading the first character alone
   * would put every recent Asian player thirteen hours out.
   */
  it('tells a 10-digit Asia UID from a 9-digit China one', () => {
    expect(serverFromUid('1800000000')).toBe('os_asia');
    expect(serverFromUid('100000000')).toBe('cn_gf01');
  });

  it('ignores surrounding space', () => {
    expect(serverFromUid('  700000000 ')).toBe('os_euro');
  });

  it('is null for a UID it cannot place', () => {
    expect(serverFromUid('400000000')).toBeNull();
    expect(serverFromUid('12345678')).toBeNull();
    expect(serverFromUid('')).toBeNull();
  });
});

describe('server clocks', () => {
  /**
   * Reset is 4:00 server time everywhere; only the offset differs.
   *
   *   https://game8.co/games/Genshin-Impact/archives/301599
   */
  it('matches the published offsets', () => {
    expect(serverUtcOffset('os_usa')).toBe(-5);
    expect(serverUtcOffset('os_euro')).toBe(1);
    expect(serverUtcOffset('os_asia')).toBe(8);
    expect(serverUtcOffset('os_cht')).toBe(8);
  });

  it('agrees with the default the engine has always used', () => {
    // If these two ever drift, every screen that has not been threaded through
    // yet would silently disagree with the ones that have.
    expect(SERVER_UTC_OFFSETS.os_usa).toBe(AMERICA_UTC_OFFSET);
  });

  it('has an offset and a name for every server', () => {
    for (const server of GAME_SERVERS) {
      expect(SERVER_UTC_OFFSETS[server], server).toBeTypeOf('number');
      expect(SERVER_NAMES[server], server).toBeTruthy();
    }
    expect(Object.keys(SERVER_UTC_OFFSETS)).toHaveLength(GAME_SERVERS.length);
    expect(Object.keys(SERVER_NAMES)).toHaveLength(GAME_SERVERS.length);
  });
});

describe('utcOffsetForUid', () => {
  it('reads the clock off the UID', () => {
    expect(utcOffsetForUid('700000000')).toBe(1);
    expect(utcOffsetForUid('1800000000')).toBe(8);
  });

  it('assumes America when there is nothing to go on', () => {
    // Every screen has to show something before an account is imported. A
    // stated assumption the player can correct beats a blank screen.
    expect(utcOffsetForUid(null)).toBe(AMERICA_UTC_OFFSET);
    expect(utcOffsetForUid(undefined)).toBe(AMERICA_UTC_OFFSET);
    expect(utcOffsetForUid('')).toBe(AMERICA_UTC_OFFSET);
    expect(utcOffsetForUid('nonsense')).toBe(AMERICA_UTC_OFFSET);
  });
});

describe('the offset actually moves a reset', () => {
  /**
   * The point of all of this. A European account's reset is six hours before
   * an American one, and an Asian account's is thirteen.
   */
  const at = new Date('2026-09-29T00:00:00Z');

  it('puts each server’s next daily reset at 4:00 its own time', () => {
    for (const server of ['os_usa', 'os_euro', 'os_asia'] as const) {
      const offset = serverUtcOffset(server);
      const reset = nextDailyReset(at, offset);
      // Shift the instant into server-local time and read the hour off it.
      const local = new Date(reset.getTime() + offset * 3_600_000);

      expect(local.getUTCHours(), server).toBe(DAILY_RESET_HOUR);
      expect(local.getUTCMinutes(), server).toBe(0);
    }
  });

  it('separates the America and Europe resets by six hours', () => {
    const america = nextDailyReset(at, serverUtcOffset('os_usa'));
    const europe = nextDailyReset(at, serverUtcOffset('os_euro'));

    expect((america.getTime() - europe.getTime()) / 3_600_000).toBe(6);
  });

  it('puts each reset at a different hour of the UTC day', () => {
    // Stated in UTC because that is unambiguous. Asia's 4:00 falls on the
    // *previous* UTC day, which is exactly the sort of thing an off-by-one
    // here would hide: comparing two "next resets" from one instant can land
    // on different local days and give a difference of 11 hours rather than
    // the 13 that separates the same day's resets.
    expect(resetHourUtc(serverUtcOffset('os_usa'))).toBe(9);
    expect(resetHourUtc(serverUtcOffset('os_euro'))).toBe(3);
    expect(resetHourUtc(serverUtcOffset('os_asia'))).toBe(-4);
  });
});
