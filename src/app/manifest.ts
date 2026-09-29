import type { MetadataRoute } from 'next';

/**
 * Web app manifest.
 *
 * `display: standalone` is what makes an installed Starfall open without
 * browser chrome — and on iOS it is also the precondition for Web Push, which
 * Phase 5 needs.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Starfall',
    short_name: 'Starfall',
    description:
      'Your actual odds of getting the character you want, and whether that artifact is worth your resin.',
    start_url: '/plan',
    id: '/plan',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#141739',
    theme_color: '#141739',
    categories: ['games', 'utilities'],
    icons: [
      { src: '/icon/192', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon/512', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon/512', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'Timers', url: '/timers' },
      { name: 'Artifacts', url: '/artifacts' },
    ],
  };
}
