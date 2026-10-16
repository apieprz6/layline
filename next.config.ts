import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Configuration for production deployment
  output: 'standalone',
  experimental: {
    serverActions: {
      // Server Actions carry uploads, and the default 1 MB is the *body*, form fields included —
      // so an icon or a polar at the 1 MB limit those actions enforce would be cut off by Next
      // before the action could say why. A little over twice the largest file any action accepts.
      bodySizeLimit: '2mb',
    },
  },
};

export default nextConfig;
