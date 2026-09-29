'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import styles from './Nav.module.css';

/**
 * The app's four destinations (DESIGN.md).
 *
 * Bottom bar under 1024px, left rail at or above it — one component, the
 * switch lives in the stylesheet.
 */

const TABS = [
  {
    href: '/plan',
    label: 'Plan',
    // Four-point star: the wish meteor.
    icon: 'M12 2 L13.8 10.2 L22 12 L13.8 13.8 L12 22 L10.2 13.8 L2 12 L10.2 10.2 Z',
    join: 'round' as const,
  },
  {
    href: '/artifacts',
    label: 'Artifacts',
    // Hourglass, echoing the Sands of Eon glyph.
    icon: 'M7 3 H17 M7 21 H17 M8 3 C8 9 12 10 12 12 C12 14 8 15 8 21 M16 3 C16 9 12 10 12 12 C12 14 16 15 16 21',
    join: 'cap' as const,
  },
  { href: '/timers', label: 'Timers', icon: null, join: 'cap' as const },
  { href: '/account', label: 'Account', icon: null, join: 'cap' as const },
] as const;

function TabIcon({ href }: { href: string }) {
  const common = {
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.5,
  };

  if (href === '/timers') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="9" {...common} />
        <path d="M12 7 V12 L15.5 14" {...common} strokeLinecap="round" />
      </svg>
    );
  }

  if (href === '/account') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="8.5" r="3.5" {...common} />
        <path d="M5 20 C6 15.5 9 14 12 14 C15 14 18 15.5 19 20" {...common} strokeLinecap="round" />
      </svg>
    );
  }

  const tab = TABS.find((t) => t.href === href)!;
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d={tab.icon!}
        {...common}
        {...(tab.join === 'round' ? { strokeLinejoin: 'round' } : { strokeLinecap: 'round' })}
      />
    </svg>
  );
}

export function Nav() {
  const pathname = usePathname();

  return (
    <nav className={styles.tabs} aria-label="Main">
      <div className={styles.inner}>
        {TABS.map((tab) => {
          const current = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={styles.tab}
              aria-current={current ? 'page' : undefined}
            >
              <TabIcon href={tab.href} />
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
