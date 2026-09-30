import { AMERICA_UTC_OFFSET } from '../time';

/**
 * Which server an account is on, and what time it is there.
 *
 * Everything in Starfall that involves a clock — daily and weekly resets,
 * Spiral Abyss and Theater resets, banner windows, the timestamps on imported
 * wishes — happens on *server* time, not the player's. Genshin runs three
 * clocks, and assuming America puts a European player six hours out and an
 * Asian player thirteen.
 *
 * The server is derivable from the UID, so nobody has to be asked.
 *
 * Reset is 4:00 server time on every server:
 *   America UTC-5, Europe UTC+1, Asia and TW/HK/MO UTC+8
 *   source: https://game8.co/games/Genshin-Impact/archives/301599
 *   source: https://www.rpgsite.net/feature/10336-genshin-impact-daily-reset-time-when-the-server-reset-is-in-your-region
 *   verifiedAt: 2026-09-29
 *
 * UID prefixes, which agree with every client library:
 *   source: https://github.com/thesadru/genshin.py/blob/master/genshin/utility/uid.py
 *   verifiedAt: 2026-09-29
 */

export const GAME_SERVERS = [
  'os_usa',
  'os_euro',
  'os_asia',
  'os_cht',
  'cn_gf01',
  'cn_qd01',
] as const;

export type GameServer = (typeof GAME_SERVERS)[number];

/** Hours ahead of UTC that each server's clock runs. */
export const SERVER_UTC_OFFSETS: Record<GameServer, number> = {
  os_usa: -5,
  os_euro: 1,
  os_asia: 8,
  os_cht: 8,
  // The Chinese servers run on China Standard Time, which is also UTC+8.
  cn_gf01: 8,
  cn_qd01: 8,
};

/** What to call each server on screen. */
export const SERVER_NAMES: Record<GameServer, string> = {
  os_usa: 'America',
  os_euro: 'Europe',
  os_asia: 'Asia',
  os_cht: 'TW, HK, MO',
  cn_gf01: 'China (Celestia)',
  cn_qd01: 'China (Irminsul)',
};

/**
 * UID prefixes: everything before the last eight digits.
 *
 * A 9-digit UID gives one character and a 10-digit one gives two, which is how
 * `18` (Asia) stays distinct from `1` (a Chinese server). Reading only the
 * first character would send every newer account to the wrong clock.
 */
const PREFIXES: Record<GameServer, readonly string[]> = {
  cn_gf01: ['1', '2', '3'],
  cn_qd01: ['5'],
  os_usa: ['6'],
  os_euro: ['7'],
  os_asia: ['8', '18'],
  os_cht: ['9'],
};

export function serverFromUid(uid: string): GameServer | null {
  const prefix = uid.trim().slice(0, -8);
  if (!prefix) return null;

  for (const server of GAME_SERVERS) {
    if (PREFIXES[server].includes(prefix)) return server;
  }
  return null;
}

export function serverUtcOffset(server: GameServer): number {
  return SERVER_UTC_OFFSETS[server];
}

/**
 * The clock to plan in for this account.
 *
 * Falls back to America when there is no UID yet or it cannot be placed —
 * every screen has to show *something* before an account is imported, and a
 * stated assumption a player can correct beats a blank. The Account screen
 * says which server is in use and where the answer came from.
 */
export function utcOffsetForUid(uid: string | null | undefined): number {
  if (!uid) return AMERICA_UTC_OFFSET;
  const server = serverFromUid(uid);
  return server ? SERVER_UTC_OFFSETS[server] : AMERICA_UTC_OFFSET;
}
