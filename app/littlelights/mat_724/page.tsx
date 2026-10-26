import Link from "next/link";
import styles from "../littlelights.module.css";
import { VideoPlayer } from "./video-player";

// The video is too large for the repo, so it lives in the public "littlelights-video" Supabase bucket.
const VIDEO_URL = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/littlelights-video/Little_Lights_001_Two_Houses_Pilot_Intro.mp4`;

export default function TwoHousesPilotIntroPage() {
  return (
    <section className={styles.lessonPage} aria-label="Little Lights 001: Two Houses, pilot intro">
      <VideoPlayer src={VIDEO_URL} title="Little Lights 001: Two Houses" />
      <Link href="/littlelights" className={styles.backToLittleLights}>
        Back to Little Lights
      </Link>
    </section>
  );
}
