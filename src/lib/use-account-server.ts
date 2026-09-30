'use client';

import { useLiveQuery } from 'dexie-react-hooks';

import { db } from '@/db/schema';
import {
  serverFromUid,
  SERVER_NAMES,
  utcOffsetForUid,
  type GameServer,
} from '@/engine/account/server';

/**
 * Which clock this device should plan in.
 *
 * Genshin runs three of them and every reset, banner window and wish timestamp
 * is on server time. The server comes from the imported UID, so nobody is
 * asked for it — but until one is imported there is nothing to go on, and every
 * screen still has to show something. It assumes America and says so.
 *
 * Read from the same settings row the Account screen writes, rather than
 * threaded down through props: the Plan and Timers screens need it too and
 * neither knows anything else about the account.
 */

const PROFILE_KEY = 'enka-profile';

export type AccountServer = {
  uid: string | null;
  server: GameServer | null;
  /** Hours from UTC. America until a UID says otherwise. */
  utcOffset: number;
  /** The server's name, for saying which clock is in use. */
  name: string;
  /** False until storage has answered. */
  loaded: boolean;
  /** True when the offset is the America default rather than a known server. */
  assumed: boolean;
};

export function useAccountServer(): AccountServer {
  /*
    Live rather than read once: importing a UID on this very screen has to
    move the answer, and a one-shot read left it saying "assuming America"
    until the next reload. The query returns undefined while it is running and
    null when there is no profile, which is how `loaded` is told apart from
    "loaded, and empty".
  */
  const row = useLiveQuery(async () => (await db.settings.get(PROFILE_KEY)) ?? null, []);

  const loaded = row !== undefined;
  const uid = (row?.value as { uid?: string } | undefined)?.uid ?? null;
  const server = uid ? serverFromUid(uid) : null;

  return {
    uid,
    server,
    utcOffset: utcOffsetForUid(uid),
    name: server ? SERVER_NAMES[server] : SERVER_NAMES.os_usa,
    loaded,
    assumed: server === null,
  };
}

/** The offset alone, for callers that only need the clock. */
export function useServerUtcOffset(): number {
  const { utcOffset } = useAccountServer();
  return utcOffset;
}
