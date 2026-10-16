import Link from "next/link";
import styles from "../littlelights.module.css";

export default function LittleLightsComingSoonPage() {
  return (
    <section className={styles.comingSoonPage} aria-labelledby="coming-soon-heading">
      <p>Little Lights</p>
      <h1 id="coming-soon-heading">An Adventure Is Coming Soon!</h1>
      <p>We&apos;re getting something special ready for you. Come back soon for more adventures in God&apos;s Word!</p>
      <Link href="/littlelights" className={styles.backToLittleLights}>
        Back to Little Lights
      </Link>
    </section>
  );
}
