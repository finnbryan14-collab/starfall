'use client';

import { useEffect } from 'react';

/**
 * Registers the service worker.
 *
 * Production only. In development the cached shell fights Fast Refresh, and a
 * stale worker from a previous session is a confusing thing to debug — the
 * artifacts worker already cost an hour of exactly that.
 */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (!('serviceWorker' in navigator)) return;

    // After load, so registration never competes with the first paint.
    const register = () => {
      void navigator.serviceWorker.register('/sw.js').catch(() => {
        // An unregistered worker only costs offline support, so there is
        // nothing to tell the player about.
      });
    };

    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });

    return () => window.removeEventListener('load', register);
  }, []);

  return null;
}
