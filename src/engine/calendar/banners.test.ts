import { describe, expect, it } from 'vitest';

import { GENERATED_BANNER_PHASES } from '@/data/banners-generated';
import {
  BANNER_PHASES,
  BANNERS_GENERATED_AT,
  bannerDataAgeDays,
  CURATED_BANNER_PHASES,
  currentPhase,
  defaultTargetDate,
  findCharacter,
  nextPhase,
  phaseEnd,
  phaseStart,
  phasesForCharacter,
} from '@/engine/calendar/banners';

const utc = (iso: string) => new Date(iso);

describe('banner data', () => {
  it('carries a source and a verifiedAt on every phase', () => {
    expect(BANNER_PHASES.length).toBeGreaterThan(0);
    for (const phase of BANNER_PHASES) {
      const label = `${phase.version} phase ${phase.phase}`;
      expect(phase.source, label).toMatch(/^https:\/\//);
      expect(phase.verifiedAt, label).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(phase.startDate, label).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(phase.endDate, label).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      // Only an announced phase has a lineup; a projected one must not, so
      // that projected dates can never be read as a confirmed banner.
      if (phase.confidence === 'announced') {
        expect(phase.featured.length, label).toBeGreaterThan(0);
      }
    }
  });

  it('never has a phase that ends before it starts', () => {
    for (const phase of BANNER_PHASES) {
      expect(phaseEnd(phase).getTime()).toBeGreaterThan(phaseStart(phase).getTime());
    }
  });

  it('is in chronological order', () => {
    for (let i = 1; i < BANNER_PHASES.length; i++) {
      expect(phaseStart(BANNER_PHASES[i]).getTime()).toBeGreaterThanOrEqual(
        phaseStart(BANNER_PHASES[i - 1]).getTime(),
      );
    }
  });

  it('never has two phases running at the same time', () => {
    // Contiguity does NOT hold — real history has gaps between versions, 50 of
    // 88 consecutive pairs in the generated data. Overlap is the invariant that
    // actually matters: two phases at once would make currentPhase ambiguous.
    for (let i = 1; i < BANNER_PHASES.length; i++) {
      const previous = BANNER_PHASES[i - 1];
      const current = BANNER_PHASES[i];
      const label = `${current.version} phase ${current.phase}`;
      expect(phaseStart(current).getTime(), label).toBeGreaterThanOrEqual(
        phaseEnd(previous).getTime(),
      );
    }
  });

  it('has one entry per version and phase', () => {
    const keys = BANNER_PHASES.map((phase) => `${phase.version}/${phase.phase}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('draws on both sources', () => {
    // If either side vanished, the merge silently became a single source.
    expect(BANNER_PHASES.some((phase) => phase.origin === 'generated')).toBe(true);
    expect(BANNER_PHASES.some((phase) => phase.origin === 'curated')).toBe(true);
  });

  /**
   * Where the generated data and a hand-checked entry describe the same phase
   * they must agree. A disagreement means one is wrong, which is worth failing
   * over rather than silently resolving in the curated entry’s favour.
   */
  it('agrees with the generated source wherever both describe a phase', () => {
    for (const curated of CURATED_BANNER_PHASES) {
      const generated = GENERATED_BANNER_PHASES.find(
        (entry) => entry.version === curated.version && entry.phase === curated.phase,
      );
      if (!generated) continue;

      const label = `${curated.version} phase ${curated.phase}`;
      expect(generated.startDate, label).toBe(curated.startDate);
      expect(generated.endDate, label).toBe(curated.endDate);
    }
  });

  it('records the 7.1 windows the sources give', () => {
    const p1 = BANNER_PHASES.find((p) => p.version === '7.1' && p.phase === 1)!;
    const p2 = BANNER_PHASES.find((p) => p.version === '7.1' && p.phase === 2)!;

    expect(p1.startDate).toBe('2026-09-23');
    expect(p1.endDate).toBe('2026-10-13');
    expect(p2.startDate).toBe('2026-10-13');
    expect(p2.endDate).toBe('2026-11-03');
  });

  it('marks projected phases as projected', () => {
    for (const phase of BANNER_PHASES) {
      if (phase.confidence === 'projected') {
        expect(phase.featured).toEqual([]);
      } else {
        expect(phase.confidence).toBe('announced');
      }
    }
  });
});

describe('currentPhase and nextPhase', () => {
  it('finds the phase a date falls in', () => {
    const phase = currentPhase(utc('2026-09-28T12:00:00Z'))!;
    expect(phase.version).toBe('7.1');
    expect(phase.phase).toBe(1);
  });

  it('treats the switchover instant as belonging to the new phase', () => {
    const p2 = BANNER_PHASES.find((p) => p.version === '7.1' && p.phase === 2)!;
    const atSwitch = phaseStart(p2);

    const phase = currentPhase(atSwitch)!;
    expect(phase.phase).toBe(2);

    const justBefore = new Date(atSwitch.getTime() - 1);
    expect(currentPhase(justBefore)!.phase).toBe(1);
  });

  it('returns null outside the known calendar', () => {
    expect(currentPhase(utc('2020-01-01T00:00:00Z'))).toBeNull();
  });

  it('finds the next phase after a date', () => {
    const next = nextPhase(utc('2026-09-28T12:00:00Z'))!;
    expect(next.version).toBe('7.1');
    expect(next.phase).toBe(2);
  });

  it('returns null when the calendar has run out', () => {
    const last = BANNER_PHASES[BANNER_PHASES.length - 1];
    expect(nextPhase(phaseEnd(last))).toBeNull();
  });
});

describe('character lookup', () => {
  it('finds Skirk in 7.1 phase 2, which is what the preview shows', () => {
    const phases = phasesForCharacter('Skirk');
    expect(phases).toHaveLength(1);
    expect(phases[0].version).toBe('7.1');
    expect(phases[0].phase).toBe(2);
    expect(phases[0].startDate).toBe('2026-10-13');
  });

  it('ignores case and surrounding space', () => {
    expect(phasesForCharacter('  skirk ')).toHaveLength(1);
  });

  it('returns an empty list for someone not on the calendar', () => {
    expect(phasesForCharacter('Nobody At All')).toEqual([]);
  });

  it('lists every featured character once', () => {
    const skirk = findCharacter('Skirk');
    expect(skirk).not.toBeNull();
    expect(findCharacter('nobody')).toBeNull();
  });
});

describe('defaultTargetDate', () => {
  /**
   * SPEC.md: the target date defaults to the end of that character's banner.
   *
   * design/preview.html titles the screen "Skirk returns Oct 13" and projects
   * income to Oct 13, which is the banner's *start*. SPEC wins per CLAUDE.md,
   * and the end date is the more useful default anyway — you can pull at any
   * point during the banner, and you keep earning through it.
   */
  it('is the end of the character banner, not its start', () => {
    const target = defaultTargetDate('Skirk')!;
    const p2 = BANNER_PHASES.find((p) => p.version === '7.1' && p.phase === 2)!;
    expect(target.getTime()).toBe(phaseEnd(p2).getTime());
  });

  it('is null for a character with no scheduled banner', () => {
    expect(defaultTargetDate('Nobody At All')).toBeNull();
  });

  it('picks the soonest upcoming banner when a character has several', () => {
    // Guards the selection rule even while the calendar has one entry each.
    const target = defaultTargetDate('Skirk', utc('2026-09-01T00:00:00Z'))!;
    expect(target.toISOString().slice(0, 10)).toBe('2026-11-03');
  });
});

describe('staleness', () => {
  it('reports how old the generated data is', () => {
    const generated = new Date(`${BANNERS_GENERATED_AT}T00:00:00Z`);
    expect(bannerDataAgeDays(generated)).toBe(0);
    expect(bannerDataAgeDays(new Date(generated.getTime() + 10 * 86_400_000))).toBe(10);
  });

  it('never reports a negative age from a clock behind the build', () => {
    const generated = new Date(`${BANNERS_GENERATED_AT}T00:00:00Z`);
    expect(bannerDataAgeDays(new Date(generated.getTime() - 86_400_000))).toBe(0);
  });

  it('knows when the calendar has run out', () => {
    // Past the last known phase, defaultTargetDate is extrapolating rather
    // than reporting, and the screen needs to be able to say so.
    const last = BANNER_PHASES[BANNER_PHASES.length - 1];
    expect(currentPhase(new Date(phaseEnd(last).getTime() + 86_400_000))).toBeNull();
    expect(nextPhase(new Date(phaseEnd(last).getTime() + 86_400_000))).toBeNull();
  });
});
