import type { MetadataRoute } from "next";
import { getAppUrl } from "@/lib/env";

export const dynamic = "force-dynamic";

/**
 * Serves build-safe dynamic sitemap.xml listing public landing and auth entry routes.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = getAppUrl();
  const lastModified = new Date();

  return [
    {
      url: `${baseUrl}/`,
      lastModified,
      changeFrequency: "weekly",
      priority: 1.0,
    },
    {
      url: `${baseUrl}/login`,
      lastModified,
      changeFrequency: "monthly",
      priority: 0.6,
    },
    {
      url: `${baseUrl}/register`,
      lastModified,
      changeFrequency: "monthly",
      priority: 0.6,
    },
  ];
}

