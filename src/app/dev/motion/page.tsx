'use client';

import { animate, stagger, svg } from 'animejs';
import { useRef, useState } from 'react';

import { duration, tweenNumber, useAnimeScope, useReducedMotion } from '@/motion';

/**
 * Workbench for src/motion/. Every helper has a control that runs it, so the
 * reduced-motion behaviour can be checked by toggling the OS setting and
 * pressing the same buttons: everything should jump straight to its end state.
 */

const CURVE = 'M4,96 C60,92 96,70 130,40 S220,6 300,10';

function Section({
  title,
  note,
  children,
}: {
  title: string;
  note: string;
  children: React.ReactNode;
}) {
  return (
    <section style={{ marginTop: 'var(--s-7)' }}>
      <h2 style={{ fontSize: 'var(--t-lg)', fontWeight: 600, margin: '0 0 var(--s-1)' }}>
        {title}
      </h2>
      <p
        style={{
          color: 'var(--dim)',
          fontSize: 'var(--t-sm)',
          margin: '0 0 var(--s-3)',
          maxWidth: '58ch',
        }}
      >
        {note}
      </p>
      {children}
    </section>
  );
}

function Button({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        minHeight: 'var(--tap)',
        padding: '0 18px',
        borderRadius: 'var(--r-input)',
        border: '1px solid var(--rule)',
        background: 'transparent',
        color: 'inherit',
        font: 'inherit',
        fontWeight: 600,
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}

export default function MotionPage() {
  const reduced = useReducedMotion();

  const numberRef = useRef<HTMLParagraphElement>(null);
  const [target, setTarget] = useState(72.9);

  const scopeRoot = useRef<HTMLDivElement>(null);
  const [scopeRuns, setScopeRuns] = useState(0);

  const drawRoot = useRef<HTMLDivElement>(null);

  // useAnimeScope: staggered bars, re-run whenever scopeRuns changes. The scope
  // reverts on cleanup, so each run starts from the untouched state.
  useAnimeScope(
    scopeRoot,
    (scope) => {
      scope.add(() => {
        animate('.demo-bar', {
          scaleY: [0, 1],
          duration: duration('move'),
          delay: stagger(24, { from: 'first' }),
          ease: 'out(3)',
        });
      });
    },
    [scopeRuns],
  );

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
        Motion
      </h1>

      <p
        style={{
          marginTop: 'var(--s-2)',
          padding: 'var(--s-3)',
          borderRadius: 'var(--r-input)',
          background: 'var(--well)',
          fontSize: 'var(--t-sm)',
        }}
      >
        <strong>prefers-reduced-motion: {reduced ? 'reduce' : 'no-preference'}</strong>
        <br />
        <span style={{ color: 'var(--dim)' }}>
          Read live, so changing the OS setting updates this without a reload. Tokens now read{' '}
          <code>--d-quick {duration('quick')}ms</code>, <code>--d-move {duration('move')}ms</code>,{' '}
          <code>--d-signature {duration('signature')}ms</code> — zeroed by tokens.css under reduced
          motion.
        </span>
      </p>

      <Section
        title="tweenNumber"
        note="Counts the hero numeral to a new value. anime.js cannot tween text, so it animates an object and writes the formatted value each frame. Under reduced motion it writes the final value once."
      >
        <p
          ref={numberRef}
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 500,
            fontSize: 'var(--t-3xl)',
            fontVariantNumeric: 'lining-nums tabular-nums',
            margin: '0 0 var(--s-3)',
          }}
        >
          {target.toFixed(1)}
        </p>
        <Button
          onClick={() => {
            const next = target > 50 ? 12.4 : 72.9;
            if (numberRef.current) {
              tweenNumber(numberRef.current, target, next, (v) => v.toFixed(1));
            }
            setTarget(next);
          }}
        >
          Count to {target > 50 ? '12.4' : '72.9'}
        </Button>
      </Section>

      <Section
        title="useAnimeScope"
        note="createScope rooted at this section, reverted on cleanup. Re-running tears the previous scope down first, so the bars start from an untouched state rather than accumulating transforms."
      >
        <div ref={scopeRoot}>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 90 }}>
            {[24, 48, 72, 90, 66, 40, 20].map((h, i) => (
              <div
                key={i}
                className="demo-bar"
                style={{
                  width: 28,
                  height: h,
                  background: i > 3 ? 'var(--gold)' : 'var(--rule)',
                  borderRadius: 2,
                  transformOrigin: '50% 100%',
                }}
              />
            ))}
          </div>
          <div style={{ marginTop: 'var(--s-3)' }}>
            <Button onClick={() => setScopeRuns((n) => n + 1)}>Replay ({scopeRuns})</Button>
          </div>
        </div>
      </Section>

      <Section
        title="createDrawable"
        note="The Fate Dial's signature move in miniature. Recreated on each run, because the dash length has to match the current path geometry."
      >
        <div ref={drawRoot}>
          <svg viewBox="0 0 320 110" style={{ width: '100%', height: 'auto' }} aria-hidden="true">
            <path
              className="demo-curve"
              d={CURVE}
              fill="none"
              stroke="var(--gold)"
              strokeWidth="2.25"
              strokeLinecap="round"
            />
          </svg>
          <Button
            onClick={() => {
              const path = drawRoot.current?.querySelector<SVGPathElement>('.demo-curve');
              if (!path) return;
              const ms = duration('signature');
              if (ms <= 0) {
                path.style.strokeDasharray = '';
                return;
              }
              animate(svg.createDrawable(path), {
                draw: ['0 0', '0 1'],
                duration: ms,
                ease: 'inOut(2)',
              });
            }}
          >
            Draw
          </Button>
        </div>
      </Section>
    </main>
  );
}
