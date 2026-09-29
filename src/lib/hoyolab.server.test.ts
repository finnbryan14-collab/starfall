import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { DS_SALT_OVERSEAS, dynamicSecret, hoyolabHeaders, randomLetters } from './hoyolab.server';

describe('dynamicSecret', () => {
  /**
   * A fixed vector, not just a shape check. If the salt or the string being
   * hashed ever drifts, every HoYoLAB request starts failing with -100 and the
   * cause is invisible — this is the test that names it.
   */
  it('signs a known timestamp and nonce to a known digest', () => {
    expect(dynamicSecret(1_759_000_000_000, 'abcdef')).toBe(
      '1759000000,abcdef,e032fe33f3d3f8f126f2930247490d78',
    );
  });

  it('hashes exactly salt, t and r, in that order', () => {
    const expected = createHash('md5')
      .update(`salt=${DS_SALT_OVERSEAS}&t=1759000000&r=zzzzzz`)
      .digest('hex');

    expect(dynamicSecret(1_759_000_000_000, 'zzzzzz')).toBe(`1759000000,zzzzzz,${expected}`);
  });

  it('uses whole seconds, not milliseconds', () => {
    // A millisecond timestamp is silently accepted by md5 and silently
    // rejected by HoYoLAB.
    expect(dynamicSecret(1_759_000_000_999, 'abcdef').split(',')[0]).toBe('1759000000');
  });

  it('is shaped t,r,hex32', () => {
    expect(dynamicSecret()).toMatch(/^\d{10},[A-Za-z]{6},[0-9a-f]{32}$/);
  });
});

describe('randomLetters', () => {
  it('returns letters only, at the asked-for length', () => {
    expect(randomLetters(6, () => 0)).toBe('aaaaaa');
    expect(randomLetters(10)).toMatch(/^[A-Za-z]{10}$/);
  });

  it('never runs off the end of the alphabet', () => {
    // Math.random() can return values arbitrarily close to 1.
    expect(randomLetters(4, () => 0.999999999)).toMatch(/^[A-Za-z]{4}$/);
  });
});

describe('hoyolabHeaders', () => {
  it('carries the cookie, the signature and the client version', () => {
    const headers = hoyolabHeaders('ltoken_v2=x', '1,a,b');

    expect(headers.Cookie).toBe('ltoken_v2=x');
    expect(headers.DS).toBe('1,a,b');
    expect(headers['x-rpc-client_type']).toBe('5');
    expect(headers['x-rpc-app_version']).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
