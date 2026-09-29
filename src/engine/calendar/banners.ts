import { AMERICA_UTC_OFFSET, DAILY_RESET_HOUR } from '../income/project';

/**
 * Character event banner windows.
 *
 * A version runs about six weeks in two roughly three-week phases. Phase
 * boundaries are day-accurate: the game switches banners partway through the
 * day rather than at the daily reset, and no source publishes the exact
 * instant, so a window here can be a few hours out at its edges. That is
 * immaterial against income of 60 to 150 primogems a day, but it is why
 * `phaseStart`/`phaseEnd` are functions rather than stored instants — the
 * approximation lives in one place.
 *
 * Regenerate each patch. Anything not yet announced is marked 'projected' and
 * carries no character list, so a projected window can never be mistaken for a
 * confirmed lineup.
 */

export type PhaseConfidence = 'announced' | 'projected';

export type BannerPhase = {
  version: string;
  phase: 1 | 2;
  /** Server-local calendar date the phase opens, inclusive. */
  startDate: string;
  /** Server-local calendar date the phase closes, exclusive. */
  endDate: string;
  /** 5-star characters featured. Empty for a projected phase. */
  featured: string[];
  confidence: PhaseConfidence;
  source: string;
  verifiedAt: string;
  note?: string;
};

const GAME8_7_1 = 'https://game8.co/games/Genshin-Impact/archives/622056';

export const BANNER_PHASES: readonly BannerPhase[] = [
  {
    version: '7.1',
    phase: 1,
    startDate: '2026-09-23',
    endDate: '2026-10-13',
    featured: ['Vesna', 'Vodyanitsa'],
    confidence: 'announced',
    source: GAME8_7_1,
    verifiedAt: '2026-09-28',
  },
  {
    version: '7.1',
    phase: 2,
    startDate: '2026-10-13',
    endDate: '2026-11-03',
    featured: ['Skirk', 'Escoffier'],
    confidence: 'announced',
    source: GAME8_7_1,
    verifiedAt: '2026-09-28',
    note: 'Both reruns. This is the banner design/preview.html plans against.',
  },
  {
    version: '7.2',
    phase: 1,
    startDate: '2026-11-03',
    endDate: '2026-11-24',
    featured: [],
    confidence: 'projected',
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
    source: GAME8_7_1,
    verifiedAt: '2026-09-28',
    note: 'Dates projected from the six-week cadence. Lineup unannounced.',
  },
];

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
 * Picks the soonest banner that has not already closed.
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
