import Image from "next/image";
import Link from "next/link";
import styles from "./littlelights.module.css";

export default function LittleLightsPage() {
  return (
    <>
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
      <section className={styles.discoveryCards} aria-label="Explore Little Lights">
        <Image
          src="/images/littlelights/faith-adventures-activities.webp"
          alt="Faith Adventures: Discover God's Word, with an open Bible and a winding path. Fun Activities: Color, create, and play, with coloring pages, crayons, and craft supplies."
          width={1920}
          height={819}
          unoptimized
          className={styles.discoveryArtwork}
        />
        <Link
          href="/littlelights/adventures"
          prefetch={false}
          aria-label="Faith Adventures"
          className={`${styles.cardLink} ${styles.faithAdventures}`}
        />
        <Link
          href="/littlelights/activities"
          prefetch={false}
          aria-label="Fun Activities"
          className={`${styles.cardLink} ${styles.funActivities}`}
        />
      </section>
    </>
  );
}
