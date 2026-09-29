import type { Metadata } from 'next';

import { AA_LARGE_TEXT, AA_NON_TEXT, AA_TEXT, contrastHex } from '@/lib/contrast';
import { groupTokens, isColor, readTokens, type Token } from '@/lib/tokens.server';

export const metadata: Metadata = { title: 'Tokens — Starfall dev' };

const SURFACES = [
  { name: '--ink', label: 'ink' },
  { name: '--well', label: 'well' },
] as const;

/**
 * Tokens a text-contrast verdict does not apply to, so the ratio is shown bare.
 *
 * Surfaces are backgrounds (--ink on --ink is 1:1 by definition). --rule is a
 * decorative hairline used to group content, not a UI control or a meaningful
 * graphic, so WCAG 1.4.11 does not bind it. Labelling either "fails" would
 * imply a violation we are choosing to ignore.
 */
const NO_TEXT_VERDICT = new Set(['--ink', '--glow', '--well', '--well-2', '--gold-soft', '--rule']);

function Ratio({ value, verdict = true }: { value: number | null; verdict?: boolean }) {
  if (value === null) return <span style={{ color: 'var(--faint)' }}>—</span>;

  if (!verdict) {
    return <span style={{ color: 'var(--dim)' }}>{value.toFixed(2)}:1</span>;
  }

  // Three bands so the page says what a number means, not just what it is.
  const [label, color] =
    value >= AA_TEXT
      ? ['AA text', 'var(--gold)']
      : value >= AA_LARGE_TEXT
        ? ['large only', 'var(--maybe)']
        : value >= AA_NON_TEXT
          ? ['non-text only', 'var(--maybe)']
          : ['fails', 'var(--feed)'];

  return (
    <span style={{ color }}>
      {value.toFixed(2)}:1 <span style={{ color: 'var(--faint)' }}>{label}</span>
    </span>
  );
}

function Swatch({ token }: { token: Token }) {
  return (
    <div
      aria-hidden
      style={{
        width: 44,
        height: 44,
        flex: 'none',
        borderRadius: 'var(--r-input)',
        background: `var(${token.name})`,
        border: '1px solid var(--rule)',
      }}
    />
  );
}

export default async function TokensPage() {
  const tokens = await readTokens();
  const groups = groupTokens(tokens);

  return (
    <main
      style={{ maxWidth: 820, margin: '0 auto', padding: 'var(--s-5) var(--gutter) var(--s-8)' }}
    >
      <h1
        style={{
          fontFamily: 'var(--font-display)',
          fontStyle: 'italic',
          fontWeight: 500,
          fontSize: 'var(--t-2xl)',
          margin: 0,
        }}
      >
        Tokens
      </h1>
      <p style={{ color: 'var(--dim)', maxWidth: '60ch' }}>
        Every custom property in <code>src/styles/tokens.css</code>, read straight from the file so
        this page cannot drift from it. Colour rows carry their measured contrast against{' '}
        <code>--ink</code> and <code>--well</code>; DESIGN.md sets a {AA_TEXT}:1 floor for text.
        Surfaces and hairlines show a bare ratio — a text verdict does not apply to them.
      </p>

      {groups.map(([group, groupTokensList]) => (
        <section key={group} style={{ marginTop: 'var(--s-7)' }}>
          <h2 style={{ fontSize: 'var(--t-lg)', fontWeight: 600, margin: '0 0 var(--s-2)' }}>
            {group}
          </h2>

          <div style={{ borderTop: '1px solid var(--rule)' }}>
            {groupTokensList.map((token) => {
              const color = isColor(token);
              return (
                <div
                  key={token.name}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--s-3)',
                    padding: 'var(--s-3) 0',
                    borderBottom: '1px solid var(--rule)',
                  }}
                >
                  {color ? <Swatch token={token} /> : null}

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <code style={{ fontSize: 'var(--t-sm)' }}>{token.name}</code>
                    <div style={{ color: 'var(--dim)', fontSize: 'var(--t-sm)' }}>
                      {token.value}
                    </div>
                    {token.comment ? (
                      <div style={{ color: 'var(--faint)', fontSize: 'var(--t-xs)' }}>
                        {token.comment}
                      </div>
                    ) : null}
                  </div>

                  {color ? (
                    <div style={{ textAlign: 'right', fontSize: 'var(--t-xs)', flex: 'none' }}>
                      {SURFACES.map((surface) => {
                        const surfaceToken = tokens.find((t) => t.name === surface.name);
                        const ratio = surfaceToken
                          ? contrastHex(token.value, surfaceToken.value)
                          : null;
                        return (
                          <div key={surface.name}>
                            <span style={{ color: 'var(--faint)' }}>on {surface.label} </span>
                            <Ratio value={ratio} verdict={!NO_TEXT_VERDICT.has(token.name)} />
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>
      ))}

      <section style={{ marginTop: 'var(--s-7)' }}>
        <h2 style={{ fontSize: 'var(--t-lg)', fontWeight: 600 }}>Type scale</h2>
        <div style={{ borderTop: '1px solid var(--rule)' }}>
          {(
            [
              '--t-xs',
              '--t-sm',
              '--t-md',
              '--t-lg',
              '--t-xl',
              '--t-2xl',
              '--t-3xl',
              '--t-hero',
            ] as const
          ).map((size) => (
            <div
              key={size}
              style={{ padding: 'var(--s-3) 0', borderBottom: '1px solid var(--rule)' }}
            >
              <code style={{ fontSize: 'var(--t-xs)', color: 'var(--faint)' }}>{size}</code>
              <div
                style={{
                  fontSize: `var(${size})`,
                  fontFamily: size === '--t-hero' ? 'var(--font-display)' : 'var(--font-ui)',
                  lineHeight: 1.15,
                }}
              >
                72.9% chance
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
