import type { Metadata, Viewport } from 'next';
import { Bodoni_Moda, Source_Sans_3 } from 'next/font/google';

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

export const metadata: Metadata = {
  title: 'Starfall',
  description:
    'Your actual odds of getting the character you want, and whether that artifact is worth your resin.',
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
      </body>
    </html>
  );
}
