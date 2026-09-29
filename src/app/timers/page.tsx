import type { Metadata } from 'next';

import { TimersScreen } from './TimersScreen';

export const metadata: Metadata = { title: 'Timers — Starfall' };

export default function TimersPage() {
  return <TimersScreen />;
}
