/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["tesseract.js"],
  async redirects() {
    return [
      // 3dwork and Marks live in the apps/web Vercel project; surface them on this hub host.
      { source: "/3dwork", destination: "https://kjarni-3dwork.vercel.app/3dwork", permanent: false },
      { source: "/marks", destination: "https://kjarni-3dwork.vercel.app/marks", permanent: false },
    ];
  },
};

export default nextConfig;
