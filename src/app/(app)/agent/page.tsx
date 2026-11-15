import type { Metadata } from "next";
import { AgentChat } from "./_components/AgentChat";

export const metadata: Metadata = { title: "Agent" };

/** The agent page: a chat with the Tradesmark agent, its tool runs beside it. */
export default function AgentPage() {
  return <AgentChat />;
}
