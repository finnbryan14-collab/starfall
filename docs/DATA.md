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

**Which fate each spends:** 301, 400, 302 and 500 take **Intertwined Fate** and so draw on a wish plan's budget; 100 and 200 take **Acquaint Fate** and do not. Sources on `INTERTWINED_BANNERS` in `src/engine/wish/history.ts`.

**The API host is not the pasted host.** The URL the game produces points at a webview page (`gs.hoyoverse.com/...`). The log itself is served from `public-operation-hk4e-sg.hoyoverse.com/gacha_info/api/getGachaLog`, or `public-operation-hk4e.mihoyo.com` for China — which of the two is chosen by the region in the pasted URL, not hardcoded. paimon.moe does the same.

**Timestamps have no timezone.** `time` is the _server's_ local time: America UTC-5, Europe UTC+1, everything else UTC+8. Reading it as UTC puts every America pull five hours early.

**Derived stats:** pity at each 5★, 50/50 record, Capturing Radiance triggers (a win recorded right after a loss is still a guarantee; only non-guaranteed wins count as 50/50 wins), average pulls per 5★ compared with the 62.3 expected value.

## 4. Static game data

- **genshin-db** (npm `genshin-db`, updated for version 7.0) for characters, talents, constellations, weapons, materials, domains, and artifact sets. Import only the folders you need, or pre-build a trimmed JSON at build time with `scripts/build-static-data.ts`; the full package is large.
- **Talent book and weapon material weekdays** come from genshin-db's domain data.
- **Stat weights and income defaults** are ours, in `src/engine/`, with a source and date on each value.

Regenerate static data each patch (roughly every six weeks). The script should fail loudly if a character in a user's Enka import is missing from the data.

## 5. HoYoLAB, behind an explicit opt-in

This section originally read "deliberately not in v1". That was reversed on 2026-09-29 (see DECISIONS) once it was clear how much a cookie unlocks: it is the difference between a planner you feed and one that feeds itself.

**Three endpoints, all overseas (`os_*` servers), all signed with a `DS` header.** Shapes follow `genshin.py`, the most complete public record of this unofficial API — https://github.com/thesadru/genshin.py.

| What                                                              | Endpoint                                                                                 |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Real-time notes (resin, commissions, transformer, realm currency) | `GET sg-public-api.hoyolab.com/event/game_record/genshin/api/dailyNote?server=&role_id=` |
| Traveler's Diary (primogem income by source)                      | `GET sg-hk4e-api.hoyolab.com/event/ysledgeros/month_info?region=&uid=&month=&lang=`      |
| Mint a wish authkey                                               | `POST api-account-os.hoyoverse.com/binding/api/genAuthKeyByCookieToken`                  |

**Rules:**

- **Opt-in, and off by default.** Everything that works without a cookie keeps working. An e2e test asserts no request is made before the player opts in.
- **Only the cookies these three calls need are kept**: `ltoken_v2` plus `ltuid_v2`/`ltmid_v2` for the Chronicle, and `cookie_token_v2` + `account_mid_v2` + `account_id_v2` to mint a key. A pasted header is filtered _before the first write_, so the rest never reaches IndexedDB.
- **The cookie lives on the device**, and is sent in a POST body — never a query string, which would put a credential in every access log it passes.
- **It does transit our proxy**, because a browser cannot set a `Cookie` header cross-origin and cannot compute the `DS` signature without the salt. Nothing is stored or logged there. The Account screen says this plainly rather than claiming the cookie never leaves the device.
- The `DS` salt is an app constant that changes with HoYoLAB app versions. When every request starts returning -100, that is the first thing to check (`src/lib/hoyolab.server.ts`).
- Retcodes are read out of a 200 body, not the HTTP status. `10102` and `10104` mean the player has the Chronicle or Real-Time Notes switched off, which is their fix to make, not a broken cookie.

## 6. Things we deliberately don't do in v1

- **Reading game memory or automating input.** Out of scope permanently; it risks bans.
- **Accounts or sync.** Local-first with JSON export/import in Account → Backups. Sync is a backlog item, not part of v1.

## Storage schema (Dexie / IndexedDB)

```ts
db.version(1).stores({
  profile: 'uid', // Enka profile snapshot + fetchedAt + ttl
  characters: '[uid+avatarId]', // from Enka or GOOD
  artifacts: 'id, setKey, slotKey, location',
  wishes: 'id, gachaType, time', // merged wish history
  plans: 'id', // saved wish plans (target, date, inputs)
  timers: 'id', // timer state (setAt, rule, value)
  settings: 'key',
});
```

Every table gets an `updatedAt`. Backups are a single JSON file of all tables plus a schema version.
