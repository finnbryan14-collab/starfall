import type { Metadata } from 'next';

import { AccountScreen } from './AccountScreen';

export const metadata: Metadata = { title: 'Account — Starfall' };

export default function AccountPage() {
  return <AccountScreen />;
}
