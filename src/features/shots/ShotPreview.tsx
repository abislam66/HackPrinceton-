"use client";

import { useState } from "react";
import type { ModelInfo } from "@/features/model/schema";
import { ModelViewer } from "@/features/viewer/ModelViewer";
import type { Shot } from "./schema";

/** Plays each shot's camera move through the shared viewer. */
export function ShotPreview({ model, shots }: { model: ModelInfo; shots: Shot[] }) {
  const [selectedId, setSelectedId] = useState(shots[0]?.id);
  const selected = shots.find((s) => s.id === selectedId) ?? shots[0];
  if (!selected) return null;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
      <ModelViewer model={model} path={selected.camera} className="aspect-video w-full overflow-hidden rounded-lg" />
      <ol className="flex flex-col gap-2">
        {shots.map((shot) => (
          <li key={shot.id}>
            <button
              type="button"
              onClick={() => setSelectedId(shot.id)}
              aria-pressed={shot.id === selected.id}
              className="w-full rounded-lg border border-zinc-800 px-4 py-3 text-left aria-pressed:border-zinc-200"
            >
              <span className="block font-medium">{shot.name}</span>
              <span className="block text-sm text-zinc-400">
                {shot.platform} · {shot.lens} · {shot.timeOfDay} · {shot.constructionPhase}
              </span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}
