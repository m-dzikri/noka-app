import type { MetadataRoute } from "next";
import { getAppUrl } from "@/lib/env";

export const dynamic = "force-dynamic";

/**
 * Serves build-safe dynamic robots.txt rules derived from validated APP_URL.
 */
export default function robots(): MetadataRoute.Robots {
  const baseUrl = getAppUrl();

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/app/", "/api/"],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}

