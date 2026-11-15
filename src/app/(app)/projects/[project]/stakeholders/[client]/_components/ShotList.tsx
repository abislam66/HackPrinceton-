"use client";

import { Button } from "@/components/ui/Button";
import type { Shot } from "@/features/shots/schema";
import { pathDuration } from "@/features/viewer/camera-paths";
import { formatClock, sideLabel } from "@/features/workspace/format";
import { cx } from "@/lib/cx";

type Props = {
  shots: Shot[];
  selectedId: string | undefined;
  onSelect: (id: string) => void;
  /** Omitted when regenerating isn't allowed (a sent proposal). */
  onRegenerate?: () => void;
};

export function ShotList({ shots, selectedId, onSelect, onRegenerate }: Props) {
  return (
    <div className="flex flex-col gap-6">
      {/* Rows bleed to the card's edges so their ground spans the panel; text keeps 20 px. */}
      <ol className="-mx-5 flex flex-col border-t border-rule/40">
        {shots.map((shot, i) => {
          const selected = shot.id === selectedId;
          return (
            <li key={shot.id} className="border-b border-rule/40">
              <button
                type="button"
                aria-pressed={selected}
                onClick={() => onSelect(shot.id)}
                className={cx(
                  "flex w-full items-center gap-4 px-5 py-4 text-left",
                  "ease-link transition-colors duration-200 focus-visible:outline-offset-[-2px]",
                  selected ? "bg-stucco" : "hover:bg-stucco/60",
                )}
              >
                <span
                  className={cx(
                    "tm-label tm-num grid size-8 shrink-0 place-items-center",
                    selected ? "bg-cone text-asphalt" : "border border-rule",
                  )}
                >
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="tm-text--m line-clamp-2 font-semibold">{shot.name}</span>
                  <span className="tm-label tm-muted">{sideLabel(shot.side)}</span>
                </span>
                <span className="tm-text--s tm-num shrink-0">{formatClock(pathDuration(shot.camera))}</span>
              </button>
            </li>
          );
        })}
      </ol>
      {onRegenerate ? (
        <div>
          <Button variant="ghost" compact arrow={false} onClick={onRegenerate}>
            Regenerate shots and pitch
          </Button>
        </div>
      ) : null}
    </div>
  );
}
