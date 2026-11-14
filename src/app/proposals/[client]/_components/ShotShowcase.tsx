"use client";

import { useState } from "react";
import { Cell, Cells } from "@/components/Cell";
import type { ModelInfo } from "@/features/model/schema";
import type { Shot } from "@/features/shots/schema";
import { sendEvent } from "@/features/tracking/client";
import { ModelViewer } from "@/features/viewer/ModelViewer";

type Props = {
  model: ModelInfo;
  /** At least one shot. The page hides the section when there are none. */
  shots: Shot[];
  clientId: string;
  /** Off for internal previews, so they do not count as clicks. */
  track: boolean;
};

const sentence = (value: string) => (value ? value.charAt(0).toUpperCase() + value.slice(1) : value);

/** The shot list: the selected shot's camera move playing on the model, a picker, and the crew details. */
export function ShotShowcase({ model, shots, clientId, track }: Props) {
  const [selectedId, setSelectedId] = useState(shots[0]?.id);
  const selected = shots.find((shot) => shot.id === selectedId) ?? shots[0];
  if (!selected) return null;

  const pick = (shot: Shot) => {
    if (shot.id === selected.id) return;
    setSelectedId(shot.id);
    if (track) sendEvent({ clientId, type: "click", payload: { target: `shot:${shot.id}` } });
  };

  const specs = [
    { label: "Platform", value: sentence(selected.platform) },
    { label: "Lens", value: selected.lens },
    { label: "Time of day", value: selected.timeOfDay },
    { label: "Phase", value: selected.constructionPhase },
    { label: "Side", value: sentence(selected.side) },
  ];

  return (
    <div className="tm-grid gap-y-8">
      {/* Media: the canvas is dark and stays outside the ground classes. */}
      <ModelViewer
        model={model}
        path={selected.camera}
        loop
        className="col-span-full aspect-video w-full tab:col-span-8 desk:col-span-8"
      />

      <div className="col-span-full tab:col-span-8 desk:col-span-4 desk:border-l desk:border-rule desk:pl-(--tm-gutter)">
        <Cells role="group" aria-label="Shots">
          {shots.map((shot) => (
            <Cell key={shot.id} pressed={shot.id === selected.id} onClick={() => pick(shot)}>
              {shot.name}
            </Cell>
          ))}
        </Cells>

        <div aria-live="polite">
          <p className="tm-body mt-8 max-w-[66ch]">{selected.description}</p>
          <dl className="mt-8 border-t border-rule pt-5">
            {specs.map((spec) => (
              <div key={spec.label} className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-x-(--tm-gutter) not-first:mt-3">
                <dt className="tm-label tm-muted pt-1">{spec.label}</dt>
                <dd className="tm-text--m">{spec.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </div>
  );
}
