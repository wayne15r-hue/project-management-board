"use client";

import { createContext, useContext, useEffect, useRef, useState, useSyncExternalStore } from "react";

const preferenceKey = "helios-reduce-motion";
const preferenceChanged = "helios-motion-preference-changed";
const motionQuery = "(prefers-reduced-motion: reduce)";
const readSystem = () => window.matchMedia(motionQuery).matches;
const serverDefault = () => false;
const clientReady = () => true;
const noSubscription = () => () => {};
const AmbientMotion = createContext(false);

function subscribeToSystem(change: () => void) {
  const media = window.matchMedia(motionQuery);
  media.addEventListener("change", change);
  return () => media.removeEventListener("change", change);
}

function readPreference() {
  try {
    return localStorage.getItem(preferenceKey) === "true";
  } catch {
    return false;
  }
}

export function SolarMotion({ children, footer }: { children: React.ReactNode; footer: React.ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  const ready = useSyncExternalStore(noSubscription, clientReady, serverDefault);
  const systemReduced = useSyncExternalStore(subscribeToSystem, readSystem, serverDefault);
  const [localReduced, setLocalReduced] = useState<boolean>();
  const storedReduced = useSyncExternalStore(subscribeToPreference, readPreference, serverDefault);
  const reduced = systemReduced || (localReduced ?? storedReduced);

  useEffect(() => {
    const page = root.current;
    if (!page || !ready || reduced) return;

    const scenes = [...page.querySelectorAll<HTMLElement>("[data-solar-scene]")];
    let frame: number | null = null;
    function schedule() {
      if (document.hidden || frame !== null) return;
      frame = requestAnimationFrame(() => {
        frame = null;
        const height = window.innerHeight;
        const positions = scenes.map((scene) => {
          const bounds = scene.getBoundingClientRect();
          const progress = (height - bounds.top) / (height + bounds.height);
          return Math.max(-1, Math.min(1, progress * 2 - 1)).toFixed(4);
        });
        scenes.forEach((scene, index) => scene.style.setProperty("--scene-travel", positions[index]));
      });
    }
    function updateVisibility() {
      if (document.hidden && frame !== null) {
        cancelAnimationFrame(frame);
        frame = null;
      }
      page?.toggleAttribute("data-motion-hidden", document.hidden);
      schedule();
    }

    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    document.addEventListener("visibilitychange", updateVisibility);
    const resize = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedule);
    resize?.observe(page);
    updateVisibility();
    return () => {
      if (frame !== null) cancelAnimationFrame(frame);
      resize?.disconnect();
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      document.removeEventListener("visibilitychange", updateVisibility);
      page.removeAttribute("data-motion-hidden");
      scenes.forEach((scene) => scene.style.removeProperty("--scene-travel"));
    };
  }, [ready, reduced]);

  return (
    <div ref={root} className="solar-page" data-reduced-motion={ready ? reduced : undefined}>
      <AmbientMotion.Provider value={ready && !reduced}>{children}</AmbientMotion.Provider>
      <footer className="solar-footer solar-container">
        {footer}
        <div className="solar-motion-preferences" hidden={!ready}>
          <label>
            <input
              type="checkbox"
              checked={reduced}
              disabled={systemReduced}
              onChange={(event) => {
                const checked = event.currentTarget.checked;
                try {
                  localStorage.setItem(preferenceKey, String(checked));
                  setLocalReduced(undefined);
                  window.dispatchEvent(new Event(preferenceChanged));
                } catch {
                  setLocalReduced(checked);
                }
              }}
            />
            Reduce motion
          </label>
          {systemReduced && <span>On in your device settings</span>}
        </div>
      </footer>
    </div>
  );
}

export function SolarEclipseVideo() {
  const enabled = useContext(AmbientMotion);
  return enabled ? <EclipseLoop /> : null;
}

function EclipseLoop() {
  const [playing, setPlaying] = useState(false);
  const video = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const element = video.current;
    if (!element) return;
    function updatePlayback() {
      if (document.hidden) element?.pause();
      else void element?.play().catch(() => {});
    }
    updatePlayback();
    document.addEventListener("visibilitychange", updatePlayback);
    return () => document.removeEventListener("visibilitychange", updatePlayback);
  }, []);

  return (
    <video
      ref={video}
      className="solar-eclipse-video"
      data-playing={playing}
      src="/landing/eclipse.webm"
      poster="/landing/eclipse.webp"
      muted
      loop
      playsInline
      aria-hidden="true"
      onPlaying={() => setPlaying(true)}
      onError={() => setPlaying(false)}
    />
  );
}

function subscribeToPreference(change: () => void) {
  window.addEventListener("storage", change);
  window.addEventListener(preferenceChanged, change);
  return () => {
    window.removeEventListener("storage", change);
    window.removeEventListener(preferenceChanged, change);
  };
}
