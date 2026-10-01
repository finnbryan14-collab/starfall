/**
 * Whether the browser has promised to keep what Starfall stores.
 *
 * Everything the app knows lives in IndexedDB, and by default that storage is
 * *best-effort*: the browser may delete it to free space, and WebKit will also
 * evict an origin the player has not visited for a while. An origin can opt out
 * of that, and then the data "is only evicted, or deleted, if the user chooses
 * to, by using their browser's settings".
 *
 *   source: https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria
 *   source: https://webkit.org/blog/14403/updates-to-storage-policy/
 *   source: https://web.dev/articles/persistent-storage
 *   verifiedAt: 2026-10-01
 *
 * ## Why there are two ways to ask
 *
 * The browsers disagree about whether asking is visible to the player:
 *
 * - **Firefox** shows a permission popup.
 * - **Safari and the Chromium browsers** decide silently and never prompt.
 *   Chrome grants it when a site is "important" — site engagement, "installed
 *   or bookmarked", notification permission. WebKit's heuristics include
 *   "whether the website is opened as a Home Screen Web App", which is why
 *   installing Starfall is the thing that actually fixes this on an iPhone.
 *
 * A popup nobody asked for, appearing because a page loaded, is how a site gets
 * dismissed — and web.dev says plainly not to ask on page load for that reason.
 * So `requestPersistenceQuietly` only asks where it is certain to be silent,
 * and `requestPersistence` — the one that can raise a popup — runs only from a
 * button the player pressed.
 */

export type PersistenceState =
  /** No storage manager, or it refused to answer. Private browsing does this. */
  | { kind: 'unsupported' }
  /** Opted in: the browser will not evict this origin on its own. */
  | { kind: 'persistent' }
  /** The default. Stored, but the browser may clear it to free space. */
  | { kind: 'best-effort' };

type StorageManagerLike = {
  persisted?: () => Promise<boolean>;
  persist?: () => Promise<boolean>;
  estimate?: () => Promise<{ usage?: number; quota?: number }>;
};

function manager(): StorageManagerLike | null {
  if (typeof navigator === 'undefined') return null;
  const storage = (navigator as Navigator & { storage?: StorageManagerLike }).storage;
  return storage ?? null;
}

/** Where things currently stand, without asking for anything. */
export async function readPersistence(): Promise<PersistenceState> {
  const storage = manager();
  if (!storage?.persisted) return { kind: 'unsupported' };

  try {
    return (await storage.persisted()) ? { kind: 'persistent' } : { kind: 'best-effort' };
  } catch {
    // Safari's private browsing throws instead of answering, and a screen
    // asking a question should not be able to crash on the answer.
    return { kind: 'unsupported' };
  }
}

/**
 * Asks the browser to make this origin's storage permanent.
 *
 * May show the player a permission popup in Firefox, so this belongs behind
 * something they pressed. A refusal is an answer, not a failure.
 */
export async function requestPersistence(): Promise<PersistenceState> {
  const storage = manager();
  if (!storage?.persist) return readPersistence();

  const current = await readPersistence();
  if (current.kind !== 'best-effort') return current;

  try {
    return (await storage.persist()) ? { kind: 'persistent' } : { kind: 'best-effort' };
  } catch {
    return { kind: 'unsupported' };
  }
}

/**
 * The same request, but only where it cannot produce a popup.
 *
 * Three ways that is known to be true: the permission is already granted, the
 * browser has no opinion to query (so it is not one that prompts), or the query
 * itself is unsupported — which is Safari, and Safari decides silently.
 *
 * A `prompt` or `denied` answer means Firefox would show its popup, so this
 * leaves it alone and the Account screen offers a button instead.
 */
export async function requestPersistenceQuietly(): Promise<PersistenceState> {
  const current = await readPersistence();
  if (current.kind !== 'best-effort') return current;

  const permissions = (
    navigator as Navigator & {
      permissions?: { query: (descriptor: { name: string }) => Promise<{ state: string }> };
    }
  ).permissions;

  if (permissions?.query) {
    try {
      const status = await permissions.query({ name: 'persistent-storage' });
      if (status.state !== 'granted') return current;
    } catch {
      // A browser that cannot answer this query is not one that prompts.
    }
  }

  return requestPersistence();
}

/** How much is stored and how much is allowed, when the browser will say. */
export async function storageUsage(): Promise<{ usage: number; quota: number } | null> {
  const storage = manager();
  if (!storage?.estimate) return null;

  try {
    const estimate = await storage.estimate();
    if (typeof estimate.usage !== 'number' || typeof estimate.quota !== 'number') return null;
    return { usage: estimate.usage, quota: estimate.quota };
  } catch {
    return null;
  }
}

export type PersistenceAdvice = {
  /** Where things stand, in one line. */
  headline: string;
  /** What the player can do about it, or null when there is nothing to do. */
  action: string | null;
  /** Whether offering to ask the browser is worth a button. */
  canAsk: boolean;
};

/**
 * What to tell the player, given what the browser said.
 *
 * Driven by observed state rather than by sniffing the user agent: a refusal
 * from inside a browser tab is worth answering with "install it", because that
 * is WebKit's own heuristic, while a refusal from an installed app has no
 * remaining lever and the honest answer is the backup file.
 */
export function persistenceAdvice({
  state,
  standalone,
  asked,
}: {
  state: PersistenceState;
  /** Running as an installed app rather than in a browser tab. */
  standalone: boolean;
  /** Whether the browser has already been asked this session. */
  asked: boolean;
}): PersistenceAdvice {
  if (state.kind === 'persistent') {
    return {
      headline: 'Your data is marked permanent. This browser will only delete it if you ask it to.',
      action: null,
      canAsk: false,
    };
  }

  if (state.kind === 'unsupported') {
    return {
      headline: 'This browser will not say whether it intends to keep your data.',
      action: 'Export a backup now and again, and it will not matter.',
      canAsk: false,
    };
  }

  if (!asked) {
    return {
      headline: 'Your data is stored, but the browser is allowed to clear it to free space.',
      action: null,
      canAsk: true,
    };
  }

  /*
    A refusal is re-evaluated later against the same heuristics, so this is not
    final — but asking again in the same breath cannot change the answer, and
    web.dev says not to. What *can* change it is installing the app: that is
    WebKit's own heuristic and one of Chrome's three.
  */
  return {
    headline: 'This browser turned the request down, so your data is still clearable.',
    action: standalone
      ? 'Export a backup now and again, and it will not matter.'
      : 'Adding Starfall to your Home Screen, or bookmarking it, is what tends to change a browser’s mind — and a backup covers you either way.',
    canAsk: false,
  };
}

/** Running as an installed app rather than in a browser tab. */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.matchMedia?.('(display-mode: standalone)').matches) return true;
  // iOS Safari predates display-mode and still reports it this way.
  return (navigator as Navigator & { standalone?: boolean }).standalone === true;
}
