import Link from "next/link";
import styles from "../littlelights.module.css";
import { YouTubePlayer } from "../youtube-player";

// Plays from YouTube: https://youtu.be/BlCS2y3-6Sk
const YOUTUBE_VIDEO_ID = "BlCS2y3-6Sk";

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
