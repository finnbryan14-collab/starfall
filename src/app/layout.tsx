import type { Metadata, Viewport } from 'next';
import { Bodoni_Moda, Source_Sans_3 } from 'next/font/google';

import { PersistentStorage } from '@/components/PersistentStorage';
import { ServiceWorker } from '@/components/ServiceWorker';
import { Shell } from '@/components/Shell';

import './globals.css';

/**
 * Bodoni Moda: display only, 28px and up (DESIGN.md). Variable across both the
 * weight and optical-size axes, and we need the italic for screen titles.
 */
const bodoniModa = Bodoni_Moda({
  subsets: ['latin'],
  style: ['normal', 'italic'],
  axes: ['opsz'],
  display: 'swap',
  variable: '--font-bodoni',
});

/** Source Sans 3: everything else. Variable weight; DESIGN.md uses 400 and 600. */
const sourceSans3 = Source_Sans_3({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-source-sans',
});

const DESCRIPTION =
  'Your actual odds of getting the character you want, and whether that artifact is worth your resin.';

export const metadata: Metadata = {
  title: 'Starfall',
  description: DESCRIPTION,
  applicationName: 'Starfall',
  // This gets shared by pasting a URL to a friend, so the unfurled card is the
  // first impression. `opengraph-image.tsx` draws it; Next resolves the URL
  // from VERCEL_URL on a deploy.
  openGraph: {
    title: 'Starfall',
    description: DESCRIPTION,
    siteName: 'Starfall',
    type: 'website',
  },
  twitter: { card: 'summary_large_image', title: 'Starfall', description: DESCRIPTION },
};

export const viewport: Viewport = {
  themeColor: '#141739',
  viewportFit: 'cover',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={`${bodoniModa.variable} ${sourceSans3.variable}`}>
      <body>
        <Shell>{children}</Shell>
        <ServiceWorker />
        <PersistentStorage />
      </body>
    </html>
  );
}
