'use client';

import { useEffect, useRef } from 'react';

import { useReducedMotion } from '@/motion';
import { onMeteor } from '@/three/signal';
import { createSky, starCountFor, type Sky } from '@/three/sky';

import styles from './SkyCanvas.module.css';

/**
 * The starfield, with depth, layered over the SVG one.
 *
 * The SVG sky is server-rendered and always there. This fades in on top of it
 * once three.js has loaded, using the same seed — so nothing moves, nothing
 * reflows, and on a device that cannot or should not run it the player simply
 * gets the sky that was already drawn.
 *
 * ## Four reasons it never mounts
 *
 * - **Reduced motion.** It drifts; that is the whole point of it.
 * - **No WebGL.** Checked by trying to get a context, not by guessing.
 * - **Save-Data.** Someone on a metered connection should not be sent 150 KB
 *   of renderer for scenery.
 * - **Before hydration.** three.js is a dynamic import, so it never lands in
 *   the main bundle and never delays a first paint.
 *
 * It also stops entirely when the tab is hidden. A background tab quietly
 * animating a starfield is a battery complaint waiting to happen.
 */

/** Pointer lean is damped in the renderer; this is just the raw reading. */
function leanFrom(event: PointerEvent): [number, number] {
  return [
    (event.clientX / globalThis.innerWidth) * 2 - 1,
    (event.clientY / globalThis.innerHeight) * 2 - 1,
  ];
}

function hasWebgl(): boolean {
  try {
    const probe = document.createElement('canvas');
    return Boolean(probe.getContext('webgl2') ?? probe.getContext('webgl'));
  } catch {
    return false;
  }
}

/** Honours the browser's own data-saver switch. */
function savingData(): boolean {
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  return connection?.saveData === true;
}

export function SkyCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (reduced) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (!hasWebgl() || savingData()) return;

    let sky: Sky | null = null;
    let frame = 0;
    let cancelled = false;
    let last = 0;

    const start = performance.now();

    void import('three')
      .then((three) => {
        if (cancelled || !canvasRef.current) return;

        sky = createSky(three, canvas, {
          starCount: starCountFor(globalThis.innerWidth),
        });
        sky.resize(globalThis.innerWidth, globalThis.innerHeight);

        // Faded in rather than switched on, so the canvas arrives over the SVG
        // instead of replacing it in one frame.
        canvas.dataset.ready = 'true';

        const loop = (now: number) => {
          frame = requestAnimationFrame(loop);
          const elapsed = (now - start) / 1000;
          const delta = last === 0 ? 0 : Math.min(0.1, (now - last) / 1000);
          last = now;
          sky?.frame(elapsed, delta);
        };
        frame = requestAnimationFrame(loop);
      })
      .catch(() => {
        // Scenery. A renderer that will not load costs the player nothing they
        // can see, so there is nothing to tell them about.
      });

    const onResize = () => sky?.resize(globalThis.innerWidth, globalThis.innerHeight);
    const onPointer = (event: PointerEvent) => sky?.look(...leanFrom(event));

    const onVisibility = () => {
      if (document.hidden) {
        cancelAnimationFrame(frame);
        frame = 0;
      } else if (frame === 0 && sky) {
        // `last` is stale after any pause, and a delta measured across it would
        // jump the drift forward by however long the tab was in the background.
        last = 0;
        const loop = (now: number) => {
          frame = requestAnimationFrame(loop);
          const elapsed = (now - start) / 1000;
          const delta = last === 0 ? 0 : Math.min(0.1, (now - last) / 1000);
          last = now;
          sky?.frame(elapsed, delta);
        };
        frame = requestAnimationFrame(loop);
      }
    };

    // Subscribed even before three.js has loaded, so a meteor asked for during
    // that window is dropped rather than queued — it belongs to the moment that
    // asked for it, and arriving two seconds late would be worse than not.
    const stopListening = onMeteor(() => sky?.meteor());

    globalThis.addEventListener('resize', onResize);
    globalThis.addEventListener('pointermove', onPointer, { passive: true });
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      stopListening();
      globalThis.removeEventListener('resize', onResize);
      globalThis.removeEventListener('pointermove', onPointer);
      document.removeEventListener('visibilitychange', onVisibility);
      sky?.dispose();
    };
  }, [reduced]);

  if (reduced) return null;

  return <canvas ref={canvasRef} className={styles.sky} aria-hidden="true" />;
}
