/** @type {import('next').NextConfig} */
const apiInternalUrl = process.env.API_INTERNAL_URL || "http://127.0.0.1:4000";

const nextConfig = {
  reactStrictMode: true,
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
