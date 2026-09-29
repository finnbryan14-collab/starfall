/**
 * Building and validating gacha-log requests.
 *
 * The authkey URL the game produces points at a different host depending on
 * region and game version, so nothing here hardcodes one (docs/DATA.md). That
 * makes host validation a security control rather than a formality: a proxy
 * that forwards any URL it is handed is an open proxy, and an open proxy on our
 * domain could be pointed at internal addresses.
 */

/** The gacha log lives under this path on whichever host the URL names. */
export const GACHA_LOG_PATH = '/event/gacha_info/api/getGachaLog';

/**
 * Hosts the proxy will forward to.
 *
 * Suffix-matched against the registrable domain rather than pattern-matched
 * against the whole string, so `hoyoverse.com.evil.test` cannot slip through.
 */
export const ALLOWED_HOST_SUFFIXES = ['.hoyoverse.com', '.mihoyo.com', '.yuanshen.com'] as const;

export function isAllowedWishHost(host: string): boolean {
  const lower = host.toLowerCase();
  // Reject anything with credentials, a port, or an IP literal before matching.
  if (lower.includes('@') || lower.includes(':') || /^\d+\./.test(lower)) return false;
  return ALLOWED_HOST_SUFFIXES.some((suffix) => lower.endsWith(suffix));
}

/** Parameters the gacha log needs, lifted from the URL the game produced. */
export type WishAuth = {
  host: string;
  authkey: string;
  authkeyVer: string;
  signType: string;
  lang: string;
  gameBiz: string;
  region: string | null;
};

/**
 * Pulls the auth parameters out of a wish URL.
 *
 * Returns null rather than throwing for anything unusable, so a mistyped paste
 * is a message rather than a crash.
 */
export function parseWishAuth(raw: string): WishAuth | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }

  if (url.protocol !== 'https:') return null;
  if (!isAllowedWishHost(url.hostname)) return null;

  const params = url.searchParams;
  const authkey = params.get('authkey');
  if (!authkey) return null;

  return {
    host: url.hostname,
    authkey,
    authkeyVer: params.get('authkey_ver') ?? '1',
    signType: params.get('sign_type') ?? '2',
    lang: params.get('lang') ?? 'en',
    gameBiz: params.get('game_biz') ?? 'hk4e_global',
    region: params.get('region'),
  };
}

export type GachaLogQuery = {
  auth: WishAuth;
  gachaType: string;
  /** Cursor: the id of the last item seen. Omitted for the first page. */
  endId?: string;
  /** The API caps this at 20. */
  size?: number;
};

/** Builds one page request. */
export function buildGachaLogUrl({ auth, gachaType, endId, size = 20 }: GachaLogQuery): string {
  const url = new URL(`https://${auth.host}${GACHA_LOG_PATH}`);
  const params = url.searchParams;

  params.set('authkey_ver', auth.authkeyVer);
  params.set('sign_type', auth.signType);
  params.set('auth_appid', 'webview_gacha');
  params.set('lang', auth.lang);
  params.set('game_biz', auth.gameBiz);
  if (auth.region) params.set('region', auth.region);
  params.set('gacha_type', gachaType);
  params.set('size', String(Math.min(20, Math.max(1, size))));
  params.set('end_id', endId ?? '0');
  params.set('authkey', auth.authkey);

  return url.toString();
}

export type WishApiFailure =
  'bad-url' | 'expired' | 'rate-limited' | 'visit-too-frequently' | 'network' | 'unexpected';

/**
 * The gacha log answers 200 with a `retcode` rather than an HTTP status, so a
 * failure has to be read out of the body.
 *
 *   -100 / -101: the authkey is wrong or has expired
 *   -110: asking too fast
 */
export function failureForRetcode(retcode: number): WishApiFailure | null {
  if (retcode === 0) return null;
  if (retcode === -100 || retcode === -101) return 'expired';
  if (retcode === -110) return 'visit-too-frequently';
  return 'unexpected';
}

export const WISH_FAILURE_COPY: Record<WishApiFailure, string> = {
  'bad-url': 'That doesn’t look like a wish link. Copy the whole thing, starting with https.',
  expired:
    'That link has expired. They last about a day — open Wish → History in the game to get a fresh one.',
  'rate-limited': 'Too many requests. Wait a minute and start the import again.',
  'visit-too-frequently': 'The game asked us to slow down. Waiting a moment, then carrying on.',
  network: 'Couldn’t reach the wish history service. Check your connection and try again.',
  unexpected: 'Something unexpected came back from the wish history. Try a fresh link.',
};

/** Gap between page requests, so an import never looks like an attack. */
export const PAGE_DELAY_MS = 300;
