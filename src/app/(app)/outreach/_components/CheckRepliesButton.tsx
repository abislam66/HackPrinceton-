"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui/Button";

/** Reloads the page, which pulls new replies from Gmail (at most every 30 s, src/features/outreach/store.ts). */
export function CheckRepliesButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button onClick={() => startTransition(() => router.refresh())} pending={pending} pendingLabel="Checking…">
      Check for replies
    </Button>
  );
}
