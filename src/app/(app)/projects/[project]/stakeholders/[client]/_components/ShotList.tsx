"use client";

import { useMemo } from "react";
import { Button } from "@/components/ui/Button";
import { CameraPathPlan, planFootprint } from "@/components/ui/CameraPathPlan";
import { MediaList, MediaRow } from "@/components/ui/MediaRow";
import type { Shot } from "@/features/shots/schema";
import { pathDuration } from "@/features/viewer/camera-paths";
import { formatClock, sideLabel } from "@/features/workspace/format";

type Props = {
  shots: Shot[];
  selectedId: string | undefined;
  onSelect: (id: string) => void;
  /** Omitted when regenerating isn't allowed (a sent proposal). */
  onRegenerate?: () => void;
};

const pad = (n: number) => String(n).padStart(2, "0");

/*
 * MediaRow truncates its title to one line; shot names run long, so they take two here. The row keeps its 72 px:
 * two 18 px lines, the 4 px gap and the 16 px meta line fit with 8 px to spare above and below.
 */
const TWO_LINE_TITLE = "[&_.app-row-title]:line-clamp-2 [&_.app-row-title]:whitespace-normal";

/** The side panel's shot list: one 72 px row per shot, led by a plan of its camera path. Selecting drives the viewer. */
export function ShotList({ shots, selectedId, onSelect, onRegenerate }: Props) {
  // Every plan shares one footprint, so the paths compare across the list.
  const footprint = useMemo(() => planFootprint(shots), [shots]);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <MediaList as="ol" label="Shots">
        {shots.map((shot, i) => (
          <MediaRow
            key={shot.id}
            size={72}
            media={<CameraPathPlan keyframes={shot.camera.keyframes} footprint={footprint} />}
            title={shot.name}
            meta={
              <>
                <span className="app-num">{pad(i + 1)}</span> · {sideLabel(shot.side)}
              </>
            }
            selected={shot.id === selectedId}
            onClick={() => onSelect(shot.id)}
            className={TWO_LINE_TITLE}
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
