import type { NextConfig } from "next";

// RECONFIGURE TO NOT IGNORE BUILD ERRORS - THIS IS A TEMPORARY FIX
const nextConfig: NextConfig = {
  webpack: (config) => {
    // Ignore specific warnings
    config.ignoreWarnings = [
      /Critical dependency: the request of a dependency is an expression/,
      /Module not found: Can't resolve/,
      // Supabase realtime warnings
      /RealtimeClient\.js/,
    ];
    
    return config;
  },
  // Suppress other build warnings
  typescript: {
    // Skip type checking during build (warnings only, not errors)
    ignoreBuildErrors: false,
  },
  eslint: {
    // Ignore ESLint during builds
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
