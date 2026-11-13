import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep local compiler output separate from existing production build artifacts.
  distDir: process.env.RADIAL_NEXT_DIST_DIR || '.next',
  allowedDevOrigins: ['192.168.18.245', '127.0.0.1', 'localhost'],
  async headers() {
    return [{
      source: '/termografia/sw.js',
      headers: [
        { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
        { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
      ],
    }, {
      source: '/termografia/offline/latest.json',
      headers: [{ key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' }],
    }];
  },
};

export default nextConfig;
