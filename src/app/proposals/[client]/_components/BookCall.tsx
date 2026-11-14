"use client";

import { Button } from "@/components/Button";
import { sendEvent } from "@/features/tracking/client";

type Props = {
  href: string;
  clientId: string;
  /** Off for internal previews, so they do not count as clicks. */
  track: boolean;
};

/** The page's one main action. A web link opens in a new tab; a mailto link opens normally. */
export function BookCall({ href, clientId, track }: Props) {
  const external = /^https?:\/\//i.test(href);
  return (
    <Button
      variant="black"
      href={href}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      onClick={() => {
        if (track) sendEvent({ clientId, type: "click", payload: { target: "book-a-call" } });
      }}
    >
      Book a call
    </Button>
  );
}
