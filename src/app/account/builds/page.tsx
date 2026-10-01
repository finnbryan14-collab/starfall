import type { Metadata } from 'next';

import { BuildScreen } from './BuildScreen';

export const metadata: Metadata = { title: 'Best build — Starfall' };

export default function BuildsPage() {
  return <BuildScreen />;
}
