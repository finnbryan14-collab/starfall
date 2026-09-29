import type { Metadata } from 'next';

import { PlanScreen } from './PlanScreen';

export const metadata: Metadata = { title: 'Plan — Starfall' };

export default function PlanPage() {
  return <PlanScreen />;
}
