import type { Metadata } from 'next';

import { LuckScreen } from './LuckScreen';

export const metadata: Metadata = { title: 'Your luck — Starfall' };

export default function LuckPage() {
  return <LuckScreen />;
}
