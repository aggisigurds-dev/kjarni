/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@imgly/background-removal", "onnxruntime-web"],
  serverExternalPackages: ["tesseract.js"],
  async redirects() {
    return [
      // 3dwork and Marks live on kjarni-3dwork.vercel.app (apps/web).
      // The reverse (/kjarni → this host) is in apps/web/next.config.ts.
      { source: "/3dwork", destination: "https://kjarni-3dwork.vercel.app/3dwork", permanent: false },
      { source: "/marks", destination: "https://kjarni-3dwork.vercel.app/marks", permanent: false },
    ];
  },
  async headers() {
    return [
      {
        source: "/kjarni/turbopaint",
        headers: [
          {
            key: "Content-Security-Policy",
            value:
              "frame-ancestors 'self' https://slokkvitaeki.netlify.app https://brunaholf.netlify.app https://*.netlify.app",
          },
        ],
      },
      {
        source: "/artcraft/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
        ],
      },
      {
        source: "/artcraft/:path*.wasm",
        headers: [
          { key: "Content-Type", value: "application/wasm" },
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
      {
        source: "/artcraft/:path*.js",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
    ];
  },
};

export default nextConfig;
