"use client";

import { useEffect, useRef } from "react";
import { sendEvent } from "./client";

const FLUSH_EVERY_MS = 5000;

/**
 * Sends one `open` per page load, then `watch` events with the whole seconds the tab was visible.
 * Renders nothing. Leave it out of internal previews so they do not count.
 */
export function ProposalTracker({ clientId }: { clientId: string }) {
  // StrictMode runs effects twice in dev on the same instance; the ref survives, so only one open is sent.
  const opened = useRef(false);

  useEffect(() => {
    if (!opened.current) {
      opened.current = true;
      sendEvent({ clientId, type: "open" });
    }

    let visibleSince: number | null = document.visibilityState === "visible" ? performance.now() : null;
    let carryMs = 0;

    const flush = () => {
      const now = performance.now();
      if (visibleSince !== null) {
        carryMs += now - visibleSince;
        visibleSince = now;
      }
      const seconds = Math.floor(carryMs / 1000);
      if (seconds < 1) return;
      carryMs -= seconds * 1000;
      sendEvent({ clientId, type: "watch", payload: { seconds } });
    };

    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        flush();
        visibleSince = null;
      } else if (visibleSince === null) {
        visibleSince = performance.now();
      }
    };

    const onPageHide = () => {
      flush();
      visibleSince = null;
    };

    // Back from the back-forward cache: resume counting if the tab is visible.
    const onPageShow = () => {
      if (document.visibilityState === "visible" && visibleSince === null) visibleSince = performance.now();
    };

    const timer = window.setInterval(flush, FLUSH_EVERY_MS);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("pageshow", onPageShow);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("pageshow", onPageShow);
      flush();
    };
  }, [clientId]);

  return null;
}
