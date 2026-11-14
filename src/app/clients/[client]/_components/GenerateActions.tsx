"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition, type ReactNode } from "react";
import { Button } from "@/components/Button";

type Result = { kind: "idle" } | { kind: "unavailable" } | { kind: "failed"; detail: string };

/**
 * The action row with a Generate button at the end. `children` are the other actions.
 * Generate posts to the generation route once at a time and refreshes the page on success.
 */
export function GenerateActions({ clientId, children }: { clientId: string; children?: ReactNode }) {
  const router = useRouter();
  const inFlight = useRef(false);
  const [busy, setBusy] = useState(false);
  const [refreshing, startRefresh] = useTransition();
  const [result, setResult] = useState<Result>({ kind: "idle" });

  async function generate() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setResult({ kind: "idle" });
    try {
      const res = await fetch(`/api/proposals/${encodeURIComponent(clientId)}/generate`, { method: "POST" });
      if (res.ok) {
        startRefresh(() => router.refresh());
        return;
      }
      if (res.status === 501) {
        setResult({ kind: "unavailable" });
        return;
      }
      const body: unknown = await res.json().catch(() => null);
      const error = body && typeof body === "object" && "error" in body && typeof body.error === "string" ? body.error : `Status ${res.status}`;
      setResult({ kind: "failed", detail: error });
    } catch (error) {
      setResult({ kind: "failed", detail: (error as Error).message });
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  const pending = busy || refreshing;

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {children}
        <Button arrow={false} compact disabled={pending} aria-disabled={pending} onClick={generate}>
          {pending ? "Generating" : "Generate"}
        </Button>
      </div>
      <p role="status" className="tm-text--s mt-4 max-w-[66ch] empty:hidden">
        {result.kind === "unavailable" ? "Generation is not connected yet. This is the prepared draft." : null}
        {result.kind === "failed" ? `Generation failed. ${result.detail}` : null}
      </p>
    </div>
  );
}
