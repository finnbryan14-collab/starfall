import 'fake-indexeddb/auto';

import { afterEach, describe, expect, it } from 'vitest';

import { DEFAULT_ASSUMPTIONS } from '@/engine/income';

import {
  DEFAULT_TOGGLES,
  createPlan,
  deletePlan,
  getPlan,
  listPlans,
  loadOrCreateActivePlan,
  makePlan,
  savePlan,
} from './plans';
import { StarfallDb, db } from './schema';

afterEach(async () => {
  await db.plans.clear();
});

describe('makePlan', () => {
  it('starts from the researched assumptions', () => {
    const plan = makePlan();
    expect(plan.assumptions).toEqual(DEFAULT_ASSUMPTIONS);
    expect(plan.enabled).toEqual(DEFAULT_TOGGLES);
  });

  it('leaves paid sources off by default', () => {
    // Welkin and the Battle Pass cost money. Counting them by default would
    // quietly overstate a free player's odds.
    expect(DEFAULT_TOGGLES.welkin).toBe(false);
    expect(DEFAULT_TOGGLES.battlePass).toBe(false);
  });

  it('gives every plan a distinct id', () => {
    const ids = new Set(Array.from({ length: 200 }, () => makePlan().id));
    expect(ids.size).toBe(200);
  });

  it('copies the assumptions rather than sharing them', () => {
    const a = makePlan();
    const b = makePlan();
    a.assumptions.eventsPerPatch = 1;
    expect(b.assumptions.eventsPerPatch).toBe(DEFAULT_ASSUMPTIONS.eventsPerPatch);
    expect(DEFAULT_ASSUMPTIONS.eventsPerPatch).not.toBe(1);
  });
});

describe('persistence', () => {
  it('round-trips a plan', async () => {
    const created = await createPlan({ name: 'Skirk C1', target: 'Skirk', primogems: 11_200 });
    const loaded = await getPlan(created.id);
    expect(loaded).toEqual(created);
  });

  /** The condition ROADMAP names: the screen survives a reload. */
  it('survives a reload — a fresh Dexie instance sees the same data', async () => {
    const created = await createPlan({ name: 'Skirk C1', primogems: 11_200, pity: 22 });
    await db.close();

    // A new connection to the same database is what a page reload produces.
    const reopened = new StarfallDb();
    const loaded = await reopened.plans.get(created.id);
    expect(loaded?.name).toBe('Skirk C1');
    expect(loaded?.primogems).toBe(11_200);
    expect(loaded?.pity).toBe(22);
    await reopened.close();

    await db.open();
  });

  it('holds several plans at once', async () => {
    await createPlan({ name: 'Skirk C1' });
    await createPlan({ name: 'Save for 7.2' });
    const plans = await listPlans();
    expect(plans.map((p) => p.name).sort()).toEqual(['Save for 7.2', 'Skirk C1']);
  });

  it('lists the most recently updated plan first', async () => {
    const first = await createPlan({ name: 'older' });
    await createPlan({ name: 'newer' });

    // Both creates can land on the same millisecond, so wait for the clock to
    // move before touching the older plan. Without this the test is asserting
    // a tiebreak, not recency.
    await new Promise((resolve) => setTimeout(resolve, 2));
    await savePlan({ ...first, primogems: 500 });

    const plans = await listPlans();
    expect(plans[0].name).toBe('older');
  });

  it('orders ties deterministically rather than arbitrarily', async () => {
    // Same updatedAt on every plan: the order must still be stable, or the
    // plan that opens on load could change between reloads.
    const stamp = Date.now();
    for (const name of ['a', 'b', 'c']) {
      const plan = makePlan({ name });
      await db.plans.put({ ...plan, createdAt: stamp, updatedAt: stamp });
    }

    const first = (await listPlans()).map((p) => p.id);
    const second = (await listPlans()).map((p) => p.id);
    expect(first).toEqual(second);
    expect(first).toEqual([...first].sort((a, b) => a.localeCompare(b)));
  });

  it('stamps updatedAt on every save', async () => {
    const plan = await createPlan({ name: 'Skirk C1' });
    const before = plan.updatedAt;
    await new Promise((resolve) => setTimeout(resolve, 2));

    const saved = await savePlan({ ...plan, primogems: 999 });
    expect(saved.updatedAt).toBeGreaterThan(before);
    expect((await getPlan(plan.id))?.primogems).toBe(999);
  });

  it('deletes a plan', async () => {
    const plan = await createPlan({ name: 'scratch' });
    await deletePlan(plan.id);
    expect(await getPlan(plan.id)).toBeUndefined();
    expect(await listPlans()).toEqual([]);
  });

  it('creates a plan on first run rather than returning nothing', async () => {
    expect(await listPlans()).toEqual([]);
    const plan = await loadOrCreateActivePlan({ name: 'First' });
    expect(plan.name).toBe('First');
    expect(await listPlans()).toHaveLength(1);
  });

  it('reuses the existing plan on later runs rather than piling up new ones', async () => {
    const first = await loadOrCreateActivePlan({ name: 'First' });
    const second = await loadOrCreateActivePlan({ name: 'Should not be used' });
    expect(second.id).toBe(first.id);
    expect(await listPlans()).toHaveLength(1);
  });

  it('keeps nested assumptions intact through storage', async () => {
    const plan = await createPlan({
      assumptions: { ...DEFAULT_ASSUMPTIONS, eventsPerPatch: 4_321 },
      enabled: { ...DEFAULT_TOGGLES, welkin: true },
    });
    const loaded = await getPlan(plan.id);
    expect(loaded?.assumptions.eventsPerPatch).toBe(4_321);
    expect(loaded?.enabled.welkin).toBe(true);
  });
});
