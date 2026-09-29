import { notFound } from 'next/navigation';

/**
 * /dev/* are workbench pages for building the design system. They are useful
 * while developing and have no place in the shipped app, so they 404 in
 * production.
 *
 * The e2e suite runs against a production build (the dev server's on-demand
 * compilation made it flaky under parallel workers), and it needs these pages
 * to check the motion contract. NEXT_PUBLIC_ENABLE_DEV_PAGES opens them for
 * that build only; the deploy never sets it.
 */
const enabled =
  process.env.NODE_ENV !== 'production' || process.env.NEXT_PUBLIC_ENABLE_DEV_PAGES === '1';

export default function DevLayout({ children }: { children: React.ReactNode }) {
  if (!enabled) notFound();
  return <>{children}</>;
}
