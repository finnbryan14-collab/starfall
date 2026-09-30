import type { Metadata } from 'next';

import { RosterScreen } from './RosterScreen';

export const metadata: Metadata = { title: 'Your account — Starfall' };

export default function RosterPage() {
  return <RosterScreen />;
}
