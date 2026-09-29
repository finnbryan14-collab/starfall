import { NextResponse } from 'next/server';

import { buildGachaLogUrl, parseWishAuth } from '@/lib/wish-api';

/**
 * CORS proxy for one page of the gacha log.
 *
 * The browser cannot call HoYoverse directly. This forwards a single page and
 * nothing more — the paging, the pacing and the merging all live on the client,
 * which is both what DATA.md specifies and what keeps a serverless function
 * from running for the minute a full history would take.
 *
 * The authkey:
 *  - arrives in a POST body, never a query string, so it cannot land in an
 *    access log the way a URL parameter would
 *  - is never written to storage, never logged, and never returned
 *  - is used for exactly one outbound request and then goes out of scope
 *
 * See docs/DATA.md section 3.
 */

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  let payload: { url?: unknown; gachaType?: unknown; endId?: unknown };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'bad-url' }, { status: 400 });
  }

  if (typeof payload.url !== 'string' || typeof payload.gachaType !== 'string') {
    return NextResponse.json({ error: 'bad-url' }, { status: 400 });
  }

  // Validates the protocol and the host. Without this the route would forward
  // anywhere it was pointed, which is an open proxy on our own domain.
  const auth = parseWishAuth(payload.url);
  if (!auth) return NextResponse.json({ error: 'bad-url' }, { status: 400 });

  const target = buildGachaLogUrl({
    auth,
    gachaType: payload.gachaType,
    endId: typeof payload.endId === 'string' ? payload.endId : undefined,
  });

  let response: Response;
  try {
    response = await fetch(target, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });
  } catch {
    return NextResponse.json({ error: 'network' }, { status: 502 });
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return NextResponse.json({ error: 'unexpected' }, { status: 502 });
  }

  // The gacha log answers 200 with a retcode, so the body is passed through
  // for the client to interpret rather than being second-guessed here.
  return NextResponse.json(body, {
    status: response.ok ? 200 : response.status,
    // Nothing about a wish import should ever be cached anywhere.
    headers: { 'Cache-Control': 'no-store' },
  });
}
