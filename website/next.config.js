/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
      {
        protocol: 'http',
        hostname: 'localhost',
      },
    ],
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
