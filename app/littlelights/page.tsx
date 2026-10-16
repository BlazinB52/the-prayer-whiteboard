import Image from "next/image";
import Link from "next/link";
import styles from "./littlelights.module.css";

export default function LittleLightsPage() {
  return (
    <section className={styles.welcome} aria-label="Zack's welcome to Little Lights">
      <Image
        src="/images/littlelights/littlelights_zack_welcome_hero.webp"
        alt="Little Lights — A Kids’ Corner of The Prayer Whiteboard. Zack holds a glowing lantern and says: Hey, Little Light! Want to explore God’s Word with me?"
        width={1388}
        height={846}
        unoptimized
        loading="eager"
        className={styles.welcomeArtwork}
      />
      <Link
        href="/littlelights/adventures"
        prefetch={false}
        aria-label="Start Exploring"
        className={styles.startExploring}
      />
    </section>
  );
}
