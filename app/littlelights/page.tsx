import Image from "next/image";
import Link from "next/link";
import styles from "./littlelights.module.css";

const featuredAdventureLinks = {
  allAdventures: "/littlelights/coming-soon",
  begin: "/littlelights/coming-soon",
};

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
      <section className={styles.featuredAdventure} aria-label="Featured Adventure">
        <Image
          src="/images/littlelights/littlelights-featured-adventure.webp"
          alt="Featured Adventure: God Is With You Every Day. A Little Lights Adventure with 6 story chapters. Jesus walks beside a happy child on a sunlit path."
          width={1920}
          height={819}
          unoptimized
          className={styles.featuredArtwork}
        />
        <Link
          href={featuredAdventureLinks.allAdventures}
          prefetch={false}
          aria-label="See All Adventures"
          className={`${styles.featuredLink} ${styles.seeAllAdventures}`}
        />
        <Link
          href={featuredAdventureLinks.begin}
          prefetch={false}
          aria-label="Tap to Begin"
          className={`${styles.featuredLink} ${styles.beginAdventure}`}
        />
      </section>
      <section className={styles.discoveryPrintables} aria-label="Discovery and Printables">
        <Image
          src="/images/littlelights/littlelights-discovery-printables.webp"
          alt="Zack holds a glowing lantern and says: Follow the Light! Let’s see what we discover! Printables & Coloring: Fun pages to help you learn and grow! Illustrated coloring pages and crayons point toward a circular arrow."
          width={1920}
          height={819}
          unoptimized
          className={styles.printablesArtwork}
        />
        <Link
          href="/littlelights/coming-soon"
          prefetch={false}
          aria-label="Open Printables and Coloring"
          className={styles.printablesLink}
        />
      </section>
    </>
  );
}
