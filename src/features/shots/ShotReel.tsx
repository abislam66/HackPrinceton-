"use client";

import { useEffect, useMemo, useState } from "react";
import type { ModelInfo } from "@/features/model/schema";
import { ModelViewer } from "@/features/viewer/ModelViewer";
import { cutAt, MAX_REEL_SECONDS, planReel } from "./reel";
import type { Shot } from "./schema";

type Props = {
  model: ModelInfo;
  shots: Shot[];
  /** Captions by shot id (the pitch's shotCaptions); shown with each shot when given. */
  captions?: Record<string, string>;
  maxSeconds?: number;
  /** Start over after the last shot. When false the camera circles the model after the reel. */
  loop?: boolean;
  /** Passed to ModelViewer. Off by default: grabbing the model would stop the reel. */
  interactive?: boolean;
  className?: string;
};

/**
 * The pitch reel: the client's shots as one smooth flight, at most 30 s. The camera flows from
 * each shot into the next; the caption and counter follow the shot being shown.
 */
export function ShotReel({
  model,
  shots,
  captions,
  maxSeconds = MAX_REEL_SECONDS,
  loop = true,
  interactive = false,
  className,
}: Props) {
  const reel = useMemo(() => planReel(shots, model.boundingBox, maxSeconds), [shots, model.boundingBox, maxSeconds]);
  const [index, setIndex] = useState(0);

  // Follow the reel's clock for the caption. The viewer plays the path on its own clock; both
  // start on mount and share the duration, so a few ms of drift is all that can build up.
  useEffect(() => {
    if (reel.duration <= 0) return;
    const started = performance.now();
    const tick = window.setInterval(() => {
      const elapsed = (performance.now() - started) / 1000;
      const t = loop ? elapsed % reel.duration : Math.min(elapsed, reel.duration);
      const cut = cutAt(reel, t);
      setIndex(cut ? reel.cuts.indexOf(cut) : 0);
    }, 100);
    return () => window.clearInterval(tick);
  }, [reel, loop]);

  if (!reel.path) return null;
  const cut = reel.cuts[index];
  const caption = cut ? (captions?.[cut.shot.id] ?? cut.shot.name) : "";
  return (
    <div className={className}>
      <ModelViewer model={model} path={reel.path} loop={loop} interactive={interactive} className="absolute inset-0" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-4 p-4">
        <p className="tm-text--s max-w-[60ch] text-white drop-shadow" aria-live="polite">
          {caption}
        </p>
        <p className="tm-label tm-num shrink-0 text-white/80 drop-shadow">
          {index + 1} / {reel.cuts.length}
        </p>
      </div>
    </div>
  );
}
