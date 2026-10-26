import Image from "next/image";
import Link from "next/link";
import { BookOpen, LockKeyhole, Music2, PlayCircle, Star } from "lucide-react";
import styles from "../littlelights.module.css";

export const metadata = {
  title: "Scripture Memory Songs | Little Lights",
  description: "Sing it! Learn it! Live it! Explore Bible memory songs with Zack.",
};

export default function ScriptureSongsPage() {
  return (
    <section className={styles.songsPage} aria-labelledby="songs-heading">
      <div className={styles.songsHeading}>
        <Music2 aria-hidden="true" size={30} />
        <h1 id="songs-heading">Scripture Memory Songs</h1>
        <p>Sing it! Learn it! Live it!</p>
      </div>
      <div className={styles.songsWelcome}>
        <span className={styles.songsLantern} aria-hidden="true">🏮</span>
        <p><strong>Hey! I’m Zack!</strong><br />Ready to learn God’s Word with music? Pick a song and sing along!</p>
      </div>
      <Link href="/littlelights/mat_724" className={styles.songsSongCard}>
        <span className={styles.songsPicture}><Image src="/images/littlelights/littlelights-wise-builder-card.webp" alt="A wooden house built on a solid rocky foundation" width={95} height={95} style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "14px" }} /></span>
        <span className={styles.songsCardText}><strong>The Wise Builder</strong><span>Matthew 7:24</span><span className={styles.songsPlay}><PlayCircle size={22} /> Watch &amp; Sing</span></span>
      </Link>
      <div className={styles.songsFutureCard}>
        <span className={styles.songsFutureIcon}><Music2 size={39} /></span>
        <span className={styles.songsCardText}><strong>Our Next Adventure</strong><span>A new Scripture song is coming!</span></span>
        <LockKeyhole size={21} aria-label="Coming soon" />
      </div>
      <div className={styles.songsFutureCardPurple}>
        <span className={styles.songsFutureIcon}><Star size={39} /></span>
        <span className={styles.songsCardText}><strong>More Songs Ahead!</strong><span>Keep exploring God’s Word.</span></span>
        <LockKeyhole size={21} aria-label="Coming soon" />
      </div>
      <p className={styles.songsNote}><BookOpen size={18} aria-hidden="true" /> Hide God’s Word in your heart, one song at a time!</p>
      <Link href="/littlelights" className={styles.songsHome}>Back to Little Lights</Link>
    </section>
  );
}
