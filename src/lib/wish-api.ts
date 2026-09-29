/**
 * Building and validating gacha-log requests.
 *
 * The authkey URL the game produces points at a different host depending on
 * region and game version, so nothing here hardcodes one (docs/DATA.md). That
 * makes host validation a security control rather than a formality: a proxy
 * that forwards any URL it is handed is an open proxy, and an open proxy on our
 * domain could be pointed at internal addresses.
 */

/** Path the gacha log is served at. */
export const GACHA_LOG_PATH = '/gacha_info/api/getGachaLog';

/**
 * Hosts that actually serve the gacha log.
 *
 * The URL the game hands you points at a webview page (`gs.hoyoverse.com/...`),
 * not at the API, so the request has to be re-pointed. paimon.moe — the
 * reference implementation DATA.md names — does exactly this:
 *
 *   https://github.com/MadeBaruna/paimon-moe/blob/main/src/routes/wish/import.svelte
 *   verifiedAt: 2026-09-29
 *
 * DATA.md's "don't hardcode the host" still holds, and is honoured in the right
 * place: which of these two is used comes from the region in the pasted URL, and
 * the pasted host is still validated against the allowlist.
 */
export const GACHA_API_HOSTS = {
  overseas: 'public-operation-hk4e-sg.hoyoverse.com',
  china: 'public-operation-hk4e.mihoyo.com',
} as const;

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

/** Which API host serves this account, from its region rather than its URL. */
export function gachaApiHost(auth: WishAuth): string {
  const china = auth.gameBiz === 'hk4e_cn' || (auth.region ?? '').startsWith('cn_');
  return china ? GACHA_API_HOSTS.china : GACHA_API_HOSTS.overseas;
}

/**
 * A wish URL from an authkey that did not come from a pasted link.
 *
 * `genAuthKeyByCookieToken` returns the key alone, but the whole import path
 * downstream takes a URL. Building one here keeps that path single: a minted
 * key and a pasted link go through exactly the same parsing and the same host
 * validation, rather than a second code path that could drift.
 */
export function buildWishUrlFromAuthkey(input: {
  authkey: string;
  region: string;
  gameBiz?: string;
}): string {
  const china = input.region.startsWith('cn_');
  const url = new URL(`https://${china ? GACHA_API_HOSTS.china : GACHA_API_HOSTS.overseas}/`);

  url.searchParams.set('authkey_ver', '1');
  url.searchParams.set('sign_type', '2');
  url.searchParams.set('lang', 'en');
  url.searchParams.set('game_biz', input.gameBiz ?? (china ? 'hk4e_cn' : 'hk4e_global'));
  url.searchParams.set('region', input.region);
  url.searchParams.set('authkey', input.authkey);

  return url.toString();
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
  const url = new URL(`https://${gachaApiHost(auth)}${GACHA_LOG_PATH}`);
  const params = url.searchParams;

  params.set('authkey_ver', auth.authkeyVer);
  params.set('sign_type', auth.signType);
  params.set('auth_appid', 'webview_gacha');
  params.set('lang', auth.lang);
  params.set('game_biz', auth.gameBiz);
  if (auth.region) params.set('region', auth.region);
  params.set('gacha_type', gachaType);
  // genshin.py sends both; the API has wanted `real_gacha_type` since the
  // Chronicled Wish banner arrived.
  params.set('real_gacha_type', gachaType);
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
