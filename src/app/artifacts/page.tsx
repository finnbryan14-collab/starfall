import type { Metadata } from 'next';

import { ArtifactsScreen } from './ArtifactsScreen';

export const metadata: Metadata = { title: 'Artifacts — Starfall' };

export default function ArtifactsPage() {
  return <ArtifactsScreen />;
}
