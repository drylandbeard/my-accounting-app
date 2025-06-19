import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Remove typescript.ignoreBuildErrors to ensure proper compilation
  experimental: {
    // Ensure proper module resolution
    esmExternals: true,
  },
};

export default nextConfig;