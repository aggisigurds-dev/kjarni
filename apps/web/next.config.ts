import type { NextConfig } from 'next';

const config: NextConfig = {
  cacheComponents: true,
  async redirects() {
    // TurboPaint lives on the slokkvitaeki Vercel project (kjarni.vercel.app).
    // This host is Marks + 3dwork only — send /kjarni there instead of a 404.
    return [
      {
        source: '/kjarni',
        destination: 'https://kjarni.vercel.app/kjarni',
        permanent: false,
      },
      {
        source: '/kjarni/:path*',
        destination: 'https://kjarni.vercel.app/kjarni/:path*',
        permanent: false,
      },
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: '*.supabase.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: '*.unsplash.com',
        port: '',
        pathname: '/**',
      },
    ],
  },
};

export default config;
