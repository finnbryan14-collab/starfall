import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * Generates src/data/banners-generated.ts from paimon.moe's banner data.
 *
 * Why this source: of every fan API checked on 2026-09-29, it is the only live
 * one carrying banner schedules.
 *
 *   api.genshin.dev            502, dead
 *   genshin.jmp.blue           alive, but static game data only
 *   genshin-db / its API       alive; the maintainer states event data is out of scope
 *   Amber (gi.yatta.moe)       alive, character and material data, no banner endpoint
 *   ambr.top, hakush.in        unreachable from here, so untested rather than ruled out
 *   paimon.moe                 MIT, actively maintained, has the schedules
 *
 * paimon.moe is MIT licensed; the notice is reproduced in the generated file.
 *
 * It lags for *announced but not yet live* banners — on 2026-09-29 it had 7.1
 * phase 1 but not phase 2, which had been announced. So this never replaces the
 * hand-entered calendar: src/engine/calendar/banners.ts merges the two and
 * prefers whichever is more specific, keeping forward-looking entries we added
 * ourselves.
 *
 * Fails loudly rather than writing a partial file. A silently truncated
 * calendar would quietly move every plan's target date.
 *
 * Run: pnpm build:banners
 */

const SOURCE = 'https://raw.githubusercontent.com/MadeBaruna/paimon-moe/main/src/data/banners.js';
const LICENSE = 'https://github.com/MadeBaruna/paimon-moe/blob/main/LICENSE';
const OUT = path.join(process.cwd(), 'src', 'data', 'banners-generated.ts');
const ENKA_MAP = path.join(process.cwd(), 'src', 'data', 'enka-map.ts');

type ParsedBanner = {
  version: string;
  startDate: string;
  endDate: string;
  featured: string[];
};

/** `raiden_shogun` -> `Raiden Shogun`. */
function titleCase(slug: string): string {
  return slug
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

/**
 * Canonical character names, read from the generated Enka map.
 *
 * Used to turn a slug into the name the rest of the app uses, and to notice
 * when a slug does not correspond to any character we know — which is the
 * first sign the format has drifted.
 */
async function knownCharacterNames(): Promise<Map<string, string>> {
  const source = await readFile(ENKA_MAP, 'utf8');
  // Both quote styles: the generator emits double quotes and Prettier rewrites
  // most of them to single, leaving only names containing an apostrophe. A
  // double-quote-only pattern silently matched almost nothing.
  const names = [...source.matchAll(/name: ['"]([^'"]+)['"]/g)].map((match) => match[1]);
  return new Map(names.map((name) => [name.toLowerCase(), name]));
}

function parseCharacterBanners(source: string): ParsedBanner[] {
  const start = source.indexOf('characters: [');
  if (start < 0) throw new Error('No `characters:` array — the source format has changed');
  const end = source.indexOf('\n  ],', start);
  if (end < 0) throw new Error('Could not find the end of the characters array');

  const block = source.slice(start, end);
  const pattern =
    /\{\s*name: '([^']*)',[\s\S]*?start: '([^']+)',\s*end: '([^']+)',[\s\S]*?featured: \[([^\]]*)\][\s\S]*?version: '([^']*)'/g;

  const banners: ParsedBanner[] = [];
  for (const match of block.matchAll(pattern)) {
    const [, , startAt, endAt, featuredRaw, version] = match;
    const featured = featuredRaw
      .split(',')
      .map((entry) => entry.trim().replace(/^'|'$/g, ''))
      .filter(Boolean);

    banners.push({
      version,
      startDate: startAt.slice(0, 10),
      endDate: endAt.slice(0, 10),
      featured,
    });
  }

  return banners;
}

async function main() {
  const response = await fetch(SOURCE);
  if (!response.ok) throw new Error(`${SOURCE} returned ${response.status}`);
  const source = await response.text();

  const parsed = parseCharacterBanners(source);
  if (parsed.length < 50) {
    throw new Error(`Only ${parsed.length} banners parsed — the source format has changed`);
  }

  const canonical = await knownCharacterNames();
  const unknown = new Set<string>();

  // Phase number comes from the order within a version, which the source does
  // not state directly.
  const byVersion = new Map<string, ParsedBanner[]>();
  for (const banner of parsed) {
    const list = byVersion.get(banner.version) ?? [];
    list.push(banner);
    byVersion.set(banner.version, list);
  }

  const rows: string[] = [];
  for (const [version, banners] of byVersion) {
    const sorted = [...banners].sort((a, b) => a.startDate.localeCompare(b.startDate));
    // Two banners run side by side in a phase, so distinct start dates are phases.
    const phaseStarts = [...new Set(sorted.map((b) => b.startDate))];

    for (const banner of sorted) {
      const phase = phaseStarts.indexOf(banner.startDate) + 1;
      const names = banner.featured.map((slug) => {
        const guess = titleCase(slug);
        const known = canonical.get(guess.toLowerCase());
        if (!known) unknown.add(slug);
        return known ?? guess;
      });

      rows.push(
        `  { version: '${version}', phase: ${phase}, startDate: '${banner.startDate}', ` +
          `endDate: '${banner.endDate}', featured: ${JSON.stringify(names)} },`,
      );
    }
  }

  // Unknown slugs are expected for a character too new for our Enka map, so
  // this reports rather than fails — but a long list means something drifted.
  if (unknown.size > 0) {
    console.warn(
      `Note: ${unknown.size} featured slug(s) had no match in enka-map.ts, ` +
        `so their names are title-cased guesses: ${[...unknown].slice(0, 10).join(', ')}`,
    );
  }

  const file = `// Generated by scripts/build-banners.mts on ${new Date().toISOString().slice(0, 10)}.
// Do not edit by hand. Re-run \`pnpm build:banners\`.
//
// Banner schedules from paimon.moe, which is MIT licensed:
//   ${SOURCE}
//   ${LICENSE}
//
// This source lags for announced-but-not-yet-live banners, so it never
// replaces the hand-entered calendar — src/engine/calendar/banners.ts merges
// the two. See that file for how conflicts are resolved.

export type GeneratedBannerPhase = {
  version: string;
  phase: number;
  startDate: string;
  endDate: string;
  featured: string[];
};

export const GENERATED_BANNER_PHASES: readonly GeneratedBannerPhase[] = [
${rows.join('\n')}
];

/** When this file was generated, so the app can say how stale it is. */
export const BANNERS_GENERATED_AT = '${new Date().toISOString().slice(0, 10)}';
`;

  await mkdir(path.dirname(OUT), { recursive: true });
  await writeFile(OUT, file, 'utf8');

  const latest = parsed[parsed.length - 1];
  console.log(
    `Wrote ${rows.length} banner phases to src/data/banners-generated.ts ` +
      `(newest: v${latest.version}, ${latest.startDate}).`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
