import {
  failureForRetcode,
  parseDiary,
  parseNotes,
  recogniseServer,
  type DiaryMonth,
  type HoyolabAction,
  type HoyolabFailure,
  type RealTimeNotes,
} from './hoyolab';
import { buildWishUrlFromAuthkey } from './wish-api';

/**
 * Calling HoYoLAB through our proxy.
 *
 * Every call carries the cookie in the body, is read once, and is never
 * retried automatically — a rate-limited cookie is rate limited for the day,
 * and hammering it would be the one way to make things worse.
 */

export type HoyolabResult<T> = { ok: true; data: T } | { ok: false; reason: HoyolabFailure };

type Request = { uid: string; cookie: string; month?: number };

async function call(action: HoyolabAction, request: Request): Promise<HoyolabResult<unknown>> {
  let response: Response;
  try {
    response = await fetch('/api/hoyolab', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...request }),
    });
  } catch {
    return { ok: false, reason: 'network' };
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return { ok: false, reason: 'unknown' };
  }

  const body = (payload ?? {}) as { error?: string; retcode?: number; data?: unknown };

  if (!response.ok) {
    if (body.error === 'unsupported-server') return { ok: false, reason: 'unsupported-server' };
    if (body.error === 'network') return { ok: false, reason: 'network' };
    return { ok: false, reason: 'unknown' };
  }

  // HoYoLAB answers 200 with a retcode, so success has to be read from the body.
  if (typeof body.retcode === 'number' && body.retcode !== 0) {
    return { ok: false, reason: failureForRetcode(body.retcode) };
  }

  return { ok: true, data: body.data };
}

export async function fetchNotes(
  uid: string,
  cookie: string,
): Promise<HoyolabResult<RealTimeNotes>> {
  const result = await call('notes', { uid, cookie });
  if (!result.ok) return result;

  const notes = parseNotes(result.data);
  return notes ? { ok: true, data: notes } : { ok: false, reason: 'unknown' };
}

export async function fetchDiary(
  uid: string,
  cookie: string,
  month?: number,
): Promise<HoyolabResult<DiaryMonth>> {
  const result = await call('diary', { uid, cookie, month });
  if (!result.ok) return result;

  const diary = parseDiary(result.data);
  return diary ? { ok: true, data: diary } : { ok: false, reason: 'unknown' };
}

/**
 * Mints a fresh wish URL from the cookie.
 *
 * This is the whole point of the opt-in: an authkey lasts about a day, and
 * without a cookie the player has to re-run a script and re-paste every time.
 *
 * The key comes back percent-encoded and is decoded here, once, before it is
 * put into a URL — encoding it twice produces a key the API rejects with a
 * message that says nothing about encoding.
 */
export async function mintWishUrl(uid: string, cookie: string): Promise<HoyolabResult<string>> {
  const server = recogniseServer(uid);
  if (!server) return { ok: false, reason: 'unsupported-server' };

  const result = await call('authkey', { uid, cookie });
  if (!result.ok) return result;

  const raw = (result.data as { authkey?: unknown } | undefined)?.authkey;
  if (typeof raw !== 'string' || raw.length === 0) return { ok: false, reason: 'unknown' };

  let authkey = raw;
  try {
    authkey = decodeURIComponent(raw);
  } catch {
    // A key that is not percent-encoded decodes to itself; a malformed escape
    // means it was never encoded, so the raw value is the right one to use.
  }

  return { ok: true, data: buildWishUrlFromAuthkey({ authkey, region: server }) };
}
