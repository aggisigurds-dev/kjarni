/** @type {import('next').NextConfig} */
const nextConfig = {
  async redirects() {
    return [
      // 3dwork lives in its own Vercel project (apps/web); surface it on the main domain.
      { source: "/3dwork", destination: "https://kjarni-3dwork.vercel.app/3dwork", permanent: false },
    ];
  },
};

export default nextConfig;
