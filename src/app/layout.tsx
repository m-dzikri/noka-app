import type { Metadata } from "next";
import { JetBrains_Mono, Plus_Jakarta_Sans } from "next/font/google";
import type { ReactNode } from "react";
import { PreferencesProvider } from "@/components/providers/PreferencesProvider";
import { getServerPreferences } from "@/lib/i18n/server";
import "./globals.css";

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const jetBrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Noka — Seringan Notepad, Serapi Buku Kas",
  description:
    "Catatan Markdown, daftar periksa GFM, dan pelacakan kas multi-dompet IDR yang cepat dan offline-first.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  const prefs = await getServerPreferences();

  return (
    <html
      lang={prefs.locale}
      data-theme={prefs.theme}
      suppressHydrationWarning
      className={`${plusJakartaSans.variable} ${jetBrainsMono.variable}`}
    >
      <body className="antialiased">
        <PreferencesProvider
          initialLocale={prefs.locale}
          initialTheme={prefs.theme}
          hasCookieLocale={prefs.hasCookieLocale}
          hasCookieTheme={prefs.hasCookieTheme}
        >
          {children}
        </PreferencesProvider>
      </body>
    </html>
  );
}

