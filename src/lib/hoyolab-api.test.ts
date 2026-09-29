import { afterEach, describe, expect, it, vi } from 'vitest';

import { fetchDiary, fetchNotes, mintWishUrl } from './hoyolab-api';
import { parseWishAuth } from './wish-api';

const UID = '600000000';
const COOKIE = 'ltoken_v2=FAKE; ltuid_v2=600000000';

function mockFetch(body: unknown, status = 200) {
  const spy = vi.fn(async () => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal('fetch', spy);
  return spy;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchNotes', () => {
  it('posts the cookie in the body, never the query string', async () => {
    const spy = mockFetch({ retcode: 0, data: { current_resin: 40, max_resin: 200 } });
    await fetchNotes(UID, COOKIE);

    const [url, init] = spy.mock.calls[0] as unknown as [string, RequestInit];
    // A credential in a URL lands in every access log it passes through.
    expect(url).toBe('/api/hoyolab');
    expect(url).not.toContain('ltoken');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ action: 'notes', uid: UID, cookie: COOKIE });
  });

  it('parses a successful reply', async () => {
    mockFetch({ retcode: 0, data: { current_resin: 40, max_resin: 200 } });
    const result = await fetchNotes(UID, COOKIE);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.resin).toBe(40);
  });

  it('reads a failure out of the retcode, not the status', async () => {
    // HoYoLAB answers 200 for a dead cookie.
    mockFetch({ retcode: -100, message: 'not logged in' });
    const result = await fetchNotes(UID, COOKIE);

    expect(result).toEqual({ ok: false, reason: 'invalid-cookie' });
  });

  it('names the switched-off notes case, which has its own fix', async () => {
    mockFetch({ retcode: 10104, message: 'denied' });
    expect(await fetchNotes(UID, COOKIE)).toEqual({ ok: false, reason: 'notes-denied' });
  });

  it('reports a proxy-level rejection', async () => {
    mockFetch({ error: 'unsupported-server' }, 400);
    expect(await fetchNotes(UID, COOKIE)).toEqual({ ok: false, reason: 'unsupported-server' });
  });

  it('reports a dropped connection rather than throwing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('network');
      }),
    );

    expect(await fetchNotes(UID, COOKIE)).toEqual({ ok: false, reason: 'network' });
  });

  it('does not treat an unreadable payload as success', async () => {
    mockFetch({ retcode: 0, data: { nothing: 'useful' } });
    expect(await fetchNotes(UID, COOKIE)).toEqual({ ok: false, reason: 'unknown' });
  });
});

describe('fetchDiary', () => {
  it('passes the month through when one is asked for', async () => {
    const spy = mockFetch({ retcode: 0, data: { data_month: 8, month_data: {} } });
    await fetchDiary(UID, COOKIE, 8);

    expect(
      JSON.parse((spy.mock.calls[0] as unknown as [string, RequestInit])[1].body as string),
    ).toMatchObject({ action: 'diary', month: 8 });
  });

  it('reads the month total', async () => {
    mockFetch({
      retcode: 0,
      data: { data_month: 9, month_data: { current_primogems: 4_320, group_by: [] } },
    });

    const result = await fetchDiary(UID, COOKIE);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.primogems).toBe(4_320);
  });
});

describe('mintWishUrl', () => {
  it('turns a minted key into a URL the ordinary import can read', async () => {
    mockFetch({ retcode: 0, data: { authkey: 'MINTED_KEY_0001' } });
    const result = await mintWishUrl(UID, COOKIE);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const auth = parseWishAuth(result.data)!;
    expect(auth.authkey).toBe('MINTED_KEY_0001');
    expect(auth.region).toBe('os_usa');
  });

  it('decodes the key exactly once', async () => {
    // The endpoint returns it percent-encoded; encoding it again produces a
    // key the API rejects for reasons that say nothing about encoding.
    mockFetch({ retcode: 0, data: { authkey: 'abc%2Bdef%3D%3D' } });
    const result = await mintWishUrl(UID, COOKIE);

    expect(result.ok).toBe(true);
    if (result.ok) expect(parseWishAuth(result.data)!.authkey).toBe('abc+def==');
  });

  it('keeps a key that was never encoded', async () => {
    mockFetch({ retcode: 0, data: { authkey: '100%pure' } });
    const result = await mintWishUrl(UID, COOKIE);

    expect(result.ok).toBe(true);
    if (result.ok) expect(parseWishAuth(result.data)!.authkey).toBe('100%pure');
  });

  it('refuses a UID whose server it cannot place, without spending a request', async () => {
    const spy = mockFetch({ retcode: 0, data: { authkey: 'x' } });
    expect(await mintWishUrl('400000000', COOKIE)).toEqual({
      ok: false,
      reason: 'unsupported-server',
    });
    expect(spy).not.toHaveBeenCalled();
  });

  it('does not invent a URL when no key came back', async () => {
    mockFetch({ retcode: 0, data: {} });
    expect(await mintWishUrl(UID, COOKIE)).toEqual({ ok: false, reason: 'unknown' });
  });
});
