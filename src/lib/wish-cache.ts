/**
 * Recovering the wish-history URL from the game's own web cache.
 *
 * When you open Wish > History in Genshin, the game loads a signed URL in an
 * embedded browser and that URL lands in a Chromium disk cache on disk. Every
 * wish tracker asks you to fetch it by hand with a PowerShell script; this
 * reads it from a file you have explicitly handed over instead.
 *
 * Nothing here touches the game. It parses bytes from a file the player chose
 * to share, which is the same thing they would do by opening it themselves.
 *
 * The URL carries an `authkey` valid for about a day. It is never logged, never
 * stored, and never sent anywhere but the one proxied request (docs/DATA.md).
 */

/** What the cache yields: the URL, with its authkey deliberately not exposed. */
export type CachedWishUrl = {
  url: string;
  /** Host varies by region and game version, so it is never hardcoded. */
  host: string;
  /** `hk4e_global` or `hk4e_cn`. */
  gameBiz: string;
  lang: string | null;
  region: string | null;
};

/**
 * Cache entries are separated by this marker in Chromium's disk format.
 * Splitting on it keeps one entry's URL from running into the next.
 */
const ENTRY_SEPARATOR = '1/0/';

/**
 * A wish URL ends at `game_biz=hk4e_global` (or `_cn`).
 *
 * Anchoring on the end rather than on `authkey` matters: the query string's
 * parameter order is not guaranteed, and a lazy match to the first `&` would
 * truncate a URL whose authkey is not last.
 */
const WISH_URL = /https:\/\/[^\s\0"']+?game_biz=hk4e_(?:global|cn)/g;

/**
 * Pulls the most recent wish URL out of raw cache bytes.
 *
 * Returns null when there is none — a cache from before the player opened the
 * wish history, or simply the wrong file.
 */
export function findWishUrl(cache: string): CachedWishUrl | null {
  // Later entries are appended, so the last match is the freshest session.
  const entries = cache.split(ENTRY_SEPARATOR);

  for (let i = entries.length - 1; i >= 0; i--) {
    const matches = entries[i].match(WISH_URL);
    if (!matches) continue;

    const candidate = matches[matches.length - 1];
    const parsed = parseWishUrl(candidate);
    if (parsed) return parsed;
  }

  return null;
}

/** Validates a candidate URL and pulls out the parts the importer needs. */
export function parseWishUrl(raw: string): CachedWishUrl | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }

  const params = url.searchParams;
  const gameBiz = params.get('game_biz');
  // No authkey, no use — and a URL without one is not a wish URL.
  if (!params.get('authkey') || !gameBiz) return null;

  return {
    url: raw,
    host: url.host,
    gameBiz,
    lang: params.get('lang'),
    region: params.get('region'),
  };
}

/** Decodes cache bytes for searching. Never throws on invalid sequences. */
export function decodeCache(bytes: ArrayBuffer | Uint8Array): string {
  // The file is binary with ASCII URLs embedded in it, so replacement
  // characters around the URLs are expected and harmless.
  return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
}

/**
 * Picks the newest version folder inside webCaches.
 *
 * The game creates a fresh `2.x.y.z` folder on some updates. Community scripts
 * point at the file directly and break every time that happens; holding the
 * webCaches directory and re-resolving the newest child survives it.
 */
export function newestCacheVersion(folderNames: string[]): string | null {
  const versions = folderNames
    .filter((name) => /^\d+(\.\d+)*$/.test(name))
    .map((name) => ({ name, parts: name.split('.').map(Number) }));

  if (versions.length === 0) return null;

  versions.sort((a, b) => {
    const length = Math.max(a.parts.length, b.parts.length);
    for (let i = 0; i < length; i++) {
      const difference = (b.parts[i] ?? 0) - (a.parts[i] ?? 0);
      if (difference !== 0) return difference;
    }
    return 0;
  });

  return versions[0].name;
}

/** Path from the webCaches directory to the cache file, for the folder walk. */
export const CACHE_FILE_PATH = ['Cache', 'Cache_Data', 'data_2'] as const;

/** An authkey lasts about a day; past that the import will fail anyway. */
export const AUTHKEY_LIFETIME_MS = 24 * 60 * 60 * 1000;

/**
 * Strips the authkey from a URL so it can be shown or logged safely.
 *
 * Used anywhere a URL might reach a screen, a console or an error report.
 */
export function redactAuthkey(raw: string): string {
  return raw.replace(/(authkey=)[^&]+/i, '$1[redacted]');
}
