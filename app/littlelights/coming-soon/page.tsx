import Image from "next/image";
import Link from "next/link";
import styles from "../littlelights.module.css";

export default function LittleLightsComingSoonPage() {
  return (
    <section className={styles.comingSoonPage} aria-label="Little Lights under construction">
      <Image
        src="/images/littlelights/littlelights-under-construction.webp"
        alt="Zack holds a glowing lantern beside a building under construction. Hi, I’m Zack! Excuse our mess. Holy Spirit and I have some things under construction. Check back soon to see what we’re building."
        width={1122}
        height={1402}
        unoptimized
        loading="eager"
        className={styles.underConstructionArtwork}
      />
      <Link href="/littlelights" className={styles.backToLittleLights}>
        Back to Little Lights
      </Link>
    </section>
  );
}
