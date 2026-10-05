'use client';

import { animate } from 'animejs';
import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';

import { duration, useReducedMotion } from '@/motion';

/**
 * The incoming screen arrives rather than appearing.
 *
 * DESIGN.md has specified this since the beginning — opacity 0 to 1 and an 8px
 * rise on the incoming panel, over `--d-move` — and it was the one row of that
 * table never built. Without it the four tabs cut between each other, which
 * reads as four separate pages rather than one app.
 *
 * Renders the `<main>` itself rather than wrapping it. A wrapper div would be a
 * new box inside a `flow-root` container for no reason; this way the DOM is
 * exactly what the server component produced, with a ref on it.
 *
 * Never on the first paint. A fresh load already fades the whole shell in, and
 * animating again on top of that makes an opening feel slow.
 */
export function PanelTransition({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const ref = useRef<HTMLElement>(null);
  const reduced = useReducedMotion();
  const settled = useRef(false);

  useEffect(() => {
    const element = ref.current;

    // The first run is the page the player landed on, not a change of screen.
    if (!settled.current) {
      settled.current = true;
      return;
    }

    if (!element || reduced) return;

    // Read from the token, so the media query in tokens.css reaches anime.js —
    // which never looks at CSS custom properties on its own.
    const ms = duration('move', element);
    if (ms <= 0) return;

    animate(element, {
      opacity: [0, 1],
      translateY: [8, 0],
      duration: ms,
      ease: 'out(3)',
    });
  }, [pathname, reduced]);

  return (
    <main className={className} ref={ref}>
      {children}
    </main>
  );
}
