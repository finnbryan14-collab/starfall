import { SUBSTATS, type MainStatKey } from '@/engine/artifacts/model';

import { formatNumber } from './format';

/**
 * Stat names as the game prints them.
 *
 * Shared because three screens show the same stats and a second copy would
 * drift: "CRIT DMG" on one and "Crit DMG" on another is the sort of thing
 * nobody notices and everybody feels.
 */
export const STAT_NAMES: Record<string, string> = {
  hp: 'HP',
  atk: 'ATK',
  def: 'DEF',
  hp_: 'HP%',
  atk_: 'ATK%',
  def_: 'DEF%',
  er: 'Energy Recharge',
  em: 'Elemental Mastery',
  cr: 'CRIT Rate',
  cd: 'CRIT DMG',
  heal: 'Healing Bonus',
  pyro_dmg: 'Pyro DMG',
  hydro_dmg: 'Hydro DMG',
  electro_dmg: 'Electro DMG',
  cryo_dmg: 'Cryo DMG',
  anemo_dmg: 'Anemo DMG',
  geo_dmg: 'Geo DMG',
  dendro_dmg: 'Dendro DMG',
  physical_dmg: 'Physical DMG',
};

export function statName(key: string): string {
  return STAT_NAMES[key] ?? key;
}

/** True for every stat the game prints with a percent sign. */
export function isPercentStat(key: string): boolean {
  return key in SUBSTATS ? SUBSTATS[key as keyof typeof SUBSTATS].isPercent : true;
}

/**
 * A stat value in the artifact model's units, written the way the game writes it.
 *
 * 46.6 becomes "46.6%" and 4780 becomes "4,780". Takes points rather than
 * fractions, because that is what a GOOD export and the artifact tables carry.
 */
export function formatStatValue(key: string, value: number): string {
  return isPercentStat(key) ? `${value.toFixed(1)}%` : formatNumber(Math.round(value));
}

/** "CRIT DMG 62.2%" */
export function formatStat(key: string, value: number): string {
  return `${statName(key)} ${formatStatValue(key, value)}`;
}

export type { MainStatKey };
