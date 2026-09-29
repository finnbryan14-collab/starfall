import { notFound } from 'next/navigation';

/**
 * /dev/* are workbench pages for building the design system. They are useful
 * while developing and have no place in the shipped app, so they 404 in
 * production rather than being quietly reachable.
 */
export default function DevLayout({ children }: { children: React.ReactNode }) {
  if (process.env.NODE_ENV === 'production') notFound();
  return <>{children}</>;
}
