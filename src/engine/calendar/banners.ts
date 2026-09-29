import { GENERATED_BANNER_PHASES, BANNERS_GENERATED_AT } from '@/data/banners-generated';

import { AMERICA_UTC_OFFSET, DAILY_RESET_HOUR } from '../time';

/**
 * Character event banner windows.
 *
 * Two sources, merged, because each lags in a different way:
 *
 *  - paimon.moe (generated, MIT) carries every banner up to the one currently
 *    live. It is the only live fan source with schedules — checked 2026-09-29,
 *    api.genshin.dev was returning 502 and genshin-db states event data is out
 *    of scope. Refresh it with `pnpm build:banners`.
 *  - The curated list below carries what has been *announced* but is not yet in
 *    that data, and anything projected from the six-week cadence. On
 *    2026-09-29 paimon had 7.1 phase 1 but not phase 2, which was announced.
 *
 * Curated entries win on conflict, since they are the ones a human checked. A
 * test asserts the two agree wherever they overlap: a disagreement means one of
 * them is wrong and is worth knowing about rather than silently resolving.
 *
 * Phase boundaries are day-accurate. The game switches banners partway through
 * the day and no source publishes the exact instant, so a window can be a few
 * hours out at its edges — immaterial against 60 to 150 primogems a day.
 */

export type PhaseConfidence = 'announced' | 'projected';
export type PhaseOrigin = 'generated' | 'curated';

export type BannerPhase = {
  version: string;
  phase: number;
  /** Server-local calendar date the phase opens, inclusive. */
  startDate: string;
  /** Server-local calendar date the phase closes, exclusive. */
  endDate: string;
  /** 5-star characters featured. Empty for a projected phase. */
  featured: string[];
  confidence: PhaseConfidence;
  origin: PhaseOrigin;
  source: string;
  verifiedAt: string;
  note?: string;
};

const GAME8_7_1 = 'https://game8.co/games/Genshin-Impact/archives/622056';
const PAIMON = 'https://github.com/MadeBaruna/paimon-moe';

/**
 * Hand-checked phases, for what the generated data does not have yet.
 *
 * Kept deliberately short. Anything the generated source already covers should
 * be removed from here, so there is one obvious place a value comes from.
 */
export const CURATED_BANNER_PHASES: readonly BannerPhase[] = [
  {
    version: '7.1',
    phase: 2,
    startDate: '2026-10-13',
    endDate: '2026-11-03',
    featured: ['Skirk', 'Escoffier'],
    confidence: 'announced',
    origin: 'curated',
    source: GAME8_7_1,
    verifiedAt: '2026-09-28',
    note: 'Both reruns. Announced but not yet in the generated source.',
  },
  {
    version: '7.2',
    phase: 1,
    startDate: '2026-11-03',
    endDate: '2026-11-24',
    featured: [],
    confidence: 'projected',
    origin: 'curated',
    source: GAME8_7_1,
    verifiedAt: '2026-09-28',
    note: 'Dates projected from the six-week cadence. Lineup unannounced.',
  },
  {
    version: '7.2',
    phase: 2,
    startDate: '2026-11-24',
    endDate: '2026-12-15',
    featured: [],
    confidence: 'projected',
    origin: 'curated',
    source: GAME8_7_1,
    verifiedAt: '2026-09-28',
    note: 'Dates projected from the six-week cadence. Lineup unannounced.',
  },
];

const key = (version: string, phase: number) => `${version}/${phase}`;

function buildPhases(): BannerPhase[] {
  const merged = new Map<string, BannerPhase>();

  for (const generated of GENERATED_BANNER_PHASES) {
    merged.set(key(generated.version, generated.phase), {
      ...generated,
      confidence: 'announced',
      origin: 'generated',
      source: PAIMON,
      verifiedAt: BANNERS_GENERATED_AT,
    });
  }

  // Curated last, so a human-checked entry replaces a generated one.
  for (const curated of CURATED_BANNER_PHASES) {
    merged.set(key(curated.version, curated.phase), curated);
  }

  return [...merged.values()].sort((a, b) => a.startDate.localeCompare(b.startDate));
}

export const BANNER_PHASES: readonly BannerPhase[] = buildPhases();

/** When the generated half was last refreshed, for the staleness line. */
export { BANNERS_GENERATED_AT };

/** Days since the generated banner data was refreshed. */
export function bannerDataAgeDays(now: Date = new Date()): number {
  const generated = new Date(`${BANNERS_GENERATED_AT}T00:00:00Z`).getTime();
  return Math.max(0, Math.floor((now.getTime() - generated) / 86_400_000));
}

/** `2026-10-13` at the server daily reset, as a UTC instant. */
function dateToInstant(date: string, utcOffset = AMERICA_UTC_OFFSET): Date {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day, DAILY_RESET_HOUR - utcOffset, 0, 0, 0));
}

export function phaseStart(phase: BannerPhase, utcOffset = AMERICA_UTC_OFFSET): Date {
  return dateToInstant(phase.startDate, utcOffset);
}

export function phaseEnd(phase: BannerPhase, utcOffset = AMERICA_UTC_OFFSET): Date {
  return dateToInstant(phase.endDate, utcOffset);
}

/**
 * The phase a moment falls in, or null if it is outside the known calendar.
 *
 * The window is half-open: the switchover instant belongs to the new phase.
 */
export function currentPhase(at: Date, utcOffset = AMERICA_UTC_OFFSET): BannerPhase | null {
  const time = at.getTime();
  return (
    BANNER_PHASES.find(
      (phase) =>
        phaseStart(phase, utcOffset).getTime() <= time &&
        time < phaseEnd(phase, utcOffset).getTime(),
    ) ?? null
  );
}

/** The first phase that starts strictly after `at`. */
export function nextPhase(at: Date, utcOffset = AMERICA_UTC_OFFSET): BannerPhase | null {
  const time = at.getTime();
  return BANNER_PHASES.find((phase) => phaseStart(phase, utcOffset).getTime() > time) ?? null;
}

const normalise = (name: string) => name.trim().toLowerCase();

/** Every scheduled phase featuring a character, in chronological order. */
export function phasesForCharacter(name: string): BannerPhase[] {
  const wanted = normalise(name);
  return BANNER_PHASES.filter((phase) => phase.featured.some((c) => normalise(c) === wanted));
}

/** The character's name as the calendar spells it, or null if unscheduled. */
export function findCharacter(name: string): string | null {
  const wanted = normalise(name);
  for (const phase of BANNER_PHASES) {
    const match = phase.featured.find((c) => normalise(c) === wanted);
    if (match) return match;
  }
  return null;
}

/** Every 5-star character on the known calendar, deduplicated. */
export function scheduledCharacters(): string[] {
  const seen = new Set<string>();
  for (const phase of BANNER_PHASES) {
    for (const character of phase.featured) seen.add(character);
  }
  return [...seen];
}

/**
 * The date a plan for this character should default to.
 *
 * SPEC.md: the end of that character's banner. design/preview.html uses the
 * start instead ("Skirk returns Oct 13"), but SPEC wins per CLAUDE.md, and the
 * end is the more useful default — you can pull at any point during the banner
 * and you keep earning income throughout it.
 *
 * Picks the soonest banner that has not already closed, so a character with a
 * long rerun history defaults to their next appearance rather than their first.
 */
export function defaultTargetDate(
  name: string,
  now: Date = new Date(),
  utcOffset = AMERICA_UTC_OFFSET,
): Date | null {
  const phases = phasesForCharacter(name);
  if (phases.length === 0) return null;

  const upcoming = phases.find((phase) => phaseEnd(phase, utcOffset).getTime() > now.getTime());
  return phaseEnd(upcoming ?? phases[phases.length - 1], utcOffset);
}
