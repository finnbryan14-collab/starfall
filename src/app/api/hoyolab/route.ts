import { NextResponse } from 'next/server';

import {
  AUTHKEY_URL,
  diaryUrl,
  notesUrl,
  recogniseServer,
  type HoyolabAction,
} from '@/lib/hoyolab';
import { hoyolabHeaders } from '@/lib/hoyolab.server';

/**
 * Signed proxy for the three HoYoLAB endpoints Starfall uses.
 *
 * The browser cannot call HoYoLAB directly: the requests need a `Cookie`
 * header the browser will not set cross-origin, and a `DS` signature computed
 * from a salt that has no business in a client bundle.
 *
 * What happens to the cookie here:
 *
 *  - it arrives in a POST body, never a query string, so it cannot be written
 *    to an access log the way a URL parameter would
 *  - it is used for exactly one outbound request and then goes out of scope
 *  - it is never stored, never logged, and never echoed back
 *
 * That is as good as a proxy can be, and it is still not "never leaves your
 * device". The Account screen says so plainly rather than implying otherwise.
 *
 * Only the three URLs below are ever called, all built here from a validated
 * UID. Nothing the client sends is used as a destination, so this cannot be
 * pointed at anything else.
 *
 * See docs/DATA.md section 5.
 */

export const dynamic = 'force-dynamic';

const UID_PATTERN = /^\d{9,10}$/;

type Payload = {
  action?: unknown;
  uid?: unknown;
  cookie?: unknown;
  month?: unknown;
};

const bad = (error: string, status = 400) =>
  NextResponse.json({ error }, { status, headers: { 'Cache-Control': 'no-store' } });

export async function POST(request: Request) {
  let payload: Payload;
  try {
    payload = await request.json();
  } catch {
    return bad('bad-request');
  }

  const { action, uid, cookie } = payload;
  if (typeof action !== 'string' || typeof uid !== 'string' || typeof cookie !== 'string') {
    return bad('bad-request');
  }
  if (!UID_PATTERN.test(uid) || cookie.length === 0) return bad('bad-request');

  const server = recogniseServer(uid);
  if (!server) return bad('unsupported-server');

  const headers = hoyolabHeaders(cookie);

  let response: Response;
  try {
    switch (action as HoyolabAction) {
      case 'notes':
        response = await fetch(notesUrl(uid, server), { headers, cache: 'no-store' });
        break;

      case 'diary': {
        // The ledger reports by calendar month; anything else is the client's
        // idea and would let it ask for a month that does not exist.
        const month =
          typeof payload.month === 'number' && payload.month >= 1 && payload.month <= 12
            ? Math.floor(payload.month)
            : new Date().getUTCMonth() + 1;
        response = await fetch(diaryUrl(uid, server, month), { headers, cache: 'no-store' });
        break;
      }

      case 'authkey':
        response = await fetch(AUTHKEY_URL, {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            game_uid: uid,
            region: server,
            game_biz: 'hk4e_global',
            auth_appid: 'webview_gacha',
          }),
          cache: 'no-store',
        });
        break;

      default:
        return bad('bad-request');
    }
  } catch {
    return bad('network', 502);
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return bad('unexpected', 502);
  }

  // HoYoLAB answers 200 with a retcode, so the body is passed through for the
  // client to read rather than being second-guessed here.
  return NextResponse.json(body, {
    status: response.ok ? 200 : response.status,
    headers: { 'Cache-Control': 'no-store' },
  });
}
