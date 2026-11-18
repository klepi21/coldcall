import type { NextConfig } from 'next';
import { execSync } from 'node:child_process';

const API = process.env.API_ORIGIN ?? 'http://localhost:4000';

/** One id per build. Open tabs compare it with /version.json to pick up new releases on their own. */
const BUILD_ID =
  process.env.COLDCALL_RELEASE ??
  (() => {
    try {
      return execSync('git rev-parse --short HEAD').toString().trim() + '-' + Date.now().toString(36);
    } catch {
      return Date.now().toString(36);
    }
  })();

const nextConfig: NextConfig = {
  transpilePackages: ['@coldcall/games', '@coldcall/shared'],
  devIndicators: false,
  // Lint runs separately; style rules must not block a production build. Type errors still fail the build.
  eslint: { ignoreDuringBuilds: true },
  generateBuildId: async () => BUILD_ID,
  env: { NEXT_PUBLIC_BUILD_ID: BUILD_ID },
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${API}/api/:path*` }];
  },
};

export default nextConfig;
