import { generateKeyPairSync } from 'node:crypto';

/**
 * Generates a VAPID key pair for Web Push.
 *
 * VAPID is how a push service knows a notification really came from us: the
 * server signs each request with the private key, and the browser subscribed
 * with the matching public one. They are a pair for the life of the deploy —
 * rotating the key silently invalidates every existing subscription, so it is
 * generated once, by hand, and kept.
 *
 * Nothing here talks to a push service or writes a file. It prints the pair and
 * says where each half goes, because the private key is a secret and a script
 * that quietly drops secrets into files in a repo is how they get committed.
 *
 * The keys are P-256, and the encoding is the raw form base64url'd, which is
 * what the Push API and every server library expect:
 *   public  — 0x04 ‖ x ‖ y, 65 bytes
 *   private — the scalar d, 32 bytes
 *
 *   https://datatracker.ietf.org/doc/html/rfc8292
 *
 * Run: pnpm vapid
 */

type Jwk = { x?: string; y?: string; d?: string };

const fromBase64Url = (value: string) => Buffer.from(value, 'base64url');

function generate(): { publicKey: string; privateKey: string } {
  const pair = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });

  const pub = pair.publicKey.export({ format: 'jwk' }) as Jwk;
  const priv = pair.privateKey.export({ format: 'jwk' }) as Jwk;

  if (!pub.x || !pub.y || !priv.d) throw new Error('Key export did not include the coordinates');

  const uncompressed = Buffer.concat([
    Buffer.from([0x04]),
    fromBase64Url(pub.x),
    fromBase64Url(pub.y),
  ]);

  if (uncompressed.length !== 65) {
    throw new Error(`Public key is ${uncompressed.length} bytes, expected 65`);
  }
  if (fromBase64Url(priv.d).length !== 32) {
    throw new Error(`Private key is ${fromBase64Url(priv.d).length} bytes, expected 32`);
  }

  return { publicKey: uncompressed.toString('base64url'), privateKey: priv.d };
}

const { publicKey, privateKey } = generate();

console.log(`
A VAPID key pair for Starfall. Generate these once and keep them — changing
them invalidates every subscription anyone has already made.

  NEXT_PUBLIC_VAPID_PUBLIC_KEY=${publicKey}

    Safe to ship. The browser needs it to subscribe, so it goes in the client
    bundle; that is what the NEXT_PUBLIC_ prefix means.

  VAPID_PRIVATE_KEY=${privateKey}

    A secret. Set it in Vercel's environment variables, never in a file that
    is committed. Anyone holding it can send notifications to your subscribers.

  VAPID_SUBJECT=mailto:you@example.com

    A way for the push service to reach you if something goes wrong. Required
    by RFC 8292; a mailto: or https: URL.
`);
