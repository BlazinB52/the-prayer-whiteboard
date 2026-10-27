import styles from "./littlelights.module.css";

type YouTubePlayerProps = {
  videoId: string;
  title: string;
};

/**
 * Shows a YouTube video inside a Little Lights page.
 * It asks YouTube to start playing right away; browsers that block sound
 * until the visitor taps (iPhones especially) show YouTube's own play button.
 * Uses YouTube's privacy-enhanced (no-cookie) player.
 */
export function YouTubePlayer({ videoId, title }: YouTubePlayerProps) {
  const params = new URLSearchParams({
    autoplay: "1",
    playsinline: "1",
    rel: "0", // related videos at the end come only from the same channel
  });

  return (
    <div className={styles.youtubeWrap}>
      <iframe
        className={styles.youtubeFrame}
        src={`https://www.youtube-nocookie.com/embed/${videoId}?${params}`}
        title={title}
        allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
      />
    </div>
  );
}
