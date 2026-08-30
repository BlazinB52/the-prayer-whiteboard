import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://theprayerwhiteboard.com"),
  title: {
    default: "The Prayer Whiteboard",
    template: "%s | The Prayer Whiteboard",
  },
  description:
    "Prayer-group teachings, prayer needs, praise reports, and encouragement from God's Word.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
