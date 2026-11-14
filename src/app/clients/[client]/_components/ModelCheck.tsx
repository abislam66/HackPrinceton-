"use client";

import { useState } from "react";
import { Cell, Cells } from "@/components/Cell";
import type { ModelInfo } from "@/features/model/schema";
import type { CameraPath } from "@/features/shots/schema";
import { ModelViewer } from "@/features/viewer/ModelViewer";
import { teaserPath } from "@/features/viewer/camera-paths";

type Props = {
  model: ModelInfo;
  shots: { id: string; name: string; camera: CameraPath }[];
};

const OPENING = "opening";

/** The shared viewer with a picker: the proposal's opening move, then each shot's camera path. */
export function ModelCheck({ model, shots }: Props) {
  const [selected, setSelected] = useState<string>(OPENING);
  const shot = shots.find((s) => s.id === selected);
  const path = shot ? shot.camera : teaserPath(model.boundingBox);

  return (
    <div>
      <ModelViewer model={model} path={path} loop className="aspect-video w-full" />
      <Cells className="mt-4" aria-label="Camera path">
        <Cell pressed={!shot} onClick={() => setSelected(OPENING)}>
          Opening
        </Cell>
        {shots.map((s) => (
          <Cell key={s.id} pressed={s.id === shot?.id} onClick={() => setSelected(s.id)}>
            {s.name}
          </Cell>
        ))}
      </Cells>
    </div>
  );
}
