import { describe, expect, it } from 'vitest';

import {
  AUTHKEY_COOKIES,
  canMintAuthkey,
  canReadChronicle,
  diaryUrl,
  failureForRetcode,
  filterCookie,
  HOYOLAB_FAILURE_COPY,
  notesUrl,
  parseDiary,
  parseNotes,
} from './hoyolab';

/** A realistic paste: the cookies we want, buried in ones we do not. */
const PASTED =
  '_ga=GA1.1.9999; ltoken_v2=FAKE_LTOKEN; mi18nLang=en-us; ltuid_v2=123456789; ' +
  'cookie_token_v2=FAKE_TOKEN; account_mid_v2=FAKE_MID; account_id_v2=123456789; ' +
  '_gcl_au=1.1.1.1; DEVICEFP=deadbeef';

describe('filterCookie', () => {
  it('keeps only the cookies these endpoints use', () => {
    const filtered = filterCookie(PASTED);

    expect(filtered).toContain('ltoken_v2=FAKE_LTOKEN');
    expect(filtered).toContain('account_id_v2=123456789');
    // Everything else in the paste is someone else's business.
    expect(filtered).not.toContain('_ga');
    expect(filtered).not.toContain('mi18nLang');
    expect(filtered).not.toContain('DEVICEFP');
  });

  it('drops empty values rather than sending a blank cookie', () => {
    expect(filterCookie('ltoken_v2=; ltuid_v2=123456789')).toBe('ltuid_v2=123456789');
  });

  it('keeps the first of a repeated name', () => {
    expect(filterCookie('ltuid_v2=first; ltuid_v2=second')).toBe('ltuid_v2=first');
  });

  it('is empty for a paste with nothing useful in it', () => {
    expect(filterCookie('_ga=GA1.1; nonsense')).toBe('');
    expect(filterCookie('')).toBe('');
  });
});

describe('capability checks', () => {
  it('reads the Chronicle with an ltoken and either id', () => {
    expect(canReadChronicle('ltoken_v2=a; ltuid_v2=1')).toBe(true);
    expect(canReadChronicle('ltoken_v2=a; ltmid_v2=m')).toBe(true);
    expect(canReadChronicle('ltoken_v2=a')).toBe(false);
    expect(canReadChronicle('ltuid_v2=1')).toBe(false);
  });

  it('mints an authkey only with the full account set', () => {
    expect(canMintAuthkey(filterCookie(PASTED))).toBe(true);
    // Chronicle cookies alone are not enough, which is worth telling the
    // player before they press a button that cannot work.
    expect(canMintAuthkey('ltoken_v2=a; ltuid_v2=1')).toBe(false);

    for (const missing of AUTHKEY_COOKIES) {
      const partial = AUTHKEY_COOKIES.filter((name) => name !== missing)
        .map((name) => `${name}=x`)
        .join('; ');
      expect(canMintAuthkey(partial), `without ${missing}`).toBe(false);
    }
  });
});

describe('failureForRetcode', () => {
  it('names the failures worth acting on', () => {
    expect(failureForRetcode(-100)).toBe('invalid-cookie');
    expect(failureForRetcode(10001)).toBe('invalid-cookie');
    expect(failureForRetcode(10101)).toBe('rate-limited');
    expect(failureForRetcode(10102)).toBe('not-public');
    expect(failureForRetcode(10104)).toBe('notes-denied');
    expect(failureForRetcode(-10002)).toBe('no-account');
    expect(failureForRetcode(-110)).toBe('too-frequent');
    expect(failureForRetcode(99999)).toBe('unknown');
  });

  it('has copy for every failure, saying what to do next', () => {
    for (const [failure, copy] of Object.entries(HOYOLAB_FAILURE_COPY)) {
      expect(copy.length, failure).toBeGreaterThan(20);
      expect(copy, failure).toMatch(/\.$/);
    }
  });
});

describe('urls', () => {
  it('builds the real-time notes url', () => {
    const url = new URL(notesUrl('600000000', 'os_usa'));
    expect(url.host).toBe('sg-public-api.hoyolab.com');
    expect(url.pathname).toBe('/event/game_record/genshin/api/dailyNote');
    expect(url.searchParams.get('role_id')).toBe('600000000');
    expect(url.searchParams.get('server')).toBe('os_usa');
  });

  it('builds the diary url', () => {
    const url = new URL(diaryUrl('600000000', 'os_usa', 9));
    expect(url.host).toBe('sg-hk4e-api.hoyolab.com');
    expect(url.pathname).toBe('/event/ysledgeros/month_info');
    expect(url.searchParams.get('uid')).toBe('600000000');
    expect(url.searchParams.get('region')).toBe('os_usa');
    expect(url.searchParams.get('month')).toBe('9');
  });
});

describe('parseNotes', () => {
  const payload = {
    current_resin: 84,
    max_resin: 200,
    resin_recovery_time: '55680',
    current_home_coin: 1200,
    max_home_coin: 2400,
    home_coin_recovery_time: '43200',
    finished_task_num: 4,
    total_task_num: 4,
    is_extra_task_reward_received: false,
    remain_resin_discount_num: 2,
    resin_discount_num_limit: 3,
    transformer: {
      obtained: true,
      recovery_time: { Day: 2, Hour: 3, Minute: 4, Second: 5, reached: false },
    },
    expeditions: [{}, {}, {}],
    max_expedition_num: 5,
  };

  it('reads the fields the timers screen needs', () => {
    const notes = parseNotes(payload)!;

    expect(notes.resin).toBe(84);
    expect(notes.resinCap).toBe(200);
    // The API sends recovery times as strings.
    expect(notes.resinRecoverySeconds).toBe(55_680);
    expect(notes.commissionsDone).toBe(4);
    expect(notes.weeklyBossDiscountsLeft).toBe(2);
    expect(notes.expeditionsOut).toBe(3);
  });

  it('flattens the transformer countdown into seconds', () => {
    const notes = parseNotes(payload)!;
    expect(notes.transformerSeconds).toBe(2 * 86_400 + 3 * 3_600 + 4 * 60 + 5);
  });

  it('has no transformer countdown when the gadget is not owned', () => {
    const notes = parseNotes({ ...payload, transformer: { obtained: false } })!;
    expect(notes.transformerSeconds).toBeNull();
  });

  it('falls back rather than throwing on a field that has gone', () => {
    // Fields come and go between game versions; one missing must not take the
    // whole screen down.
    const notes = parseNotes({ current_resin: 10, max_resin: 200 })!;
    expect(notes.resin).toBe(10);
    expect(notes.expeditionsOut).toBe(0);
    expect(notes.transformerSeconds).toBeNull();
  });

  it('is null for a payload of the wrong shape entirely', () => {
    expect(parseNotes(null)).toBeNull();
    expect(parseNotes({ retcode: -100 })).toBeNull();
    expect(parseNotes('nope')).toBeNull();
  });
});

describe('parseDiary', () => {
  const payload = {
    data_month: 9,
    month_data: {
      current_primogems: 4_320,
      last_primogems: 3_900,
      primogem_rate: 10,
      group_by: [
        { action_id: 0, action: 'Mail', num: 600, percent: 14 },
        { action_id: 1, action: 'Events', num: 2_400, percent: 56 },
        { action_id: 2, action: 'Daily Activity', num: 1_320, percent: 30 },
      ],
    },
  };

  it('reads the month total and the split by source', () => {
    const diary = parseDiary(payload)!;

    expect(diary.month).toBe(9);
    expect(diary.primogems).toBe(4_320);
    expect(diary.lastMonthPrimogems).toBe(3_900);
    expect(diary.categories).toHaveLength(3);
    expect(diary.categories[1]).toEqual({ name: 'Events', amount: 2_400, percentage: 56 });
  });

  it('copes with no breakdown at all', () => {
    const diary = parseDiary({ data_month: 9, month_data: { current_primogems: 0 } })!;
    expect(diary.categories).toEqual([]);
    expect(diary.primogems).toBe(0);
  });

  it('is null when there is no month data', () => {
    expect(parseDiary({ retcode: 0 })).toBeNull();
    expect(parseDiary(null)).toBeNull();
  });
});
