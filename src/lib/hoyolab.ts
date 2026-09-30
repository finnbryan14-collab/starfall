/**
 * HoYoLAB, behind an explicit opt-in.
 *
 * A HoYoLAB cookie is the difference between a planner you feed and one that
 * feeds itself: `genAuthKeyByCookieToken` mints a wish authkey with no pasting,
 * real-time notes give live resin and timers, and the Traveler's Diary reports
 * primogem income by source instead of by estimate.
 *
 * It is also the broadest credential this app touches. So:
 *
 *  - It is opt-in. Everything that works without it keeps working (DECISIONS).
 *  - Only the cookie names below are kept; the rest of a pasted header is
 *    dropped before anything is stored or sent.
 *  - It lives in IndexedDB on the device. Our proxy forwards it and holds
 *    nothing — but it does pass through the proxy, and the screen says so,
 *    because "never leaves your device" would not be true.
 *
 * Endpoint shapes follow genshin.py, which is the most complete public record
 * of this unofficial API:
 *   https://github.com/thesadru/genshin.py
 *   verifiedAt: 2026-09-29
 */

export const HOYOLAB_HOSTS = {
  /** Battle Chronicle, including real-time notes. */
  record: 'https://sg-public-api.hoyolab.com',
  /** Traveler's Diary. */
  ledger: 'https://sg-hk4e-api.hoyolab.com',
  /** Account binding, which is what mints a wish authkey. */
  account: 'https://api-account-os.hoyoverse.com',
} as const;

/** Cookies the Battle Chronicle needs. */
export const NOTES_COOKIES = ['ltoken_v2', 'ltuid_v2', 'ltmid_v2'] as const;

/** Cookies `genAuthKeyByCookieToken` needs. */
export const AUTHKEY_COOKIES = ['cookie_token_v2', 'account_mid_v2', 'account_id_v2'] as const;

const KEPT = new Set<string>([...NOTES_COOKIES, ...AUTHKEY_COOKIES]);

/**
 * Keeps only the cookies these endpoints actually use.
 *
 * A pasted `document.cookie` carries a lot more than this — session ids,
 * analytics, other HoYoverse products. None of it is needed, so none of it is
 * stored or sent. The filter runs before the first write, not at request time,
 * so the extra values never reach IndexedDB at all.
 */
export function filterCookie(raw: string): string {
  const kept: string[] = [];
  const seen = new Set<string>();

  for (const part of raw.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;

    const name = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (!KEPT.has(name) || !value || seen.has(name)) continue;

    seen.add(name);
    kept.push(`${name}=${value}`);
  }

  return kept.join('; ');
}

function cookieNames(cookie: string): Set<string> {
  return new Set(
    cookie
      .split(';')
      .map((part) => part.split('=')[0]?.trim())
      .filter((name): name is string => Boolean(name)),
  );
}

/** Whether a cookie can read the Battle Chronicle: notes and the diary. */
export function canReadChronicle(cookie: string): boolean {
  const names = cookieNames(cookie);
  return names.has('ltoken_v2') && (names.has('ltuid_v2') || names.has('ltmid_v2'));
}

/** Whether a cookie can mint a wish authkey. */
export function canMintAuthkey(cookie: string): boolean {
  const names = cookieNames(cookie);
  return AUTHKEY_COOKIES.every((name) => names.has(name));
}

/**
 * Which server a UID is on.
 *
 * Re-exported from the engine rather than defined here: the same mapping also
 * decides which clock every reset, banner window and wish timestamp is read
 * against (src/engine/account/server.ts), and two copies of it would be two
 * chances to disagree.
 */
export { serverFromUid as recogniseServer } from '@/engine/account/server';

export type HoyolabAction = 'notes' | 'diary' | 'authkey';

export type HoyolabFailure =
  | 'invalid-cookie'
  | 'rate-limited'
  | 'too-frequent'
  | 'not-public'
  | 'notes-denied'
  | 'no-account'
  | 'unsupported-server'
  | 'network'
  | 'unknown';

/**
 * Plain language for each way this fails, and what to do about it. The player
 * pasted a credential; a bare retcode would be the least helpful possible
 * answer.
 */
export const HOYOLAB_FAILURE_COPY: Record<HoyolabFailure, string> = {
  'invalid-cookie':
    'That cookie has expired or is not valid. Sign in to HoYoLAB again and paste a fresh one.',
  'rate-limited': 'HoYoLAB is rate limiting this cookie. Try again tomorrow.',
  'too-frequent': 'HoYoLAB says that was too soon. Wait a minute and try again.',
  'not-public':
    'Your Battle Chronicle is private. Turn it on in HoYoLAB under Battle Chronicle, then Settings.',
  'notes-denied':
    'Real-Time Notes are switched off. Turn them on in HoYoLAB under Battle Chronicle, then Settings.',
  'no-account': 'That HoYoLAB account has no Genshin account attached to it.',
  'unsupported-server': 'That UID is not on a server this works with.',
  network: 'Could not reach HoYoLAB. Check your connection and try again.',
  unknown: 'HoYoLAB refused that request and did not say why.',
};

/** Retcodes worth naming, from genshin.py's error table. */
export function failureForRetcode(retcode: number): HoyolabFailure {
  switch (retcode) {
    case -100:
    case 10001:
    case 10103:
    case -1071:
      return 'invalid-cookie';
    case 10101:
      return 'rate-limited';
    case -110:
    case 1028:
      return 'too-frequent';
    case 10102:
      return 'not-public';
    case 10104:
      return 'notes-denied';
    case -10002:
    case 1008:
    case 1009:
    case -1073:
      return 'no-account';
    default:
      return 'unknown';
  }
}

export function notesUrl(uid: string, server: string): string {
  const params = new URLSearchParams({ server, role_id: uid });
  return `${HOYOLAB_HOSTS.record}/event/game_record/genshin/api/dailyNote?${params}`;
}

/** `month` is the calendar month number, as the ledger expects it. */
export function diaryUrl(uid: string, server: string, month: number): string {
  const params = new URLSearchParams({
    region: server,
    uid,
    month: String(month),
    lang: 'en-us',
  });
  return `${HOYOLAB_HOSTS.ledger}/event/ysledgeros/month_info?${params}`;
}

export const AUTHKEY_URL = `${HOYOLAB_HOSTS.account}/binding/api/genAuthKeyByCookieToken`;

export type RealTimeNotes = {
  resin: number;
  resinCap: number;
  /** Seconds until resin is full. Zero when it already is. */
  resinRecoverySeconds: number;
  realmCurrency: number;
  realmCurrencyCap: number;
  realmRecoverySeconds: number;
  commissionsDone: number;
  commissionsTotal: number;
  commissionRewardClaimed: boolean;
  weeklyBossDiscountsLeft: number;
  weeklyBossDiscountsTotal: number;
  /** Seconds until the Parametric Transformer is ready, or null if unobtained. */
  transformerSeconds: number | null;
  expeditionsOut: number;
  expeditionsMax: number;
};

const num = (value: unknown, fallback = 0): number => {
  const parsed = typeof value === 'string' ? Number(value) : value;
  return typeof parsed === 'number' && Number.isFinite(parsed) ? parsed : fallback;
};

/**
 * Reads the notes payload, defensively.
 *
 * Fields come and go with game versions — the Archon quest block appeared long
 * after the rest — so a missing one falls back rather than throwing. Returns
 * null only when the payload has none of the shape at all.
 */
export function parseNotes(data: unknown): RealTimeNotes | null {
  if (!data || typeof data !== 'object') return null;
  const raw = data as Record<string, unknown>;
  if (raw.max_resin === undefined && raw.current_resin === undefined) return null;

  const transformer = raw.transformer as
    { obtained?: boolean; recovery_time?: Record<string, unknown> } | undefined;

  let transformerSeconds: number | null = null;
  if (transformer?.obtained && transformer.recovery_time) {
    const t = transformer.recovery_time;
    transformerSeconds =
      num(t.Day) * 86_400 + num(t.Hour) * 3_600 + num(t.Minute) * 60 + num(t.Second);
  }

  return {
    resin: num(raw.current_resin),
    resinCap: num(raw.max_resin),
    resinRecoverySeconds: num(raw.resin_recovery_time),
    realmCurrency: num(raw.current_home_coin),
    realmCurrencyCap: num(raw.max_home_coin),
    realmRecoverySeconds: num(raw.home_coin_recovery_time),
    commissionsDone: num(raw.finished_task_num),
    commissionsTotal: num(raw.total_task_num),
    commissionRewardClaimed: raw.is_extra_task_reward_received === true,
    weeklyBossDiscountsLeft: num(raw.remain_resin_discount_num),
    weeklyBossDiscountsTotal: num(raw.resin_discount_num_limit),
    transformerSeconds,
    expeditionsOut: Array.isArray(raw.expeditions) ? raw.expeditions.length : 0,
    expeditionsMax: num(raw.max_expedition_num),
  };
}

export type DiaryCategory = { name: string; amount: number; percentage: number };

export type DiaryMonth = {
  /** Calendar month the figures cover. */
  month: number;
  primogems: number;
  lastMonthPrimogems: number;
  /** Percentage change on last month, as HoYoLAB reports it. */
  changePercent: number;
  categories: DiaryCategory[];
};

export function parseDiary(data: unknown): DiaryMonth | null {
  if (!data || typeof data !== 'object') return null;
  const raw = data as Record<string, unknown>;
  const monthData = raw.month_data as Record<string, unknown> | undefined;
  if (!monthData) return null;

  const groups = Array.isArray(monthData.group_by) ? monthData.group_by : [];

  return {
    month: num(raw.data_month ?? raw.month),
    primogems: num(monthData.current_primogems),
    lastMonthPrimogems: num(monthData.last_primogems),
    changePercent: num(monthData.primogem_rate),
    categories: groups.map((group) => {
      const entry = group as Record<string, unknown>;
      return {
        name: typeof entry.action === 'string' ? entry.action : 'Other',
        amount: num(entry.num),
        percentage: num(entry.percent),
      };
    }),
  };
}
