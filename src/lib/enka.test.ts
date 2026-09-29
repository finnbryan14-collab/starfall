import { describe, expect, it } from 'vitest';

import {
  ENKA_FAILURE_COPY,
  describeAge,
  failureForStatus,
  hasShowcase,
  isFresh,
  isValidUid,
  msUntilRefresh,
  type CachedProfile,
} from '@/lib/enka';

describe('isValidUid', () => {
  it('accepts a nine-digit UID', () => {
    expect(isValidUid('618285856')).toBe(true);
    expect(isValidUid('700000001')).toBe(true);
  });

  it('accepts a ten-digit UID, which newer accounts have and which start with 18', () => {
    expect(isValidUid('1812345678')).toBe(true);
  });

  it('rejects a ten-digit UID that does not start with 18', () => {
    expect(isValidUid('2812345678')).toBe(false);
  });

  it('rejects the wrong length', () => {
    expect(isValidUid('12345678')).toBe(false);
    expect(isValidUid('12345678901')).toBe(false);
    expect(isValidUid('')).toBe(false);
  });

  it('rejects anything that is not digits', () => {
    expect(isValidUid('61828585a')).toBe(false);
    expect(isValidUid('618 285 856')).toBe(false);
    expect(isValidUid('+618285856')).toBe(false);
  });
});

describe('failureForStatus', () => {
  /** Straight from Enka's docs — each status means a different thing. */
  it('maps every documented status', () => {
    expect(failureForStatus(400)).toBe('invalid-uid');
    expect(failureForStatus(404)).toBe('not-found');
    expect(failureForStatus(424)).toBe('maintenance');
    expect(failureForStatus(429)).toBe('rate-limited');
    expect(failureForStatus(503)).toBe('enka-down');
    expect(failureForStatus(500)).toBe('server-error');
  });

  it('treats an unknown 5xx as a server error and anything else as network', () => {
    expect(failureForStatus(502)).toBe('server-error');
    expect(failureForStatus(418)).toBe('network');
  });

  it('has plain-language copy for every failure', () => {
    for (const [failure, copy] of Object.entries(ENKA_FAILURE_COPY)) {
      expect(copy.length, failure).toBeGreaterThan(20);
      // DESIGN.md: say what happened and what to do, not "Error 429".
      expect(copy, failure).not.toMatch(/\b(error|failed|invalid)\s*\d/i);
      expect(copy.endsWith('.'), failure).toBe(true);
    }
  });
});

describe('cache freshness', () => {
  const profile: CachedProfile = {
    uid: '618285856',
    data: {},
    fetchedAt: 1_000_000,
    ttlSeconds: 60,
  };

  it('is fresh inside the TTL and stale after it', () => {
    expect(isFresh(profile, 1_000_000)).toBe(true);
    expect(isFresh(profile, 1_000_000 + 59_999)).toBe(true);
    expect(isFresh(profile, 1_000_000 + 60_000)).toBe(false);
  });

  it('counts down to when a refresh is allowed', () => {
    expect(msUntilRefresh(profile, 1_000_000)).toBe(60_000);
    expect(msUntilRefresh(profile, 1_000_000 + 30_000)).toBe(30_000);
    expect(msUntilRefresh(profile, 1_000_000 + 60_000)).toBe(0);
  });

  it('never counts below zero once the TTL has passed', () => {
    expect(msUntilRefresh(profile, 1_000_000 + 999_999)).toBe(0);
  });
});

describe('describeAge', () => {
  const now = 1_000_000_000;

  it('says just now for something recent', () => {
    expect(describeAge(now, now)).toBe('just now');
    expect(describeAge(now - 30_000, now)).toBe('just now');
  });

  it('counts minutes, hours and days', () => {
    expect(describeAge(now - 3 * 60_000, now)).toBe('3 min ago');
    expect(describeAge(now - 2 * 3_600_000, now)).toBe('2 h ago');
    expect(describeAge(now - 3 * 86_400_000, now)).toBe('3 days ago');
  });

  it('gets the singular day right', () => {
    expect(describeAge(now - 86_400_000, now)).toBe('1 day ago');
  });

  it('never reports a negative age from a clock that has drifted', () => {
    expect(describeAge(now + 60_000, now)).toBe('just now');
  });
});

describe('hasShowcase', () => {
  it('sees characters when the showcase is on', () => {
    expect(hasShowcase({ avatarInfoList: [{ avatarId: 10000002 }] })).toBe(true);
  });

  it('treats an empty or absent showcase as nothing to import', () => {
    // A profile with the showcase switched off returns successfully with no
    // characters, which is a setting to change rather than an error.
    expect(hasShowcase({ avatarInfoList: [] })).toBe(false);
    expect(hasShowcase({ playerInfo: { nickname: 'x' } })).toBe(false);
  });

  it('does not fall over on junk', () => {
    expect(hasShowcase(null)).toBe(false);
    expect(hasShowcase('nope')).toBe(false);
    expect(hasShowcase({ avatarInfoList: 'not an array' })).toBe(false);
  });
});
