import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: process.cwd(),
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'i.postimg.cc', pathname: '/**' },
      { protocol: 'https', hostname: 'shop.vinfastauto.com', pathname: '/**' },
      { protocol: 'https', hostname: 'static-cms-prod.vinfastauto.com', pathname: '/**' },
      { protocol: 'https', hostname: 'vinfastauto.com', pathname: '/**' },
    ],
  },
}

export default nextConfig
