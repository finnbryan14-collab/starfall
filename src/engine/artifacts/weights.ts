import type { SubstatKey } from './model';

/**
 * Stat weights for judging an artifact against a role.
 *
 * These are ours, not HoYoverse's and not scraped from anywhere — DATA.md says
 * so explicitly. They are a rough statement of "how much does one roll of this
 * stat move this kind of character", on a scale where 1 is a full-value roll
 * and 0 is dead weight.
 *
 * They are deliberately coarse. A real answer depends on the character's own
 * numbers, their weapon, their team and the enemy, which is the build
 * optimiser in BACKLOG.md rather than this. Treat a preset as a starting point
 * the player can edit, not a verdict.
 *
 * lastReviewed: 2026-09-29
 */

export type StatWeights = Partial<Record<SubstatKey, number>>;

export type WeightPreset = {
  id: string;
  label: string;
  /** One line explaining who this is for. */
  note: string;
  weights: StatWeights;
};

/**
 * Crit is weighted 1 throughout: for almost any damage dealer a crit roll is
 * the most valuable thing a piece can gain, and every other stat is judged
 * against it. CRIT Rate and CRIT DMG are equal per *roll* because a CRIT DMG
 * roll is worth about twice a CRIT Rate roll and there is about half as much of
 * it — which is the same reason crit value counts 2 x rate + damage.
 */
const CRIT: StatWeights = { cr: 1, cd: 1 };

export const WEIGHT_PRESETS: WeightPreset[] = [
  {
    id: 'crit-atk',
    label: 'Crit DPS, ATK scaling',
    note: 'Most damage dealers: Hu Tao, Ayaka, Yoimiya.',
    weights: { ...CRIT, atk_: 0.8, atk: 0.3, em: 0.3, er: 0.3 },
  },
  {
    id: 'crit-hp',
    label: 'Crit DPS, HP scaling',
    note: 'Characters whose damage scales off max HP.',
    weights: { ...CRIT, hp_: 0.8, hp: 0.3, em: 0.3, er: 0.3 },
  },
  {
    id: 'crit-def',
    label: 'Crit DPS, DEF scaling',
    note: 'Characters whose damage scales off DEF.',
    weights: { ...CRIT, def_: 0.8, def: 0.3, em: 0.2, er: 0.3 },
  },
  {
    id: 'crit-em',
    label: 'Crit DPS, EM scaling',
    note: 'Reaction-driven damage dealers who still want to crit.',
    weights: { ...CRIT, em: 0.9, atk_: 0.5, er: 0.3 },
  },
  {
    id: 'er-support',
    label: 'Energy Recharge support',
    note: 'Burst-reliant supports. Crit only matters once energy is solved.',
    weights: { er: 1, em: 0.4, atk_: 0.4, hp_: 0.4, cr: 0.3, cd: 0.3 },
  },
  {
    id: 'em-reaction',
    label: 'Elemental Mastery reaction',
    note: 'Pure reaction enablers, where crit does nothing at all.',
    weights: { em: 1, er: 0.5, atk_: 0.1, hp_: 0.1 },
  },
];

export const DEFAULT_PRESET_ID = 'crit-atk';

export function presetById(id: string): WeightPreset | undefined {
  return WEIGHT_PRESETS.find((preset) => preset.id === id);
}
