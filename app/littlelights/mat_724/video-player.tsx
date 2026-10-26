"use client";

import { useEffect, useRef, useState } from "react";
import styles from "../littlelights.module.css";

type VideoPlayerProps = {
  src: string;
  title: string;
};

const UNLOCK_EVENTS = ["pointerup", "touchend", "click", "keydown"] as const;

/**
 * Tries to start the video (with sound) as soon as the page opens.
 * Browsers may block sound until the visitor touches the page, so if
 * autoplay is refused a big Play button is shown and the first tap
 * anywhere on the page starts the video.
 */
export function VideoPlayer({ src, title }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const removeUnlockListeners = () => {
      UNLOCK_EVENTS.forEach((name) => document.removeEventListener(name, unlock, true));
    };

    function unlock(event: Event) {
      // The Play button handles its own taps, and taps on the video use its own controls.
      const target = event.target as Node;
      if (buttonRef.current?.contains(target) || video?.contains(target)) return;
      removeUnlockListeners();
      if (!video || !video.paused) return;
      video.play().then(() => setBlocked(false)).catch(() => setBlocked(true));
    }

    video.play().then(
      () => setBlocked(false),
      () => {
        setBlocked(true);
        UNLOCK_EVENTS.forEach((name) => document.addEventListener(name, unlock, true));
      },
    );

    return () => {
      removeUnlockListeners();
      video.pause();
    };
  }, []);

  const start = () => {
    videoRef.current?.play().then(() => setBlocked(false)).catch(() => setBlocked(true));
  };

  return (
    <div className={styles.videoWrap}>
      <video
        ref={videoRef}
        src={src}
        className={styles.lessonVideo}
        controls
        playsInline
        preload="auto"
        aria-label={title}
        onPlay={() => setBlocked(false)}
      />
      {blocked && (
        <button
          ref={buttonRef}
          type="button"
          onClick={start}
          className={styles.videoPlayButton}
          aria-label={`Play the video ${title}`}
        >
          <span aria-hidden="true">▶</span>
          Tap to play!
        </button>
      )}
    </div>
  );
}
