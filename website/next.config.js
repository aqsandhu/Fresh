/** @type {import('next').NextConfig} */
const nextConfig = {

  images: {
    domains: ['localhost', 'images.unsplash.com', 'placehold.co'],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api') + '/:path*',
      },
    ]
  },
}

module.exports = nextConfig
