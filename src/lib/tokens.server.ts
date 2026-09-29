import { readFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * Parses src/styles/tokens.css so /dev/tokens renders the real tokens rather
 * than a hand-kept copy. Server-only: it reads from disk.
 */

export type Token = {
  name: string;
  value: string;
  comment: string | null;
  group: string;
};

const TOKENS_PATH = path.join(process.cwd(), 'src', 'styles', 'tokens.css');

/** `/* ---------- Color: the night sky ---------- *\/` -> `Color: the night sky` */
const GROUP_RE = /\/\*\s*-+\s*(.+?)\s*-+\s*\*\//;
/** `--ink: #141739; /* page background *\/` */
const DECL_RE = /^\s*(--[\w-]+)\s*:\s*([^;]+);\s*(?:\/\*\s*(.*?)\s*\*\/)?/;

export async function readTokens(): Promise<Token[]> {
  const css = await readFile(TOKENS_PATH, 'utf8');
  const tokens: Token[] = [];
  let group = 'Other';
  let inReducedMotion = false;

  for (const line of css.split('\n')) {
    // Skip the reduced-motion override block; those re-declare existing tokens.
    if (line.includes('prefers-reduced-motion')) inReducedMotion = true;
    if (inReducedMotion) {
      if (line.includes('}')) inReducedMotion = false;
      continue;
    }

    const groupMatch = GROUP_RE.exec(line);
    if (groupMatch) {
      group = groupMatch[1];
      continue;
    }

    const decl = DECL_RE.exec(line);
    if (decl) {
      tokens.push({
        name: decl[1],
        value: decl[2].trim(),
        comment: decl[3] ?? null,
        group,
      });
    }
  }

  return tokens;
}

/** Groups in the order they appear in the file. */
export function groupTokens(tokens: Token[]): [string, Token[]][] {
  const byGroup = new Map<string, Token[]>();
  for (const token of tokens) {
    const existing = byGroup.get(token.group);
    if (existing) existing.push(token);
    else byGroup.set(token.group, [token]);
  }
  return [...byGroup.entries()];
}

export function isColor(token: Token): boolean {
  return /^(#|rgb|hsl|var\()/.test(token.value);
}
