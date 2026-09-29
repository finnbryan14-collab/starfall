import { describe, expect, it } from 'vitest';

import {
  buildGachaLogUrl,
  failureForRetcode,
  isAllowedWishHost,
  parseWishAuth,
  WISH_FAILURE_COPY,
} from '@/lib/wish-api';

const AUTHKEY = 'FAKEAUTHKEYFORTESTSONLY000000';

const wishUrl = (host = 'gs.hoyoverse.com') =>
  `https://${host}/genshin/event/e20190909gacha-v3/index.html` +
  `?authkey_ver=1&sign_type=2&lang=en&authkey=${AUTHKEY}&region=os_usa&game_biz=hk4e_global`;

/**
 * Host validation is a security control, not a formality: the proxy forwards
 * whatever host the URL names, so anything that gets past this becomes a
 * request made by our server on a stranger's behalf.
 */
describe('isAllowedWishHost', () => {
  it('allows the HoYoverse domains the game actually uses', () => {
    expect(isAllowedWishHost('gs.hoyoverse.com')).toBe(true);
    expect(isAllowedWishHost('hk4e-api-os.hoyoverse.com')).toBe(true);
    expect(isAllowedWishHost('webstatic.mihoyo.com')).toBe(true);
    expect(isAllowedWishHost('hk4e-api.mihoyo.com')).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(isAllowedWishHost('GS.HoYoverse.COM')).toBe(true);
  });

  it('rejects a lookalike domain that merely contains the name', () => {
    // The trap a naive `includes` check falls into.
    expect(isAllowedWishHost('hoyoverse.com.evil.test')).toBe(false);
    expect(isAllowedWishHost('evil-hoyoverse.com.attacker.net')).toBe(false);
    // The leading dot in the suffix is what makes this a rejection: the host
    // ends with "thoyoverse.com", not ".hoyoverse.com".
    expect(isAllowedWishHost('nothoyoverse.com')).toBe(false);
  });

  it('rejects anything not on an allowed domain', () => {
    expect(isAllowedWishHost('example.com')).toBe(false);
    expect(isAllowedWishHost('localhost')).toBe(false);
  });

  it('rejects the shapes used to reach internal services', () => {
    expect(isAllowedWishHost('169.254.169.254')).toBe(false);
    expect(isAllowedWishHost('127.0.0.1')).toBe(false);
    expect(isAllowedWishHost('gs.hoyoverse.com:8080')).toBe(false);
    expect(isAllowedWishHost('user@gs.hoyoverse.com')).toBe(false);
  });
});

describe('parseWishAuth', () => {
  it('lifts the parameters the gacha log needs', () => {
    const auth = parseWishAuth(wishUrl())!;
    expect(auth.host).toBe('gs.hoyoverse.com');
    expect(auth.authkey).toBe(AUTHKEY);
    expect(auth.authkeyVer).toBe('1');
    expect(auth.signType).toBe('2');
    expect(auth.lang).toBe('en');
    expect(auth.gameBiz).toBe('hk4e_global');
    expect(auth.region).toBe('os_usa');
  });

  it('does not hardcode the host', () => {
    // Regions and versions use different domains (docs/DATA.md).
    expect(parseWishAuth(wishUrl('webstatic.mihoyo.com'))?.host).toBe('webstatic.mihoyo.com');
  });

  it('tolerates surrounding whitespace from a paste', () => {
    expect(parseWishAuth(`  ${wishUrl()}\n`)?.authkey).toBe(AUTHKEY);
  });

  it('fills in sensible defaults for optional parameters', () => {
    const auth = parseWishAuth(`https://gs.hoyoverse.com/x?authkey=${AUTHKEY}`)!;
    expect(auth.authkeyVer).toBe('1');
    expect(auth.lang).toBe('en');
    expect(auth.region).toBeNull();
  });

  it('returns null rather than throwing for junk', () => {
    expect(parseWishAuth('not a url')).toBeNull();
    expect(parseWishAuth('')).toBeNull();
  });

  it('rejects a URL with no authkey', () => {
    expect(parseWishAuth('https://gs.hoyoverse.com/x?lang=en')).toBeNull();
  });

  it('rejects plain http and disallowed hosts', () => {
    expect(parseWishAuth(`http://gs.hoyoverse.com/x?authkey=${AUTHKEY}`)).toBeNull();
    expect(parseWishAuth(`https://evil.test/x?authkey=${AUTHKEY}`)).toBeNull();
  });
});

describe('buildGachaLogUrl', () => {
  const auth = parseWishAuth(wishUrl())!;

  it('builds a page request on the same host', () => {
    const url = new URL(buildGachaLogUrl({ auth, gachaType: '301' }));
    expect(url.host).toBe('gs.hoyoverse.com');
    expect(url.pathname).toBe('/event/gacha_info/api/getGachaLog');
    expect(url.searchParams.get('gacha_type')).toBe('301');
    expect(url.searchParams.get('authkey')).toBe(AUTHKEY);
  });

  it('starts at the beginning and then follows the cursor', () => {
    expect(new URL(buildGachaLogUrl({ auth, gachaType: '301' })).searchParams.get('end_id')).toBe(
      '0',
    );
    expect(
      new URL(buildGachaLogUrl({ auth, gachaType: '301', endId: '99' })).searchParams.get('end_id'),
    ).toBe('99');
  });

  it('never asks for more than the API serves', () => {
    const url = new URL(buildGachaLogUrl({ auth, gachaType: '301', size: 500 }));
    expect(url.searchParams.get('size')).toBe('20');
  });

  it('never asks for less than one', () => {
    const url = new URL(buildGachaLogUrl({ auth, gachaType: '301', size: 0 }));
    expect(url.searchParams.get('size')).toBe('1');
  });

  it('omits region when the original URL had none', () => {
    const noRegion = parseWishAuth(`https://gs.hoyoverse.com/x?authkey=${AUTHKEY}`)!;
    const url = new URL(buildGachaLogUrl({ auth: noRegion, gachaType: '301' }));
    expect(url.searchParams.has('region')).toBe(false);
  });
});

describe('failureForRetcode', () => {
  it('treats zero as success', () => {
    expect(failureForRetcode(0)).toBeNull();
  });

  it('recognises an expired or wrong authkey', () => {
    // The gacha log answers 200 with a retcode, so this cannot be read from
    // the HTTP status.
    expect(failureForRetcode(-100)).toBe('expired');
    expect(failureForRetcode(-101)).toBe('expired');
  });

  it('recognises being asked to slow down', () => {
    expect(failureForRetcode(-110)).toBe('visit-too-frequently');
  });

  it('falls back to unexpected for anything else', () => {
    expect(failureForRetcode(-999)).toBe('unexpected');
  });

  it('has copy that says what to do for every failure', () => {
    for (const [failure, copy] of Object.entries(WISH_FAILURE_COPY)) {
      expect(copy.length, failure).toBeGreaterThan(20);
      expect(copy.endsWith('.'), failure).toBe(true);
    }
  });
});
