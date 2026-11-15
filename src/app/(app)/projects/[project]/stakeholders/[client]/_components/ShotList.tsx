"use client";

import { useMemo } from "react";
import { Button } from "@/components/ui/Button";
import { CameraPathPlan, planFootprint } from "@/components/ui/CameraPathPlan";
import { MediaList, MediaRow } from "@/components/ui/MediaRow";
import type { CameraPath, Shot } from "@/features/shots/schema";
import { cx } from "@/lib/cx";
import { pathDuration } from "@/features/viewer/camera-paths";
import { formatClock, sideLabel } from "@/features/workspace/format";

/** The id the Pitch video row selects. Never a shot id (those come from the shot compiler). */
export const PITCH_VIDEO_ID = "pitch-video";

type Props = {
  shots: Shot[];
  /**
   * The proposal page's film: the shots as one flight (planReel), with each cut's length in seconds. It may hold
   * fewer shots than the list: the reel drops some to stay under 30 s. Null when there is nothing to play.
   */
  reel: { path: CameraPath; duration: number; cuts: number[] } | null;
  selectedId: string | undefined;
  onSelect: (id: string) => void;
  /** Omitted when regenerating isn't allowed (a sent proposal). */
  onRegenerate?: () => void;
};

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * The pitch video's leading visual, the same 72 x 48 as a shot's plan so the rows line up: a film frame with a play
 * mark, and a strip of the reel's cuts drawn to their lengths. Decorative; the row carries the name.
 */
function ReelTile({ cuts }: { cuts: number[] }) {
  const total = cuts.reduce((sum, d) => sum + d, 0) || 1;
  return (
    <span aria-hidden className="pointer-events-none relative flex h-12 w-[72px] flex-none select-none flex-col bg-asphalt">
      <span className="flex flex-1 items-center justify-center">
        {/* A triangle reads off-centre when centred by its box; nudge it toward its point. */}
        <svg width="12" height="14" viewBox="0 0 12 14" className="ml-0.5 fill-cone">
          <path d="M0 0 L12 7 L0 14 Z" />
        </svg>
      </span>
      <span className="flex h-1 gap-px px-1.5 pb-1.5">
        {cuts.map((d, i) => (
          <span key={i} className={cx("h-1 rounded-[1px]", i === 0 ? "bg-cone" : "bg-[rgba(var(--tm-stucco-rgb),0.45)]")} style={{ flexGrow: d / total }} />
        ))}
      </span>
    </span>
  );
}

/**
 * The side panel's shot list. On top, set apart, the pitch video: every shot as the one flight the proposal page
 * plays. Under a rule and a label, the single shots: one 72 px row each, led by a plan of its camera path. Shot names
 * run long, so they take two lines. Selecting drives the viewer.
 */
export function ShotList({ shots, reel, selectedId, onSelect, onRegenerate }: Props) {
  // Every plan shares one footprint, so the paths compare across the list.
  const footprint = useMemo(() => planFootprint(shots), [shots]);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      {reel ? (
        <MediaList label="Pitch video">
          <MediaRow
            size={72}
            media={<ReelTile cuts={reel.cuts} />}
            title="Pitch video"
            meta={
              <>
                <span className="app-num">
                  {reel.cuts.length === shots.length ? `All ${shots.length}` : `${reel.cuts.length} of ${shots.length}`}
                </span>{" "}
                shots · as on the proposal
              </>
            }
            selected={selectedId === PITCH_VIDEO_ID}
            onClick={() => onSelect(PITCH_VIDEO_ID)}
          >
            <span className="app-num">{formatClock(reel.duration)}</span>
          </MediaRow>
        </MediaList>
      ) : null}
      {/* A panel-strength rule (rows inside a group use the lighter divider) and a label: a new group starts here. */}
      <h3
        className={cx("flex items-baseline justify-between px-5 pt-4 pb-2 text-xs leading-4 text-muted", reel && "border-t border-line")}
      >
        <span>Single shots</span>
        <span className="app-num">{shots.length}</span>
      </h3>
      <MediaList as="ol" label="Single shots">
        {shots.map((shot, i) => (
          <MediaRow
            key={shot.id}
            size={72}
            media={<CameraPathPlan keyframes={shot.camera.keyframes} footprint={footprint} />}
            title={shot.name}
            titleLines={2}
            meta={
              <>
                <span className="app-num">{pad(i + 1)}</span> · {sideLabel(shot.side)}
              </>
            }
            selected={shot.id === selectedId}
            onClick={() => onSelect(shot.id)}
          >
            <span className="app-num">{formatClock(pathDuration(shot.camera))}</span>
          </MediaRow>
        ))}
      </MediaList>
      {onRegenerate ? (
        <div className="border-t border-divider px-5 py-3">
          {/* Tertiary pads its label 12 px; pull it back so the words line up with the rows' 20 px edge. */}
          <Button variant="tertiary" className="-ml-3" onClick={onRegenerate}>
            Regenerate shots and pitch
          </Button>
        </div>
      ) : null}
    </div>
  );
}
