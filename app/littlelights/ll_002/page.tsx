import Link from "next/link";
import styles from "../littlelights.module.css";
import { VideoPlayer } from "../mat_724/video-player";

// The video is too large for the repo, so it lives in the public "littlelights-video" Supabase bucket.
const VIDEO_URL = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/littlelights-video/Little_Lights_002_Do_Unto_Others.mp4`;

export default function DoUntoOthersPage() {
  return (
    <section className={styles.lessonPage} aria-label="Little Lights 002: Do Unto Others">
      <VideoPlayer src={VIDEO_URL} title="Little Lights 002: Do Unto Others" />
      <Link href="/littlelights" className={styles.backToLittleLights}>
        Back to Little Lights
      </Link>
    </section>
  );
}
