/**
 * Enka.Network: UID validation, error copy and cache rules.
 *
 * Pure, so the rules can be tested without a network. The proxy route uses
 * these; the browser never calls Enka directly (docs/DATA.md).
 *
 *   docs: https://github.com/EnkaNetwork/API-docs/blob/master/api.md
 *   verifiedAt: 2026-09-29
 */

export const ENKA_BASE = 'https://enka.network/api/uid';

/**
 * UIDs are 9 digits, or 10 for newer accounts, which begin with 18.
 * Checked before we spend a request, since Enka rate-limits on attempts.
 */
export function isValidUid(uid: string): boolean {
  return /^\d{9}$/.test(uid) || /^18\d{8}$/.test(uid);
}

export type EnkaFailure =
  | 'invalid-uid'
  | 'not-found'
  | 'maintenance'
  | 'rate-limited'
  | 'server-error'
  | 'enka-down'
  | 'network'
  | 'no-showcase';

/**
 * Status codes straight from Enka's documentation, not inferred from
 * behaviour — each one has its own meaning and its own thing to tell a player.
 */
export function failureForStatus(status: number): EnkaFailure {
  switch (status) {
    case 400:
      return 'invalid-uid';
    case 404:
      return 'not-found';
    case 424:
      return 'maintenance';
    case 429:
      return 'rate-limited';
    case 503:
      return 'enka-down';
    default:
      return status >= 500 ? 'server-error' : 'network';
  }
}

/**
 * What to tell the player.
 *
 * DESIGN.md: say what happened and what to do about it. "Request failed" tells
 * someone nothing; "turn your showcase on" tells them everything.
 */
export const ENKA_FAILURE_COPY: Record<EnkaFailure, string> = {
  'invalid-uid':
    'That UID doesn’t look right. It’s the 9 or 10 digit number in the game’s bottom corner.',
  'not-found': 'No player with that UID. Check the digits and try again.',
  maintenance:
    'Genshin is under maintenance, so nothing can be read right now. Try after it’s back.',
  'rate-limited': 'Too many requests just now. Wait a minute and try again.',
  'server-error': 'Something went wrong reading that profile. Try again in a moment.',
  'enka-down':
    'Enka.Network is having trouble. Your saved characters are still here; try again later.',
  network: 'Couldn’t reach Enka.Network. Check your connection and try again.',
  'no-showcase':
    'That UID isn’t showing any characters. Turn on your in-game character showcase, then try again.',
};

/** Enka's TTL is seconds until they will next fetch this UID from HoYoverse. */
export const DEFAULT_TTL_SECONDS = 60;

export type CachedProfile = {
  uid: string;
  data: unknown;
  fetchedAt: number;
  ttlSeconds: number;
};

/**
 * Whether a cached profile may still be used.
 *
 * Enka's docs are explicit that a repeat request burns rate limit even when it
 * returns the same cached data, so respecting the TTL is a requirement rather
 * than an optimisation.
 */
export function isFresh(profile: CachedProfile, now = Date.now()): boolean {
  return now - profile.fetchedAt < profile.ttlSeconds * 1000;
}

/** Milliseconds until a refresh is allowed. Zero once it is. */
export function msUntilRefresh(profile: CachedProfile, now = Date.now()): number {
  return Math.max(0, profile.fetchedAt + profile.ttlSeconds * 1000 - now);
}

/** "3 min ago", "just now" — for the freshness line on the Account screen. */
export function describeAge(fetchedAt: number, now = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - fetchedAt) / 1000));
  if (seconds < 45) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return `${days} ${days === 1 ? 'day' : 'days'} ago`;
}

/** A showcase with no characters in it, which is a setting rather than an error. */
export function hasShowcase(data: unknown): boolean {
  if (typeof data !== 'object' || data === null) return false;
  const list = (data as { avatarInfoList?: unknown }).avatarInfoList;
  return Array.isArray(list) && list.length > 0;
}
