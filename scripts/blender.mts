import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';

/**
 * Runs a Blender Python script headlessly.
 *
 * Blender is a GUI application and is not on PATH on a default Windows or macOS
 * install, so this looks in the places it actually lands rather than failing
 * with "command not found" and leaving the next person to work out why.
 *
 * Run: pnpm build:models
 */

const SEARCH: string[] = [
  // Windows, versioned directories under a shared parent.
  'C:/Program Files/Blender Foundation',
  // macOS.
  '/Applications/Blender.app/Contents/MacOS',
  // Linux, usually on PATH already but these are the common tarball spots.
  '/usr/local/bin',
  '/opt/blender',
];

/** The executable's name differs per platform. */
const BINARY = process.platform === 'win32' ? 'blender.exe' : 'blender';

function fromPath(): string | null {
  const probe = spawnSync(BINARY, ['--version'], { stdio: 'ignore' });
  return probe.status === 0 ? BINARY : null;
}

function fromSearch(): string | null {
  for (const root of SEARCH) {
    if (!existsSync(root)) continue;

    const direct = path.join(root, BINARY);
    if (existsSync(direct)) return direct;

    // Windows nests one directory per version: "Blender 5.2/blender.exe".
    // Newest first, so a machine with several gets the current one.
    let entries: string[];
    try {
      entries = readdirSync(root).sort().reverse();
    } catch {
      continue;
    }

    for (const entry of entries) {
      const nested = path.join(root, entry, BINARY);
      if (existsSync(nested)) return nested;
    }
  }

  return null;
}

export function findBlender(): string | null {
  return fromPath() ?? fromSearch();
}

const script = process.argv[2];
if (!script) {
  console.error('usage: node scripts/blender.mts <script.py>');
  process.exit(1);
}

const blender = findBlender();
if (!blender) {
  console.error(
    `Could not find Blender. Install it, or put it on PATH.\nLooked in: ${SEARCH.join(', ')}`,
  );
  process.exit(1);
}

const result = spawnSync(blender, ['--background', '--python', script], { stdio: 'inherit' });
process.exit(result.status ?? 1);
