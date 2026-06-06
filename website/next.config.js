/** @type {import('next').NextConfig} */

// Same Google Maps key resolution as customer-app/app.config.ts (all aliases → public env).
const googleMapsKey = (
  process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ||
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ||
  process.env.GOOGLE_MAPS_API_KEY ||
  ''
).trim();

function buildImageRemotePatterns() {
  const patterns = [
    { protocol: 'https', hostname: '**.supabase.co' },
    { protocol: 'http', hostname: 'localhost' },
    { protocol: 'https', hostname: 'localhost' },
  ];

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';
  if (apiUrl) {
    try {
      const { hostname } = new URL(apiUrl);
      if (hostname && hostname !== 'localhost') {
        patterns.push({ protocol: 'https', hostname });
      }
    } catch {
      // ignore invalid URL
    }
  }

  return patterns;
}

const nextConfig = {
  env: {
    NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: googleMapsKey,
  },
  // Tell Next.js to transpile Firebase packages — this forces webpack to use
  // the browser-compatible exports instead of the Node.js (node-esm) build,
  // which was pulling in undici and breaking the client bundle.
  transpilePackages: [
    '@freshbazar/shared-types',
    'firebase',
    '@firebase/auth',
    '@firebase/app',
    '@firebase/util',
    '@firebase/component',
    '@firebase/logger',
  ],

  // Stop webpack from bundling undici. Firebase Auth's node-esm entry pulls
  // undici (a Node-only fetch impl using class-private `#field` syntax that
  // Next 14's webpack loader can't parse). Browsers + the Next runtime both
  // already have native fetch — undici isn't needed anywhere we deploy to,
  // so aliasing to false short-circuits the resolution and stops the parse
  // attempt entirely. Required across both server and client passes because
  // Next compiles both halves of every client component.
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      undici: false,
    };
    return config;
  },
  // TypeScript / ESLint errors are resolved — enforce on build.
  typescript: {
    ignoreBuildErrors: false,
  },
  eslint: {
    ignoreDuringBuilds: false,
  },
  images: {
    remotePatterns: buildImageRemotePatterns(),
  },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api') + '/:path*',
      },
    ];
  },
};

module.exports = nextConfig;
