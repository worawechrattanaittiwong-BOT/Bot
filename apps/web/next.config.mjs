/** @type {import('next').NextConfig} */
const apiInternalUrl = process.env.API_INTERNAL_URL || "http://127.0.0.1:4000";

const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // Trading Mode Guide accepts vertical tutorial videos up to 300 MB.
    // Next.js proxies /backend rewrites and otherwise truncates request bodies
    // after 10 MB, which aborts Multer uploads on the API side.
    middlewareClientMaxBodySize: "320mb"
  },
  async headers() {
    return [
      {
        source: "/dashboard",
        headers: [
          { key: "Cache-Control", value: "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0" },
          { key: "Pragma", value: "no-cache" },
          { key: "Expires", value: "0" }
        ]
      },
      {
        source: "/admin/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0" },
          { key: "Pragma", value: "no-cache" },
          { key: "Expires", value: "0" }
        ]
      },
      {
        source: "/login",
        headers: [
          { key: "Cache-Control", value: "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0" },
          { key: "Pragma", value: "no-cache" },
          { key: "Expires", value: "0" }
        ]
      }
    ];
  },
  async rewrites() {
    return [
      {
        source: "/backend/:path*",
        destination: apiInternalUrl + "/:path*"
      }
    ];
  }
};

export default nextConfig;
