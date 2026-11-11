import type { Metadata } from "next";
import { LandingContent } from "@/components/landing/LandingContent";
import { getSessionUser } from "@/features/auth/session";
import { getAppUrl } from "@/lib/env";
import { enDictionary } from "@/lib/i18n/dictionaries/en";
import { idDictionary } from "@/lib/i18n/dictionaries/id";
import { getServerPreferences } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

/**
 * Generates localized SSR SEO metadata, canonical URL, Open Graph, and Twitter tags.
 */
export async function generateMetadata(): Promise<Metadata> {
  const { locale } = await getServerPreferences();
  const baseUrl = getAppUrl();
  const dict = locale === "en" ? enDictionary : idDictionary;
  const title = dict.landing.seoTitle;
  const description = dict.landing.seoDescription;

  return {
    metadataBase: new URL(baseUrl),
    title,
    description,
    alternates: {
      canonical: "/",
    },
    openGraph: {
      type: "website",
      siteName: dict.common.appName,
      locale: locale === "id" ? "id_ID" : "en_US",
      url: "/",
      title,
      description,
      images: ["/opengraph-image"],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: ["/opengraph-image"],
    },
  };
}

/**
 * Public SEO landing page SSR-rendered without DB queries for unauthenticated visitors.
 */
export default async function PublicLandingPage() {
  const user = await getSessionUser();
  return <LandingContent isAuthenticated={Boolean(user)} />;
}

