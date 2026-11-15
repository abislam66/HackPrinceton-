import type { OutreachMessage } from "./schema";

/*
 * Where proposal links point. PUBLIC_BASE_URL wins when set. Otherwise, on Vercel, production links use the
 * project's production domain and preview deployments their own URL, so a deploy never mails out a localhost link.
 * Localhost is only the last resort, for local dev.
 */

const LOCAL_BASE = "http://localhost:3000";

function withScheme(host: string): string {
  return /^https?:\/\//.test(host) ? host : `https://${host}`;
}

/** The origin proposal links are built on, without a trailing slash. */
export function publicBaseUrl(): string {
  const explicit = process.env.PUBLIC_BASE_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  const production = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (process.env.VERCEL_ENV === "production" && production) return withScheme(production).replace(/\/+$/, "");
  const deployment = process.env.VERCEL_URL?.trim();
  if (deployment) return withScheme(deployment).replace(/\/+$/, "");
  if (production) return withScheme(production).replace(/\/+$/, "");
  return LOCAL_BASE;
}

/** The stakeholder's proposal page, tagged so opens tie back to the email. */
export function proposalUrlFor(clientId: string): string {
  return `${publicBaseUrl()}/proposals/${encodeURIComponent(clientId)}?ref=email`;
}

function isLocalOrigin(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
  } catch {
    return false;
  }
}

/**
 * A stored draft written while the link pointed at localhost, moved onto the current base: the link and every copy
 * of it in the body. Sent messages are left as they went out. A message whose link is fine comes back unchanged.
 */
export function repairProposalLink(message: OutreachMessage): OutreachMessage {
  if (message.status === "sent" || !isLocalOrigin(message.proposalUrl)) return message;
  const fixed = proposalUrlFor(message.clientId);
  if (fixed === message.proposalUrl) return message;
  return { ...message, proposalUrl: fixed, body: message.body.split(message.proposalUrl).join(fixed) };
}
