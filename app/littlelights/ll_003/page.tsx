import Link from "next/link";
import styles from "../littlelights.module.css";
import { YouTubePlayer } from "../youtube-player";

// Plays from YouTube: https://youtu.be/P9f6JIY6dpM
const YOUTUBE_VIDEO_ID = "P9f6JIY6dpM";

export default function LittleLights003Page() {
  return (
    <section className={styles.lessonPage} aria-label="Little Lights 003 video">
      <YouTubePlayer videoId={YOUTUBE_VIDEO_ID} title="Little Lights 003 video" />
      <Link href="/littlelights" className={styles.backToLittleLights}>
        Back to Little Lights
      </Link>
    </section>
  );
}
