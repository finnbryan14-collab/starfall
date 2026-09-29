# Data sources

Starfall is local-first. Everything the user enters or imports lives in IndexedDB on their device. The only server code is a few Next.js route handlers that proxy requests the browser can't make directly (CORS, custom User-Agent) and cache responses.

## 1. Account import: Enka.Network (UID showcase)

**What it gives you:** the player's profile plus every character in their in-game character showcase, with level, constellations, talents, weapon, and all five artifacts with substats. It does not return characters outside the showcase or unequipped artifacts.

**Endpoint:** `GET https://enka.network/api/uid/{uid}/` (full docs: https://github.com/EnkaNetwork/API-docs/blob/master/api.md). Add `?info` for the profile only.

**Rules:**
- Call it from `src/app/api/enka/[uid]/route.ts`, not the browser. Send a descriptive `User-Agent` (e.g. `Starfall/0.1 (+contact url)`).
- The response includes `ttl` (seconds). Cache by UID until it expires; don't refetch before then. Show "Updated 3 min ago" and a disabled refresh button with the remaining wait.
- Handle errors by status with a plain-language message each: bad UID format, UID not found, game maintenance, rate limited, server error. Confirm the exact status codes against the docs when implementing.
- Validate UIDs as 9 or 10 digits (newer accounts have 10-digit UIDs starting with 18).
- Raw responses use numeric IDs and text hashes. Map them to names and icons using Enka's published store files (characters, localization) or genshin-db. Keep the mapping in `src/data/enka-map.ts` and regenerate it with a script each patch.

**Libraries worth reading (don't necessarily depend on them):** `enka-network-api` (Node), `enkanetwork.js`, `enka.py`. Their parsing code shows every field.

## 2. Full inventory: GOOD format import

For users who want every artifact, not just showcased ones. Community scanners (Inventory Kamera and similar on PC, an Android scanner app) export the **Genshin Open Object Description (GOOD)** JSON used by Genshin Optimizer.

- Accept a `.json` file drop or paste. Validate with Zod against the GOOD shape (`format: "GOOD"`, `version`, `source`, `characters`, `artifacts`, `weapons`, `materials`).
- Reference interface: the `gi-good` library in https://github.com/frzyc/genshin-optimizer.
- Imports replace the previous inventory snapshot after a confirmation that shows counts ("312 artifacts, 41 characters").

## 3. Wish history import

Genshin exposes wish history only through a temporary URL the game generates when you open **Wish → History**. The URL carries an `authkey` that lasts about a day and can only read history.

**Flow:**
1. Account → Import wishes shows platform-specific steps for getting the URL (PC PowerShell script, Android, iOS). Link to paimon.moe's import page for the scripts rather than hosting our own.
2. User pastes the URL. Parse `authkey`, `authkey_ver`, `sign_type`, `lang`, `game_biz`, `region`, and the host from it. Don't hardcode the host; different servers and versions use different domains.
3. `src/app/api/wishes/route.ts` pages through `getGachaLog` for each banner type (`size=20`, cursor via `end_id` = last item's `id`), with about 300ms between requests. paimon.moe does the same: a server-side proxy for CORS with the logic on the client.
4. Merge by `id` into IndexedDB so repeated imports extend history past the game's six-month window.
5. Drop the authkey from memory when the import finishes. Never log it or store it.

**Banner type codes:** 301 character event (400 is the second character banner and shares pity with 301), 302 weapon, 200 standard, 100 beginner, 500 chronicled. Verify 400 and 500 with a real import.

**Derived stats:** pity at each 5★, 50/50 record, Capturing Radiance triggers (a win recorded right after a loss is still a guarantee; only non-guaranteed wins count as 50/50 wins), average pulls per 5★ compared with the 62.3 expected value.

## 4. Static game data

- **genshin-db** (npm `genshin-db`, updated for version 7.0) for characters, talents, constellations, weapons, materials, domains, and artifact sets. Import only the folders you need, or pre-build a trimmed JSON at build time with `scripts/build-static-data.ts`; the full package is large.
- **Talent book and weapon material weekdays** come from genshin-db's domain data.
- **Stat weights and income defaults** are ours, in `src/engine/`, with a source and date on each value.

Regenerate static data each patch (roughly every six weeks). The script should fail loudly if a character in a user's Enka import is missing from the data.

## 5. Things we deliberately don't do in v1

- **HoYoLAB login cookies** (live resin, real-time notes). They grant broad account access. If added later, keep the cookie on-device, encrypted, and never on our server.
- **Reading game memory or automating input.** Out of scope permanently; it risks bans.
- **Accounts or sync.** Local-first with JSON export/import in Account → Backups. Sync is a backlog item, not part of v1.

## Storage schema (Dexie / IndexedDB)

```ts
db.version(1).stores({
  profile: "uid",                          // Enka profile snapshot + fetchedAt + ttl
  characters: "[uid+avatarId]",            // from Enka or GOOD
  artifacts: "id, setKey, slotKey, location",
  wishes: "id, gachaType, time",           // merged wish history
  plans: "id",                             // saved wish plans (target, date, inputs)
  timers: "id",                            // timer state (setAt, rule, value)
  settings: "key",
});
```

Every table gets an `updatedAt`. Backups are a single JSON file of all tables plus a schema version.
