"use client";

import { useEffect, useMemo, useState } from "react";
import type { ModelInfo } from "@/features/model/schema";
import { ModelViewer } from "@/features/viewer/ModelViewer";
import { MAX_REEL_SECONDS, planReel } from "./reel";
import type { Shot } from "./schema";

type Props = {
  model: ModelInfo;
  shots: Shot[];
  /** Captions by shot id (the pitch's shotCaptions); shown under each cut when given. */
  captions?: Record<string, string>;
  maxSeconds?: number;
  /** Start over after the last cut. When false the reel holds on its last frame. */
  loop?: boolean;
  /** Passed to ModelViewer. Off by default: grabbing the model would fight the cuts. */
  interactive?: boolean;
  onCut?: (shot: Shot, index: number) => void;
  className?: string;
};

/**
 * The pitch reel: the client's shots back to back with hard cuts, at most 30 s. Each cut hands
 * ModelViewer a new path, which restarts playback at t = 0 with that shot's lens.
 */
export function ShotReel({
  model,
  shots,
  captions,
  maxSeconds = MAX_REEL_SECONDS,
  loop = true,
  interactive = false,
  onCut,
  className,
}: Props) {
  const reel = useMemo(() => planReel(shots, maxSeconds), [shots, maxSeconds]);
  const [index, setIndex] = useState(0);
  const cut = reel.cuts[Math.min(index, reel.cuts.length - 1)];

  useEffect(() => {
    if (!cut) return;
    onCut?.(cut.shot, index);
    const last = index >= reel.cuts.length - 1;
    if (last && !loop) return;
    const timer = window.setTimeout(() => setIndex(last ? 0 : index + 1), cut.duration * 1000);
    return () => window.clearTimeout(timer);
  }, [cut, index, loop, onCut, reel.cuts.length]);

  if (!cut) return null;
  const caption = captions?.[cut.shot.id];
  return (
    <div className={className}>
      <ModelViewer model={model} path={cut.path} loop={false} interactive={interactive} className="absolute inset-0" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-4 p-4">
        <p className="tm-text--s max-w-[60ch] text-white drop-shadow" aria-live="polite">
          {caption ?? cut.shot.name}
        </p>
        <p className="tm-label tm-num shrink-0 text-white/80 drop-shadow">
          {index + 1} / {reel.cuts.length}
        </p>
      </div>
    </div>
  );
}
