import { z } from 'zod';

import type { HitCategory, TalentHit } from '@/engine/damage/build';

/**
 * A character's talent damage multipliers, fetched on demand.
 *
 * All 129 characters together are 620 KB and a screen only ever wants one, so
 * `pnpm build:data` writes one file each and this fetches the one asked for.
 * The service worker caches it after the first use, which is what keeps the
 * optimiser working offline.
 *
 * Validated on arrival rather than trusted. The file is ours, but it is fetched
 * at runtime: a stale service-worker entry from an older patch, a half-written
 * response, a deploy caught mid-flight — any of those would otherwise reach the
 * damage formula as NaN and come back out as a plausible-looking number.
 *
 * See docs/DATA.md section 4.
 */

const talentPart = z.object({
  join: z.enum(['', '+', '/']),
  stat: z.enum(['atk', 'hp', 'def', 'em']),
  values: z.array(z.number().finite()).min(1),
});

const talentGroup = z.object({
  name: z.string().min(1),
  hits: z.array(z.object({ label: z.string().min(1), parts: z.array(talentPart).min(1) })).min(1),
});

const talentFile = z.object({
  key: z.string().min(1),
  version: z.string().optional(),
  talents: z.object({
    normal: talentGroup.optional(),
    skill: talentGroup.optional(),
    burst: talentGroup.optional(),
  }),
});

export type TalentGroupName = 'normal' | 'skill' | 'burst';
export type TalentGroup = { name: string; hits: TalentHit[] };
export type Talents = Partial<Record<TalentGroupName, TalentGroup>>;

export const TALENT_GROUPS: readonly TalentGroupName[] = ['normal', 'skill', 'burst'];

/** What a talent group is called on a character screen. */
export const TALENT_GROUP_LABELS: Record<TalentGroupName, string> = {
  normal: 'Normal Attack',
  skill: 'Elemental Skill',
  burst: 'Elemental Burst',
};

/**
 * Our group names against GOOD's.
 *
 * GOOD calls the normal attack talent `auto`, and the talent *level* is read
 * off a scanner export under that name while the multipliers are read under
 * ours. Both vocabularies are fixed by someone else, so the bridge is explicit.
 */
export const TALENT_LEVEL_KEYS: Record<TalentGroupName, 'auto' | 'skill' | 'burst'> = {
  normal: 'auto',
  skill: 'skill',
  burst: 'burst',
};

/** Fetched files, kept for the session so switching characters back is free. */
const cache = new Map<string, Talents | null>();

export type TalentFailure = 'not-found' | 'malformed' | 'unreachable';

export class TalentLoadError extends Error {
  constructor(readonly reason: TalentFailure) {
    super(
      reason === 'not-found'
        ? 'Starfall has no talent data for that character yet.'
        : reason === 'malformed'
          ? 'That character’s talent data is damaged. Reloading usually fixes it.'
          : 'Could not reach the talent data. Check your connection.',
    );
    this.name = 'TalentLoadError';
  }
}

/**
 * Loads one character's talents by GOOD key.
 *
 * Returns null for a character the data genuinely has none for — Manekin and
 * Manekina carry no damage talents in the game data at all — so a screen can
 * tell "nothing to optimise" apart from "something went wrong".
 */
export async function loadTalents(key: string): Promise<Talents | null> {
  const cached = cache.get(key);
  if (cached !== undefined) return cached;

  let response: Response;
  try {
    response = await fetch(`/data/talents/${encodeURIComponent(key)}.json`);
  } catch {
    throw new TalentLoadError('unreachable');
  }

  if (response.status === 404) {
    cache.set(key, null);
    return null;
  }
  if (!response.ok) throw new TalentLoadError('unreachable');

  let raw: unknown;
  try {
    raw = await response.json();
  } catch {
    throw new TalentLoadError('malformed');
  }

  const parsed = talentFile.safeParse(raw);
  if (!parsed.success) throw new TalentLoadError('malformed');

  const talents: Talents = {};
  for (const group of TALENT_GROUPS) {
    const found = parsed.data.talents[group];
    if (found) talents[group] = found;
  }

  const result = Object.keys(talents).length > 0 ? talents : null;
  cache.set(key, result);
  return result;
}

/**
 * Which kind of hit a label is, which decides what bonuses reach it.
 *
 * A skill or a burst is simply its group. Inside a normal attack the label is
 * the only thing that distinguishes the three: Marechaussee Hunter's 2-piece is
 * Normal and Charged only, and Long Night's Oath is Plunging only.
 *
 * An Aimed Shot counts as a Charged Attack, because that is what it is — a bow
 * character's charged attack is the aimed shot, and the game does not consume
 * stamina for it.
 *
 *   source: https://genshin-impact.fandom.com/wiki/Charged_Attack
 *   verifiedAt: 2026-09-30
 */
export function hitCategoryOf(group: TalentGroupName, label: string): HitCategory {
  if (group !== 'normal') return group;
  if (/plunge|plunging/i.test(label)) return 'plunge';
  if (/charged|aimed/i.test(label)) return 'charged';
  return 'normal';
}

/**
 * A readable name for one of a label's alternatives.
 *
 * The game names them itself, inside the label: "Low/High Plunge DMG" is a low
 * plunge and a high plunge, and "Stone Stele/Resonance DMG" is two hits of
 * Zhongli's skill. The last segment carries the shared tail, so the earlier
 * ones borrow it — which turns the first into "Low Plunge DMG" rather than a
 * bare "Low".
 *
 * Falls back to a number when the label does not name its own alternatives,
 * because a picker offering the same words twice is worse than one offering a
 * number.
 */
function labelFor(label: string, variant: number, alternatives: number): string {
  if (alternatives === 1) return label;

  const names = label.split('/').map((name) => name.trim());
  if (names.length !== alternatives) return `${label} (${variant + 1})`;

  const last = names[names.length - 1];
  if (variant === names.length - 1) return last;

  const tail = last.split(' ').slice(1).join(' ');
  return tail ? `${names[variant]} ${tail}` : names[variant];
}

/** Every hit a character has, flattened, with where each came from. */
export type TalentOption = {
  group: TalentGroupName;
  /** The talent's own name, e.g. "Guide to Afterlife". */
  talentName: string;
  hit: TalentHit;
  category: HitCategory;
  /** Which of a label's alternatives this is, for a slash-joined label. */
  variant: number;
  /** What to show in a picker: "Blood Blossom DMG", "Low Plunge DMG". */
  label: string;
};

/**
 * Flattens the three groups into one list a picker can show.
 *
 * A label joined by slashes is two different hits sharing one name — a low and
 * a high plunge — so it becomes two options rather than one the player cannot
 * choose between.
 */
export function talentOptions(talents: Talents): TalentOption[] {
  const options: TalentOption[] = [];

  for (const group of TALENT_GROUPS) {
    const found = talents[group];
    if (!found) continue;

    for (const hit of found.hits) {
      const alternatives = hit.parts.filter((part) => part.join === '/').length + 1;

      for (let variant = 0; variant < alternatives; variant++) {
        const label = labelFor(hit.label, variant, alternatives);

        options.push({
          group,
          talentName: found.name,
          hit,
          category: hitCategoryOf(group, hit.label),
          variant,
          label,
        });
      }
    }
  }

  return options;
}
