import path from 'node:path';
import type { NextConfig } from 'next';

const apiOrigin = process.env.API_ORIGIN ?? 'http://localhost:3001';

const nextConfig: NextConfig = {
  output: 'standalone',
  // Monorepo : la sortie autonome inclut les paquets partagés (packages/shared).
  outputFileTracingRoot: path.join(__dirname, '../../'),
  poweredByHeader: false,
  // Le lint est fait une seule fois à la racine (`pnpm lint`).
  eslint: { ignoreDuringBuilds: true },
  // En développement, /api est relayé vers NestJS (une seule origine, comme en production derrière Caddy).
  async rewrites() {
    return process.env.NODE_ENV === 'production'
      ? []
      : [{ source: '/api/:path*', destination: `${apiOrigin}/api/:path*` }];
  },
};

export default nextConfig;
