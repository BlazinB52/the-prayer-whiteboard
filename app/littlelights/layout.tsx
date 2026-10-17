import type { Metadata } from "next";
import { LittleLightsHeader } from "./navigation";
import styles from "./littlelights.module.css";

export const metadata: Metadata = {
  title: { absolute: "Little Lights — A Kids' Corner of The Prayer Whiteboard" },
  description: "Little Lights, a kids' corner of The Prayer Whiteboard.",
  robots: { index: false, follow: false },
};

export default function LittleLightsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={styles.shell}>
      <a className={styles.skipLink} href="#littlelights-content">Skip to content</a>
      <LittleLightsHeader />
      <main id="littlelights-content" tabIndex={-1} className={styles.content}>
        {children}
      </main>
    </div>
  );
}
