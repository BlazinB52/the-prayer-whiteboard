import styles from "./littlelights.module.css";

export default function LittleLightsPage() {
  return (
    <section className={styles.placeholder} aria-labelledby="littlelights-heading">
      <p className={styles.eyebrow}>A little light. A lot of love.</p>
      <h1 id="littlelights-heading">Welcome to Little Lights</h1>
      <p>Our kids&apos; corner is getting ready to shine.</p>
      <p className={styles.comingSoon}>Adventures and Activities are coming later. Those links don&apos;t have pages yet.</p>
    </section>
  );
}
