import { createHash } from 'node:crypto';

/**
 * The half of the HoYoLAB client that only runs on the server.
 *
 * Kept apart from `hoyolab.ts` for two reasons: `node:crypto` cannot be bundled
 * for the browser, and the DS salt has no business being in a client bundle
 * where it is one View Source away.
 */

/**
 * Salt for the overseas dynamic secret.
 *
 * HoYoLAB rejects an unsigned request. The salt is a build-time constant of
 * the official app, republished by every client library; it is not a secret in
 * any real sense, but it changes with app versions and is the first thing to
 * check when every request suddenly returns -100.
 *
 *   https://github.com/thesadru/genshin.py/blob/master/genshin/constants.py
 *   verifiedAt: 2026-09-29
 */
export const DS_SALT_OVERSEAS = '6s25p5ox5y14umn1p61aqyyvbvvl3lrt';

/** Version the DS headers claim. Paired with the salt above. */
export const HOYOLAB_APP_VERSION = '1.5.0';

const LETTERS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** Six random letters, as the official client uses. */
export function randomLetters(length = 6, random: () => number = Math.random): string {
  let out = '';
  for (let i = 0; i < length; i++) {
    out += LETTERS[Math.floor(random() * LETTERS.length)];
  }
  return out;
}

/**
 * The `DS` header: `timestamp,random,md5(salt=…&t=…&r=…)`.
 *
 * `now` and `random` are injectable so the signature can be asserted against a
 * fixed vector rather than only for its shape.
 */
export function dynamicSecret(
  now: number = Date.now(),
  random: string = randomLetters(),
  salt: string = DS_SALT_OVERSEAS,
): string {
  const t = Math.floor(now / 1000);
  const hash = createHash('md5').update(`salt=${salt}&t=${t}&r=${random}`).digest('hex');
  return `${t},${random},${hash}`;
}

/** Headers HoYoLAB requires on a signed request. */
export function hoyolabHeaders(
  cookie: string,
  ds: string = dynamicSecret(),
): Record<string, string> {
  return {
    Accept: 'application/json',
    Cookie: cookie,
    DS: ds,
    'x-rpc-app_version': HOYOLAB_APP_VERSION,
    'x-rpc-client_type': '5',
    'x-rpc-language': 'en-us',
    'x-rpc-lang': 'en-us',
  };
}
