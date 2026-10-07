import type { Metadata } from "next";
import { headers } from "next/headers";
import { PrayerWhiteboardAnalytics } from "./analytics";
import { LOGO_PATH, SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/seo";
import { getPageLanguage } from "@/lib/page-language";
import "./globals.css";

const logoImage = { url: LOGO_PATH, alt: `${SITE_NAME} logo` };

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_NAME,
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
    url: SITE_URL,
    locale: "en_US",
    images: [logoImage],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
    images: [logoImage.url],
  },
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Set by proxy.ts; the language comes from the content itself (see lib/page-language.ts).
  const language = await getPageLanguage((await headers()).get("x-pathname"));
  return (
    <html lang={language}>
      <body>
        {children}
        <PrayerWhiteboardAnalytics />
      </body>
    </html>
  );
}
