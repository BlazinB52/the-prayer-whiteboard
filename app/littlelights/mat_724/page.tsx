import Image from "next/image";
import Link from "next/link";
import styles from "../littlelights.module.css";
import { SongPlayer } from "./song-player";

export default function BuildOnTheRockPage() {
  return (
    <section className={styles.lessonPage} aria-label="Build on the Rock, Matthew 7:24">
      <SongPlayer src="/audio/littlelights/build-on-the-rock.mp3" title="Build on the Rock" />
      <Image
        src="/images/littlelights/build-on-the-rock-matthew-7-24.webp"
        alt="Build on the Rock! Matthew 7:24. Hear Jesus. Do what He says. Stand strong! 1. Hear Jesus' words: listen to what Jesus says in the Bible. 2. Put them into practice: don't just hear it, do it! 3. The wise builder: the wise man built his house on the rock. 4. The Rock is Jesus: Jesus helps us stand strong. 5. The storm came: rain fell, streams rose, wind blew. 6. It did not fall! The house stood strong because it was on the rock. House on sand equals crash! Memory verse: Everyone who hears these words of Mine and puts them into practice is like a wise man who built his house on the rock. Matthew 7:24. Memory chant: Hear it! Do it! Build on Jesus! A little prayer: Jesus, help me hear Your words, obey You, and build my life on You. Amen."
        width={1086}
        height={1448}
        unoptimized
        loading="eager"
        className={styles.lessonArtwork}
      />
      <Link href="/littlelights" className={styles.backToLittleLights}>
        Back to Little Lights
      </Link>
    </section>
  );
}
