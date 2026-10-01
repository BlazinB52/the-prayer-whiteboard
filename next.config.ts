import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "8mb",
    },
  },
  outputFileTracingIncludes: {
    "/admin/chalkboards": [
      "./node_modules/sharp/**/*",
      "./node_modules/@img/sharp-linux-x64/**/*",
      "./node_modules/@img/sharp-libvips-linux-x64/**/*",
    ],
  },
  serverExternalPackages: ["sharp"],
  async redirects() {
    return [
      {
        // Retired duplicate of the short-version teaching. `permanent` is sent as a 308,
        // which search engines treat the same as a 301.
        source: "/teachings/aliyah-israel-harvest-prayer",
        destination: "/teachings/aliyah-israel-harvest-prayer-short-version",
        permanent: true,
      },
    ];
  },
  async headers() {
    // Route handlers have no <meta> tag, so keep them out of the index with a header.
    return [
      { source: "/api/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] },
      { source: "/auth/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] },
    ];
  },
};

export default nextConfig;
