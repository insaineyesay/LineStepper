import type { NextConfig } from 'next';

const config: NextConfig = {
  // Shared package ships TypeScript source; let Next compile it.
  transpilePackages: ['@linestepper/shared'],
};

export default config;
