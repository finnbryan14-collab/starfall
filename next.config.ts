import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // The dev badge sits bottom-left, over the first tab in the bottom bar, and
  // would appear in every comparison screenshot. Errors are still surfaced.
  devIndicators: false,
};

export default nextConfig;
