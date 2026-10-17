import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "8mb",
    },
  },
  outputFileTracingIncludes: {
    // The handout templates (Word files) are read from disk when a handout is built.
    "/api/admin/handout/build": ["./assets/handout-templates/**/*"],
    "/admin/whiteboards": [
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
      {
        // Links and bookmarks from before the chalkboard -> whiteboard rename.
        source: "/admin/chalkboards/:path*",
        destination: "/admin/whiteboards/:path*",
        permanent: true,
      },
      {
        source: "/api/teachings/:slug/chalkboards/:path*",
        destination: "/api/teachings/:slug/whiteboards/:path*",
        permanent: true,
      },
      {
        source: "/prayergroup/aliyah-chalkboard.jpg",
        destination: "/prayergroup/aliyah-whiteboard.jpg",
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
