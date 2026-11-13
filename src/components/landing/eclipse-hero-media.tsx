"use client";

import Image from "next/image";
import { Pause, Play } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

const desktopMotion = "(min-width: 1024px) and (prefers-reduced-motion: no-preference)";
const poster = "/landing/eclipse.webp";

function subscribeToMotion(change: () => void) {
  const media = window.matchMedia(desktopMotion);
  media.addEventListener("change", change);
  return () => media.removeEventListener("change", change);
}

export function EclipseHeroMedia() {
  const eligible = useSyncExternalStore(
    subscribeToMotion,
    () => window.matchMedia(desktopMotion).matches,
    () => false,
  );

  return (
    <>
      <Image
        className="solar-eclipse-art"
        src={poster}
        alt=""
        width={1024}
        height={576}
        unoptimized
        loading="eager"
        fetchPriority="high"
      />
      {eligible && <EclipseVideo />}
    </>
  );
}

function EclipseVideo() {
  const video = useRef<HTMLVideoElement>(null);
  const [hasPlayed, setHasPlayed] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const media = video.current;
    if (media) void media.play().catch(() => {});
  }, []);

  function togglePlayback() {
    const media = video.current;
    if (!media) return;
    if (media.paused) void media.play().catch(() => {});
    else media.pause();
  }

  return (
    <>
      <video
        ref={video}
        className="solar-eclipse-art solar-eclipse-video"
        data-visible={hasPlayed && !failed}
        src="/landing/eclipse.webm"
        poster={poster}
        muted
        loop
        playsInline
        aria-hidden="true"
        onPlaying={() => {
          setHasPlayed(true);
          setPlaying(true);
        }}
        onPause={() => setPlaying(false)}
        onError={() => {
          setFailed(true);
          setPlaying(false);
        }}
      />
      {hasPlayed && !failed && (
        <button className="solar-motion-control" type="button" onClick={togglePlayback}>
          {playing ? <Pause size={15} aria-hidden="true" /> : <Play size={15} aria-hidden="true" />}
          {playing ? "Pause animation" : "Play animation"}
        </button>
      )}
    </>
  );
}
