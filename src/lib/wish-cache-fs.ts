'use client';

import { db } from '@/db/schema';

import {
  CACHE_FILE_PATH,
  decodeCache,
  findWishUrl,
  newestCacheVersion,
  type CachedWishUrl,
} from './wish-cache';

/**
 * Reading the wish URL from a folder the player hands over, once.
 *
 * Every other wish tracker asks you to run a PowerShell script and paste a URL,
 * every single time, because an authkey lasts about a day. The File System
 * Access API lets the browser hold a handle to one folder you chose, so after
 * a single grant Starfall can fetch a fresh key itself.
 *
 * We ask for the **webCaches** folder rather than the cache file. The game
 * makes a new version folder on some updates, which is why the community
 * scripts break every patch — a directory handle re-resolves the newest child
 * and keeps working.
 *
 * Chromium desktop only. Everything here degrades to the paste flow elsewhere.
 */

const HANDLE_KEY = 'wish-cache-handle';

export type CacheReadFailure =
  | 'unsupported'
  | 'no-handle'
  | 'permission-denied'
  | 'not-webcaches'
  | 'no-cache-file'
  | 'locked'
  | 'no-url';

export type CacheReadResult =
  { ok: true; wish: CachedWishUrl } | { ok: false; reason: CacheReadFailure };

/** Chromium desktop only; Firefox, Safari and mobile have no picker. */
export function isFileSystemAccessSupported(): boolean {
  return typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function';
}

/** Opens the folder picker. Must be called from a user gesture. */
export async function pickWebCachesFolder(): Promise<FileSystemDirectoryHandle | null> {
  if (!isFileSystemAccessSupported()) return null;
  try {
    return await window.showDirectoryPicker({ id: 'genshin-webcaches', mode: 'read' });
  } catch {
    // The player cancelled the dialog, which is not an error.
    return null;
  }
}

export async function saveCacheHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  // Handles are structured-cloneable, so IndexedDB stores them directly. The
  // grant lives with the handle; nothing about the folder's contents is copied.
  await db.settings.put({ key: HANDLE_KEY, value: handle, updatedAt: Date.now() });
}

export async function loadCacheHandle(): Promise<FileSystemDirectoryHandle | null> {
  const row = await db.settings.get(HANDLE_KEY);
  return (row?.value as FileSystemDirectoryHandle | undefined) ?? null;
}

export async function forgetCacheHandle(): Promise<void> {
  await db.settings.delete(HANDLE_KEY);
}

/**
 * Confirms we may still read the folder.
 *
 * Chrome keeps the grant across sessions but can require it be re-confirmed,
 * and a re-request needs a user gesture — so `interactive` is false on an
 * automatic refresh and true when the player pressed something.
 */
async function ensurePermission(
  handle: FileSystemDirectoryHandle,
  interactive: boolean,
): Promise<boolean> {
  const options = { mode: 'read' } as const;
  if ((await handle.queryPermission(options)) === 'granted') return true;
  if (!interactive) return false;
  return (await handle.requestPermission(options)) === 'granted';
}

/**
 * Walks webCaches to the current cache file and pulls out the newest wish URL.
 *
 * Parsing happens here, in the browser. The file contains the authkey, and
 * DATA.md allows it to reach exactly one place: the proxied history request.
 */
export async function readWishUrl(
  handle: FileSystemDirectoryHandle,
  { interactive = false } = {},
): Promise<CacheReadResult> {
  if (!isFileSystemAccessSupported()) return { ok: false, reason: 'unsupported' };
  if (!(await ensurePermission(handle, interactive))) {
    return { ok: false, reason: 'permission-denied' };
  }

  // Newest version folder, re-resolved every time so a game update is a no-op.
  const folders: string[] = [];
  for await (const [name, entry] of handle.entries()) {
    if (entry.kind === 'directory') folders.push(name);
  }

  const version = newestCacheVersion(folders);
  if (!version) return { ok: false, reason: 'not-webcaches' };

  let directory: FileSystemDirectoryHandle;
  try {
    directory = await handle.getDirectoryHandle(version);
    for (const segment of CACHE_FILE_PATH.slice(0, -1)) {
      directory = await directory.getDirectoryHandle(segment);
    }
  } catch {
    return { ok: false, reason: 'not-webcaches' };
  }

  let file: File;
  try {
    const fileHandle = await directory.getFileHandle(CACHE_FILE_PATH[CACHE_FILE_PATH.length - 1]);
    file = await fileHandle.getFile();
  } catch {
    return { ok: false, reason: 'no-cache-file' };
  }

  let bytes: ArrayBuffer;
  try {
    bytes = await file.arrayBuffer();
  } catch {
    // Windows can hold the file open while the game is running.
    return { ok: false, reason: 'locked' };
  }

  const wish = findWishUrl(decodeCache(bytes));
  // No URL means the wish history screen has not been opened this session.
  return wish ? { ok: true, wish } : { ok: false, reason: 'no-url' };
}

/**
 * What to tell the player. DESIGN.md: say what happened and what to do.
 */
export const CACHE_FAILURE_COPY: Record<CacheReadFailure, string> = {
  unsupported:
    'This browser can’t read a folder you pick. Chrome or Edge on a computer can, or paste the link instead.',
  'no-handle':
    'Pick your Genshin webCaches folder once and Starfall can refresh wishes on its own.',
  'permission-denied': 'Starfall needs permission to read that folder again. Tap to allow it.',
  'not-webcaches':
    'That doesn’t look like the webCaches folder. It sits inside GenshinImpact_Data in your game install.',
  'no-cache-file':
    'No cache file in there yet. Open Wish → History in the game once, then try again.',
  locked: 'The game has that file open. Close Genshin and try again.',
  'no-url': 'No wish link in the cache yet. Open Wish → History in the game, then try again.',
};
