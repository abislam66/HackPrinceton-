// Browser-side tracking helpers. Must not import server code.

let currentSession: string | null = null;

/** One id per page load, so opens and watch time from one visit can be grouped. */
export function sessionId(): string {
  if (!currentSession) {
    currentSession =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
  return currentSession;
}

/** Fire-and-forget POST to /api/track. Uses navigator.sendBeacon with a JSON Blob, falls back to fetch with keepalive. Never throws. Adds `session` to the payload. */
export function sendEvent(event: {
  clientId: string;
  type: "open" | "watch" | "click";
  payload?: Record<string, string | number | boolean>;
}): void {
  try {
    const body = JSON.stringify({
      clientId: event.clientId,
      type: event.type,
      payload: { ...event.payload, session: sessionId() },
    });
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      const sent = navigator.sendBeacon("/api/track", new Blob([body], { type: "application/json" }));
      if (sent) return;
    }
    if (typeof fetch === "function") {
      fetch("/api/track", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
        keepalive: true,
      }).catch(() => {});
    }
  } catch {
    // Tracking must never break the page.
  }
}
