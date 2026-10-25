"use client";

import { useEffect, useRef, useState } from "react";
import styles from "../littlelights.module.css";

type SongPlayerProps = {
  src: string;
  title: string;
};

const UNLOCK_EVENTS = ["pointerup", "touchend", "click", "keydown"] as const;

/**
 * Tries to start the song as soon as the page opens.
 * Browsers (especially iPhone Safari) may block sound until the visitor
 * touches the page, so if autoplay is refused the song starts on the
 * first tap anywhere, and a visible button is always available.
 */
export function SongPlayer({ src, title }: SongPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const userPausedRef = useRef(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const removeUnlockListeners = () => {
      UNLOCK_EVENTS.forEach((name) => document.removeEventListener(name, unlock, true));
    };

    function unlock(event: Event) {
      // The song button handles its own taps.
      if (buttonRef.current?.contains(event.target as Node)) return;
      removeUnlockListeners();
      if (!audio || userPausedRef.current || !audio.paused) return;
      audio.play().then(() => setBlocked(false)).catch(() => setBlocked(true));
    }

    audio.play().then(
      () => setBlocked(false),
      () => {
        setBlocked(true);
        UNLOCK_EVENTS.forEach((name) => document.addEventListener(name, unlock, true));
      },
    );

    return () => {
      removeUnlockListeners();
      audio.pause();
    };
  }, []);

  const toggle = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      userPausedRef.current = false;
      audio.play().then(() => setBlocked(false)).catch(() => setBlocked(true));
    } else {
      userPausedRef.current = true;
      audio.pause();
    }
  };

  return (
    <div className={styles.songPlayer}>
      <audio
        ref={audioRef}
        src={src}
        preload="auto"
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => setIsPlaying(false)}
      />
      <button
        ref={buttonRef}
        type="button"
        onClick={toggle}
        className={`${styles.songButton} ${blocked && !isPlaying ? styles.songButtonAttention : ""}`}
        aria-label={isPlaying ? `Pause the song ${title}` : `Play the song ${title}`}
      >
        <span aria-hidden="true">{isPlaying ? "❚❚" : "▶"}</span>
        {isPlaying ? "Pause the song" : blocked ? "Tap to hear the song!" : "Play the song"}
      </button>
    </div>
  );
}
