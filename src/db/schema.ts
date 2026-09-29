import Dexie, { type EntityTable } from 'dexie';

import type { IncomeAssumptions, IncomeToggles } from '@/engine/income';

/**
 * Local-first storage. Everything the player enters or imports stays on their
 * device; there is no server copy (docs/DATA.md).
 *
 * The store definitions mirror the schema in DATA.md. Tables the later phases
 * fill are declared now so the version number does not have to change for each
 * one — adding a store is a migration, and doing them all at v1 avoids four
 * migrations across Phases 2 to 4.
 */

/** A saved wish plan. Several can exist, e.g. "Skirk C1" and "Save for 7.2". */
export type Plan = {
  id: string;
  name: string;
  /** Character as the banner calendar spells it, or a free-text goal. */
  target: string;
  /** ISO date the plan counts income up to. */
  targetDate: string;
  /** Constellation goal: 0 is C0, 6 is C6. */
  constellation: number;
  primogems: number;
  fates: number;
  pity: number;
  guaranteed: boolean;
  welkinDaysRemaining: number;
  endgameCompletion: number;
  /** Pinned income figure, or null to use the projection. */
  incomeOverride: number | null;
  assumptions: IncomeAssumptions;
  enabled: IncomeToggles;
  createdAt: number;
  updatedAt: number;
};

export type ProfileRow = {
  uid: string;
  data: unknown;
  fetchedAt: number;
  ttl: number;
  updatedAt: number;
};
export type CharacterRow = { uid: string; avatarId: number; data: unknown; updatedAt: number };
export type ArtifactRow = {
  id: string;
  setKey: string;
  slotKey: string;
  location: string;
  data: unknown;
  updatedAt: number;
};
export type WishRow = {
  id: string;
  gachaType: string;
  time: string;
  data: unknown;
  updatedAt: number;
};
/**
 * One timer's stored state.
 *
 * Only `setAt` and `value` are ever written; everything shown is derived from
 * them at read time, so a timer is correct after the app has been closed
 * overnight rather than having drifted (docs/MATH.md section 5).
 */
export type TimerRow = {
  id: string;
  setAt: number;
  value: number;
  /** Per-timer extras: the teapot rate and cap, an expedition's duration. */
  config?: Record<string, number>;
  updatedAt: number;
};
export type SettingRow = { key: string; value: unknown; updatedAt: number };

export class StarfallDb extends Dexie {
  plans!: EntityTable<Plan, 'id'>;
  profile!: EntityTable<ProfileRow, 'uid'>;
  characters!: EntityTable<CharacterRow, 'uid'>;
  artifacts!: EntityTable<ArtifactRow, 'id'>;
  wishes!: EntityTable<WishRow, 'id'>;
  timers!: EntityTable<TimerRow, 'id'>;
  settings!: EntityTable<SettingRow, 'key'>;

  constructor(name = 'starfall') {
    super(name);
    this.version(1).stores({
      profile: 'uid',
      characters: '[uid+avatarId]',
      artifacts: 'id, setKey, slotKey, location',
      wishes: 'id, gachaType, time',
      plans: 'id, updatedAt',
      timers: 'id',
      settings: 'key',
    });
  }
}

export const db = new StarfallDb();
