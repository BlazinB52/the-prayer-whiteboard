import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/api", "/auth", "/update-password", "/email-preferences"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
