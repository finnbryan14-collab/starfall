import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  persistenceAdvice,
  readPersistence,
  requestPersistence,
  requestPersistenceQuietly,
  storageUsage,
  type PersistenceState,
} from './persistence';

/**
 * docs/DATA.md, storage schema.
 *
 * The behaviour that matters: Firefox shows the player a permission popup when
 * a site asks for persistent storage, and Safari and Chromium decide silently.
 * So the quiet path must never be able to produce a popup, and the loud one
 * only ever runs from something the player pressed.
 *
 *   https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria
 *   https://webkit.org/blog/14403/updates-to-storage-policy/
 */

type Stub = {
  persisted?: () => Promise<boolean>;
  persist?: () => Promise<boolean>;
  estimate?: () => Promise<{ usage?: number; quota?: number }>;
};

function stubStorage(storage: Stub | undefined, permission?: string | Error) {
  const navigatorStub: Record<string, unknown> = {};
  if (storage) navigatorStub.storage = storage;
  if (permission !== undefined) {
    navigatorStub.permissions = {
      query: vi.fn(async () => {
        if (permission instanceof Error) throw permission;
        return { state: permission };
      }),
    };
  }
  vi.stubGlobal('navigator', navigatorStub);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('readPersistence', () => {
  it('says so when the browser has no storage manager at all', async () => {
    stubStorage(undefined);
    await expect(readPersistence()).resolves.toEqual({ kind: 'unsupported' });
  });

  it('reads an origin that is already persistent', async () => {
    stubStorage({ persisted: async () => true });
    await expect(readPersistence()).resolves.toEqual({ kind: 'persistent' });
  });

  it('reads an origin on the default best-effort footing', async () => {
    stubStorage({ persisted: async () => false, persist: async () => true });
    await expect(readPersistence()).resolves.toEqual({ kind: 'best-effort' });
  });

  /**
   * Safari's private browsing throws rather than returning false, and a throw
   * here would take down whatever screen asked.
   */
  it('treats a throw as unsupported rather than propagating it', async () => {
    stubStorage({
      persisted: async () => {
        throw new TypeError('no storage shelf');
      },
    });

    await expect(readPersistence()).resolves.toEqual({ kind: 'unsupported' });
  });
});

describe('requestPersistence', () => {
  it('asks, and reports what the browser decided', async () => {
    const persist = vi.fn(async () => true);
    stubStorage({ persisted: async () => false, persist });

    await expect(requestPersistence()).resolves.toEqual({ kind: 'persistent' });
    expect(persist).toHaveBeenCalledOnce();
  });

  it('reports a refusal as a refusal rather than an error', async () => {
    stubStorage({ persisted: async () => false, persist: async () => false });
    await expect(requestPersistence()).resolves.toEqual({ kind: 'best-effort' });
  });

  it('does not ask again when the answer is already yes', async () => {
    const persist = vi.fn(async () => true);
    stubStorage({ persisted: async () => true, persist });

    await expect(requestPersistence()).resolves.toEqual({ kind: 'persistent' });
    expect(persist).not.toHaveBeenCalled();
  });
});

describe('requestPersistenceQuietly', () => {
  /**
   * The whole point of the quiet path. Firefox pops a permission request on
   * `persist()`, and one appearing on its own — triggered by nothing the player
   * did — is exactly the kind of thing that gets a site dismissed.
   */
  it('does not ask when the browser would prompt', async () => {
    const persist = vi.fn(async () => true);
    stubStorage({ persisted: async () => false, persist }, 'prompt');

    await expect(requestPersistenceQuietly()).resolves.toEqual({ kind: 'best-effort' });
    expect(persist).not.toHaveBeenCalled();
  });

  it('asks when the permission is already granted, because that is silent', async () => {
    const persist = vi.fn(async () => true);
    stubStorage({ persisted: async () => false, persist }, 'granted');

    await expect(requestPersistenceQuietly()).resolves.toEqual({ kind: 'persistent' });
    expect(persist).toHaveBeenCalledOnce();
  });

  it('does not ask when the permission was already refused', async () => {
    const persist = vi.fn(async () => true);
    stubStorage({ persisted: async () => false, persist }, 'denied');

    await expect(requestPersistenceQuietly()).resolves.toEqual({ kind: 'best-effort' });
    expect(persist).not.toHaveBeenCalled();
  });

  /**
   * Safari does not answer this query, and Safari does not prompt either — it
   * decides on its own heuristics, one of which is whether the app was opened
   * from the Home Screen. So an unanswerable query means asking is safe.
   */
  it('asks when the browser cannot say, since those browsers do not prompt', async () => {
    const persist = vi.fn(async () => true);
    stubStorage({ persisted: async () => false, persist }, new TypeError('unknown name'));

    await expect(requestPersistenceQuietly()).resolves.toEqual({ kind: 'persistent' });
    expect(persist).toHaveBeenCalledOnce();
  });

  it('asks when there is no permissions API to consult', async () => {
    const persist = vi.fn(async () => true);
    stubStorage({ persisted: async () => false, persist });

    await expect(requestPersistenceQuietly()).resolves.toEqual({ kind: 'persistent' });
    expect(persist).toHaveBeenCalledOnce();
  });
});

describe('storageUsage', () => {
  it('reads what the browser is willing to say', async () => {
    stubStorage({
      persisted: async () => false,
      estimate: async () => ({ usage: 12, quota: 100 }),
    });
    await expect(storageUsage()).resolves.toEqual({ usage: 12, quota: 100 });
  });

  it('is null when the browser will not say', async () => {
    stubStorage({ persisted: async () => false });
    await expect(storageUsage()).resolves.toBeNull();
  });

  it('is null rather than a guess when a figure is missing', async () => {
    stubStorage({ persisted: async () => false, estimate: async () => ({ usage: 12 }) });
    await expect(storageUsage()).resolves.toBeNull();
  });
});

describe('persistenceAdvice', () => {
  const advice = (state: PersistenceState, standalone = false, asked = false) =>
    persistenceAdvice({ state, standalone, asked });

  it('has nothing to ask for once storage is permanent', () => {
    const result = advice({ kind: 'persistent' });

    expect(result.canAsk).toBe(false);
    expect(result.headline).toMatch(/only delete it if you ask/i);
    expect(result.action).toBeNull();
  });

  it('offers to ask when the browser has not been asked yet', () => {
    const result = advice({ kind: 'best-effort' });

    expect(result.canAsk).toBe(true);
    expect(result.headline).toMatch(/allowed to clear it/i);
  });

  /**
   * WebKit grants persistence "based on heuristics like whether the website is
   * opened as a Home Screen Web App", so on a phone the install is the thing
   * that actually fixes it — not pressing the button again.
   */
  it('points at installing when a refusal came from a browser tab', () => {
    const result = advice({ kind: 'best-effort' }, false, true);

    expect(result.canAsk).toBe(false);
    expect(result.action).toMatch(/home screen/i);
  });

  it('points at backups when a refusal came from an installed app', () => {
    const result = advice({ kind: 'best-effort' }, true, true);

    expect(result.canAsk).toBe(false);
    expect(result.action).toMatch(/backup/i);
    expect(result.action).not.toMatch(/home screen/i);
  });

  it('falls back to backups when the browser will not discuss it', () => {
    const result = advice({ kind: 'unsupported' });

    expect(result.canAsk).toBe(false);
    expect(result.action).toMatch(/backup/i);
  });

  it('never promises more than the browser has agreed to', () => {
    for (const state of [{ kind: 'unsupported' } as const, { kind: 'best-effort' } as const]) {
      expect(persistenceAdvice({ state, standalone: true, asked: true }).headline).not.toMatch(
        /permanent|will not delete/i,
      );
    }
  });
});
