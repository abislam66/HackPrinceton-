"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";

/** Adds the scouted building to Projects, then opens it, where its model can be generated. */
export function AddToProjectsButton({ candidateId }: { candidateId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const add = () => {
    setError(null);
    startTransition(async () => {
      try {
        const response = await fetch(`/api/scout/candidates/${encodeURIComponent(candidateId)}/project`, {
          method: "POST",
        });
        const body = (await response.json()) as { project?: { id: string }; error?: string };
        if (!response.ok || !body.project) {
          setError(body.error ?? "Couldn't add it. Try again.");
          return;
        }
        router.push(`/projects/${body.project.id}`);
        router.refresh();
      } catch {
        setError("Couldn't reach the server. Try again.");
      }
    });
  };

  return (
    <span className="flex flex-col items-end gap-1">
      <Button variant="primary" onClick={add} pending={pending} pendingLabel="Adding…">
        Add to projects
      </Button>
      {error ? (
        <span role="alert" className="text-[13px] leading-[18px] text-status-fail-ink">
          {error}
        </span>
      ) : null}
    </span>
  );
}
