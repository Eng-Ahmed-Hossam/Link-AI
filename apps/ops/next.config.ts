import type { NextConfig } from 'next';

const config: NextConfig = {
  transpilePackages: ['@link/ui', '@link/i18n', '@link/tokens', '@link/api-client'],
  devIndicators: false,
  agentRules: false,
};

export default config;
