import { Tag } from "@/components/Tag";
import type { Proposal } from "@/features/proposal/schema";

type Status = Proposal["status"] | null;

const labels = { draft: "Draft", approved: "Approved", sent: "Sent" } as const;

/** "Draft", "Approved", "Sent", or "No proposal" when the client has none. */
export function statusLabel(status: Status): string {
  return status ? labels[status] : "No proposal";
}

/** The proposal status as a tag: Draft line, Approved ink, Sent go, none quiet. */
export function StatusTag({ status }: { status: Status }) {
  const variant = status === "sent" ? "go" : status === "approved" ? "ink" : status === "draft" ? "line" : "quiet";
  return <Tag variant={variant}>{statusLabel(status)}</Tag>;
}

/** "sales-and-bids" reads as "Sales and bids". */
export function plain(value: string): string {
  const text = value.replaceAll("-", " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}
