/**
 * Primogem income assumptions.
 *
 * Every value carries its source and the date it was checked, because these
 * change between patches and a stale default is worse than no default — it
 * looks authoritative. The income sheet shows `ASSUMPTIONS_VERIFIED_AT` so a
 * player can see how old these are, and can override every one of them.
 *
 * `confidence` says what kind of number it is:
 *   'official'  — published by HoYoverse, or an in-game constant.
 *   'community' — an estimate from community trackers. Sound, but not official,
 *                 and in some cases a range rather than a figure.
 *
 * Nothing here is from memory. See docs/MATH.md section 3.
 */

export type Confidence = 'official' | 'community';

export type Sourced<T> = {
  value: T;
  source: string;
  verifiedAt: string;
  confidence: Confidence;
  note?: string;
};

/** Shown in the income sheet so stale defaults are visible. */
export const ASSUMPTIONS_VERIFIED_AT = '2026-09-28';

/** One Intertwined Fate costs this many primogems. In-game constant. */
export const PRIMOGEMS_PER_PULL: Sourced<number> = {
  value: 160,
  source: 'https://genshin-impact.fandom.com/wiki/Intertwined_Fate',
  verifiedAt: '2026-09-28',
  confidence: 'official',
};

/**
 * A version lasts about six weeks in two roughly three-week banner phases.
 * Used to prorate per-patch figures across an arbitrary date range.
 */
export const PATCH_LENGTH_DAYS: Sourced<number> = {
  value: 42,
  source: 'https://game8.co/games/Genshin-Impact/archives/305012',
  verifiedAt: '2026-09-28',
  confidence: 'community',
  note: 'Nominal six-week cadence. Individual patches have run long.',
};

export const DAILY_COMMISSIONS: Sourced<number> = {
  value: 60,
  source: 'https://www.gachahaven.com/genshin/guides/primogems-per-patch',
  verifiedAt: '2026-09-28',
  confidence: 'community',
  note: 'Four commissions plus the completion bonus from Katheryne. Corroborated by pitycalculator.com at ~1,800/month.',
};

export const WELKIN_PER_DAY: Sourced<number> = {
  value: 90,
  source: 'https://www.topuplive.com/news/genshin-impact-blessing-of-the-welkin-moon.html',
  verifiedAt: '2026-09-28',
  confidence: 'official',
  note: 'Blessing of the Welkin Moon: 90 primogems per day for 30 days, claimed on login. Some guides quote 300/day by conflating the separate one-time 300 Genesis Crystals.',
};

export const WELKIN_DURATION_DAYS: Sourced<number> = {
  value: 30,
  source: 'https://www.topuplive.com/news/genshin-impact-blessing-of-the-welkin-moon.html',
  verifiedAt: '2026-09-28',
  confidence: 'official',
};

/**
 * Spiral Abyss resets on the 16th of each month — once monthly, not twice.
 *
 * It used to reset on the 1st and the 16th, and many community guides still say
 * so. HoYoverse's own support page is explicit that it is the 16th only, which
 * halves the Abyss contribution relative to those guides.
 */
export const SPIRAL_ABYSS_PER_RESET: Sourced<number> = {
  value: 800,
  source:
    'https://support.hoyoverse.com/hc/en-us/articles/50333950598553-When-does-the-Spiral-Abyss-reset-and-what-are-the-rewards',
  verifiedAt: '2026-09-28',
  confidence: 'community',
  note: 'Schedule is official (16th of each month). The 800 maximum for a full Floors 9-12 clear is a community figure.',
};

export const IMAGINARIUM_THEATER_PER_RESET: Sourced<number> = {
  value: 1000,
  source:
    'https://support.hoyoverse.com/hc/en-us/articles/50333950598553-When-does-the-Spiral-Abyss-reset-and-what-are-the-rewards',
  verifiedAt: '2026-09-28',
  confidence: 'community',
  note: 'Schedule is official (1st of each month). The 1,000 maximum — 800 for Acts 1-10 plus 100 for each of two Lunar Arcanum Challenges — is a community figure.',
};

/** Day of the month each endgame mode resets, at the daily reset hour. */
export const SPIRAL_ABYSS_RESET_DAY = 16;
export const IMAGINARIUM_THEATER_RESET_DAY = 1;

export const EVENTS_PER_PATCH: Sourced<number> = {
  value: 3200,
  source: 'https://www.gachahaven.com/genshin/guides/primogems-per-patch',
  verifiedAt: '2026-09-28',
  confidence: 'community',
  note: 'Midpoint of a 1,800-5,200 range. Event income swings more than any other source, so this is the one to override.',
};

export const COMPENSATION_PER_PATCH: Sourced<number> = {
  value: 500,
  source: 'https://www.gachahaven.com/genshin/guides/primogems-per-patch',
  verifiedAt: '2026-09-28',
  confidence: 'community',
  note: 'Livestream codes, maintenance compensation and similar. Midpoint of a 300-800 range.',
};

export const EXPLORATION_PER_PATCH: Sourced<number> = {
  value: 1400,
  source: 'https://www.gachahaven.com/genshin/guides/primogems-per-patch',
  verifiedAt: '2026-09-28',
  confidence: 'community',
  note: 'New map, quests and chests. Midpoint of a 400-4,000 range; near zero for an account that has already explored everything.',
};

export const BATTLE_PASS_PER_PATCH: Sourced<number> = {
  value: 680,
  source: 'https://www.gachahaven.com/genshin/guides/primogems-per-patch',
  verifiedAt: '2026-09-28',
  confidence: 'community',
  note: 'Paid Gnostic Hymn track. It also grants about 4 Intertwined Fates, counted separately.',
};

export const BATTLE_PASS_FATES_PER_PATCH: Sourced<number> = {
  value: 4,
  source: 'https://www.gachahaven.com/genshin/guides/primogems-per-patch',
  verifiedAt: '2026-09-28',
  confidence: 'community',
};

/**
 * Paimon's Bargains sells Intertwined Fates for Masterless Stardust, capped at
 * 5 per month, resetting on the 1st.
 *
 * The Masterless Starglitter exchange is uncapped, but starglitter income
 * depends on how many duplicate 4-stars you pull, which the planner does not
 * model. Only the capped stardust purchase is a dependable default.
 */
export const STARDUST_FATES_PER_MONTH: Sourced<number> = {
  value: 5,
  source: 'https://genshin-impact.fandom.com/wiki/Paimon%27s_Bargains',
  verifiedAt: '2026-09-28',
  confidence: 'official',
  note: 'Five per fate type per month at 75 Masterless Stardust each, resetting on the 1st.',
};

/** Every sourced value, for the income sheet and for a staleness check. */
export const ALL_SOURCED_VALUES = {
  PRIMOGEMS_PER_PULL,
  PATCH_LENGTH_DAYS,
  DAILY_COMMISSIONS,
  WELKIN_PER_DAY,
  WELKIN_DURATION_DAYS,
  SPIRAL_ABYSS_PER_RESET,
  IMAGINARIUM_THEATER_PER_RESET,
  EVENTS_PER_PATCH,
  COMPENSATION_PER_PATCH,
  EXPLORATION_PER_PATCH,
  BATTLE_PASS_PER_PATCH,
  BATTLE_PASS_FATES_PER_PATCH,
  STARDUST_FATES_PER_MONTH,
} as const;

/** The assumptions a plan starts with. Every one is editable in the sheet. */
export type IncomeAssumptions = {
  dailyCommissions: number;
  welkinPerDay: number;
  spiralAbyssPerReset: number;
  imaginariumTheaterPerReset: number;
  eventsPerPatch: number;
  compensationPerPatch: number;
  explorationPerPatch: number;
  battlePassPerPatch: number;
  battlePassFatesPerPatch: number;
  stardustFatesPerMonth: number;
  patchLengthDays: number;
};

export const DEFAULT_ASSUMPTIONS: IncomeAssumptions = {
  dailyCommissions: DAILY_COMMISSIONS.value,
  welkinPerDay: WELKIN_PER_DAY.value,
  spiralAbyssPerReset: SPIRAL_ABYSS_PER_RESET.value,
  imaginariumTheaterPerReset: IMAGINARIUM_THEATER_PER_RESET.value,
  eventsPerPatch: EVENTS_PER_PATCH.value,
  compensationPerPatch: COMPENSATION_PER_PATCH.value,
  explorationPerPatch: EXPLORATION_PER_PATCH.value,
  battlePassPerPatch: BATTLE_PASS_PER_PATCH.value,
  battlePassFatesPerPatch: BATTLE_PASS_FATES_PER_PATCH.value,
  stardustFatesPerMonth: STARDUST_FATES_PER_MONTH.value,
  patchLengthDays: PATCH_LENGTH_DAYS.value,
};
