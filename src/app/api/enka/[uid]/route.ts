import { NextResponse } from 'next/server';

import {
  DEFAULT_TTL_SECONDS,
  ENKA_BASE,
  failureForStatus,
  isValidUid,
  type EnkaFailure,
} from '@/lib/enka';

/**
 * Proxy for Enka.Network's UID showcase.
 *
 * The browser cannot call Enka directly — CORS — and DATA.md requires these
 * requests to go through us anyway, with a descriptive User-Agent so Enka can
 * identify the traffic.
 *
 * Enka's docs are explicit that a repeat request consumes rate limit even when
 * it returns cached data, so the TTL they send is a rule, not a hint. It is
 * honoured in two places: here, and again in the browser, which is the one that
 * actually prevents the request.
 *
 *   docs: https://github.com/EnkaNetwork/API-docs/blob/master/api.md
 *   verifiedAt: 2026-09-29
 */

/** Always runs fresh; the caching below is deliberate and TTL-driven. */
export const dynamic = 'force-dynamic';

type CacheEntry = { body: unknown; ttlSeconds: number; fetchedAt: number };

/**
 * Per-instance cache.
 *
 * A serverless instance is not shared or durable, so this only helps while one
 * stays warm — which is enough to stop a handful of friends hammering the same
 * UID. The browser's IndexedDB copy is the cache that matters.
 */
const cache = new Map<string, CacheEntry>();

function fail(reason: EnkaFailure, status: number) {
  return NextResponse.json({ error: reason }, { status });
}

export async function GET(_request: Request, context: { params: Promise<{ uid: string }> }) {
  // Route params are async in Next 16.
  const { uid } = await context.params;

  // Checked before spending a request, because Enka rate-limits on attempts.
  if (!isValidUid(uid)) return fail('invalid-uid', 400);

  const cached = cache.get(uid);
  if (cached && Date.now() - cached.fetchedAt < cached.ttlSeconds * 1000) {
    return NextResponse.json(
      { data: cached.body, ttl: cached.ttlSeconds, fetchedAt: cached.fetchedAt, cached: true },
      // Tells the browser the same thing, so it can hold off too.
      { headers: { 'Cache-Control': `private, max-age=${cached.ttlSeconds}` } },
    );
  }

  const contact = process.env.STARFALL_CONTACT ?? 'contact-not-set';

  let response: Response;
  try {
    response = await fetch(`${ENKA_BASE}/${uid}/`, {
      headers: {
        // Enka asks for a custom User-Agent so they can identify and help
        // traffic. STARFALL_CONTACT must be set to something reachable
        // before this is deployed anywhere public.
        'User-Agent': `Starfall/0.1 (+${contact})`,
        Accept: 'application/json',
      },
      cache: 'no-store',
    });
  } catch {
    return fail('network', 502);
  }

  if (!response.ok) {
    const reason = failureForStatus(response.status);
    // Pass Enka's own status through where it is meaningful, so the browser
    // can distinguish maintenance from a bad UID without parsing prose.
    return fail(reason, response.status === 429 ? 429 : response.status);
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return fail('server-error', 502);
  }

  const ttlSeconds =
    typeof (body as { ttl?: unknown }).ttl === 'number'
      ? Math.max(1, (body as { ttl: number }).ttl)
      : DEFAULT_TTL_SECONDS;

  const fetchedAt = Date.now();
  cache.set(uid, { body, ttlSeconds, fetchedAt });

  return NextResponse.json(
    { data: body, ttl: ttlSeconds, fetchedAt, cached: false },
    { headers: { 'Cache-Control': `private, max-age=${ttlSeconds}` } },
  );
}
