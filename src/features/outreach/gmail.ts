import "server-only";
import { normalizeAddress } from "./address";
import type { OutreachReply } from "./schema";

export { normalizeAddress };

/*
 * The Gmail API over plain fetch, with one pre-minted refresh token (tools/gmail-token).
 * No OAuth routes, no SDK. Tokens and secrets are never logged or put in an error message.
 *
 * Safety: sendEmail refuses any recipient that is not on OUTREACH_ALLOWLIST, whatever the caller
 * passes. With no allowlist it refuses everything.
 */

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";
/** Refresh the access token this long before Google says it expires. */
const TOKEN_MARGIN_MS = 60_000;
const REQUEST_TIMEOUT_MS = 20_000;
const GMAIL_ID = /^[A-Za-z0-9_-]+$/;

export class GmailError extends Error {
  constructor(
    message: string,
    readonly status: number | null = null,
  ) {
    super(message);
    this.name = "GmailError";
  }
}

type GmailCache = {
  token: { value: string; expiresAt: number } | null;
  pendingToken: Promise<string> | null;
  account: string | null;
};
const globalStore = globalThis as typeof globalThis & { __tmGmail?: GmailCache };
const cache: GmailCache = (globalStore.__tmGmail ??= { token: null, pendingToken: null, account: null });

/** True when the OAuth client and the refresh token are set. */
export function gmailConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GMAIL_REFRESH_TOKEN);
}

/** OUTREACH_ALLOWLIST as a set of normalized addresses. Empty when unset. */
export function allowlist(): Set<string> {
  const entries = (process.env.OUTREACH_ALLOWLIST ?? "").split(",").map(normalizeAddress);
  return new Set(entries.filter((a): a is string => a !== null));
}

export function isAllowedRecipient(to: string): boolean {
  const address = normalizeAddress(to);
  return address !== null && allowlist().has(address);
}

/** OUTREACH_DELIVER_TO, normalized. Null when unset or not one plain address. */
export function getDeliverTo(): string | null {
  return normalizeAddress(process.env.OUTREACH_DELIVER_TO);
}

/** Test helper: forgets the cached access token and account. */
export function resetGmailCache(): void {
  cache.token = null;
  cache.pendingToken = null;
  cache.account = null;
}

// --- RFC 2822 message ----------------------------------------------------------------------

export type MimeInput = { from: string; fromName?: string; to: string; subject: string; body: string };

/** Header values never carry a line break: the model writes the subject. */
function oneLine(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}

function isAscii(value: string): boolean {
  return /^[\x20-\x7e]*$/.test(value);
}

/**
 * RFC 2047 encoded-words for a non-ASCII header value, folded so each word stays under 75
 * characters. Splits on code points, never inside a UTF-8 sequence. ASCII passes through.
 */
export function encodeHeaderValue(value: string): string {
  const text = oneLine(value);
  if (isAscii(text)) return text;
  const MAX_BYTES = 45; // 45 bytes is 60 base64 characters; with "=?UTF-8?B?" and "?=" that is 72.
  const words: string[] = [];
  let chunk = "";
  for (const char of text) {
    if (Buffer.byteLength(chunk + char, "utf8") > MAX_BYTES) {
      words.push(chunk);
      chunk = "";
    }
    chunk += char;
  }
  if (chunk) words.push(chunk);
  return words.map((w) => `=?UTF-8?B?${Buffer.from(w, "utf8").toString("base64")}?=`).join("\r\n ");
}

function formatFrom(address: string, name?: string): string {
  if (!name) return address;
  const display = oneLine(name);
  if (!isAscii(display)) return `${encodeHeaderValue(display)} <${address}>`;
  return `"${display.replace(/["\\]/g, "\\$&")}" <${address}>`;
}

/** The message as RFC 2822 text with CRLF line ends. Plain text, UTF-8, base64 body. Pure. */
export function buildMimeMessage({ from, fromName, to, subject, body }: MimeInput): string {
  const headers = [
    `From: ${formatFrom(oneLine(from), fromName)}`,
    `To: ${oneLine(to)}`,
    `Subject: ${encodeHeaderValue(subject)}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
  ];
  const canonical = body.replace(/\r?\n/g, "\r\n");
  const encoded = Buffer.from(canonical, "utf8").toString("base64");
  const lines = encoded.match(/.{1,76}/g) ?? [];
  return `${headers.join("\r\n")}\r\n\r\n${lines.join("\r\n")}\r\n`;
}

/** The `raw` field Gmail's send endpoint takes: the whole message, base64url. Pure. */
export function buildRawMessage(input: MimeInput): string {
  return Buffer.from(buildMimeMessage(input), "utf8").toString("base64url");
}

// --- HTTP ----------------------------------------------------------------------------------

async function readJson(response: Response): Promise<Record<string, unknown>> {
  try {
    const data: unknown = await response.json();
    return data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

async function request(url: string, init: RequestInit, what: string): Promise<Response> {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  } catch (error) {
    const reason = (error as Error).name === "TimeoutError" ? "timed out" : "could not connect";
    throw new GmailError(`${what}: ${reason}`);
  }
}

function tokenErrorMessage(status: number, body: Record<string, unknown>): string {
  const code = typeof body.error === "string" ? body.error : "";
  if (code === "invalid_grant") {
    return "Google rejected GMAIL_REFRESH_TOKEN (invalid_grant): it expired or was revoked. Testing-mode tokens last 7 days; mint a new one with tools/gmail-token.";
  }
  if (code === "invalid_client" || code === "unauthorized_client") {
    return `Google rejected GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET (${code}). Check the OAuth client in .env.local.`;
  }
  if (status >= 500) return `Google's token endpoint is unavailable (HTTP ${status}). Try again shortly.`;
  return `Could not refresh the Gmail access token (HTTP ${status}${code ? `, ${code}` : ""}).`;
}

async function fetchAccessToken(): Promise<string> {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GMAIL_REFRESH_TOKEN } = process.env;
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GMAIL_REFRESH_TOKEN) {
    throw new GmailError("Gmail is not configured: set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and GMAIL_REFRESH_TOKEN.");
  }
  const response = await request(
    TOKEN_URL,
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        refresh_token: GMAIL_REFRESH_TOKEN,
        grant_type: "refresh_token",
      }),
    },
    "Gmail token refresh",
  );
  const body = await readJson(response);
  if (!response.ok) throw new GmailError(tokenErrorMessage(response.status, body), response.status);
  const token = body.access_token;
  if (typeof token !== "string" || !token) throw new GmailError("Google's token response had no access token.");
  const expiresIn = typeof body.expires_in === "number" ? body.expires_in : 3600;
  cache.token = { value: token, expiresAt: Date.now() + expiresIn * 1000 - TOKEN_MARGIN_MS };
  return token;
}

/** A valid access token, cached until shortly before it expires. Concurrent callers share one refresh. */
async function getAccessToken(): Promise<string> {
  if (cache.token && cache.token.expiresAt > Date.now()) return cache.token.value;
  cache.pendingToken ??= fetchAccessToken().finally(() => {
    cache.pendingToken = null;
  });
  return cache.pendingToken;
}

function gmailErrorMessage(status: number, body: Record<string, unknown>, what: string): string {
  const error = body.error && typeof body.error === "object" ? (body.error as Record<string, unknown>) : {};
  const detail = typeof error.message === "string" ? `: ${error.message}` : "";
  if (status === 401) return `${what}: Gmail rejected the access token (HTTP 401)${detail}`;
  if (status === 403) {
    return `${what}: Gmail refused (HTTP 403)${detail}. Check that the Gmail API is enabled and the token has the gmail.send and gmail.readonly scopes.`;
  }
  if (status === 404) return `${what}: not found in Gmail (HTTP 404)${detail}`;
  if (status === 429) return `${what}: Gmail rate limit (HTTP 429). Try again shortly.`;
  if (status >= 500) return `${what}: Gmail is unavailable (HTTP ${status}). Try again shortly.`;
  return `${what}: Gmail error (HTTP ${status})${detail}`;
}

/** A Gmail API call with the access token. On a 401 it refreshes the token once and retries. */
async function gmail(path: string, init: RequestInit, what: string): Promise<Record<string, unknown>> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const token = await getAccessToken();
    const response = await request(
      `${GMAIL_API}${path}`,
      { ...init, headers: { ...init.headers, authorization: `Bearer ${token}` } },
      what,
    );
    const body = await readJson(response);
    if (response.ok) return body;
    if (response.status === 401 && attempt === 0) {
      cache.token = null;
      continue;
    }
    throw new GmailError(gmailErrorMessage(response.status, body, what), response.status);
  }
  throw new GmailError(`${what}: Gmail rejected the access token twice.`, 401);
}

// --- Public calls --------------------------------------------------------------------------

/** The sending account's address, cached after the first answer. */
export async function getAccount(): Promise<string> {
  if (cache.account) return cache.account;
  const body = await gmail("/profile", { method: "GET" }, "Reading the Gmail profile");
  const address = normalizeAddress(typeof body.emailAddress === "string" ? body.emailAddress : null);
  if (!address) throw new GmailError("The Gmail profile had no email address.");
  cache.account = address;
  return address;
}

/**
 * Sends one plain-text email. Refuses, before any network call, a recipient that is not one
 * plain address on OUTREACH_ALLOWLIST.
 */
export async function sendEmail({
  to,
  subject,
  body,
}: {
  to: string;
  subject: string;
  body: string;
}): Promise<{ id: string; threadId: string }> {
  const recipient = normalizeAddress(to);
  if (!recipient) throw new GmailError("Refused: the recipient must be one plain email address.");
  const allowed = allowlist();
  if (allowed.size === 0) throw new GmailError("Refused: OUTREACH_ALLOWLIST is empty, so every send is refused.");
  if (!allowed.has(recipient)) throw new GmailError(`Refused: ${recipient} is not on OUTREACH_ALLOWLIST.`);

  const from = await getAccount();
  const raw = buildRawMessage({ from, fromName: "Tradesmark", to: recipient, subject, body });
  const sent = await gmail(
    "/messages/send",
    { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ raw }) },
    "Sending the email",
  );
  if (typeof sent.id !== "string" || typeof sent.threadId !== "string") {
    throw new GmailError("Gmail accepted the send but returned no message id.");
  }
  return { id: sent.id, threadId: sent.threadId };
}

type GmailHeader = { name?: unknown; value?: unknown };
type GmailThreadMessage = {
  id?: unknown;
  snippet?: unknown;
  internalDate?: unknown;
  payload?: { headers?: GmailHeader[] };
};

/** The address inside a From header ("Sam Lee <sam@example.com>" or a bare address), lowercased. */
export function addressOf(from: string): string {
  const angled = /<([^<>]+)>\s*$/.exec(from);
  return (angled ? angled[1] : from).trim().toLowerCase();
}

/** Gmail HTML-escapes snippets. */
function decodeEntities(text: string): string {
  const named: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code: string) => {
    if (code[0] === "#") {
      const point = code[1] === "x" || code[1] === "X" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(point) && point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : match;
    }
    return named[code.toLowerCase()] ?? match;
  });
}

/** The messages in one thread that are not from `ourAddress`, oldest first. */
export async function getThreadReplies(threadId: string, ourAddress: string): Promise<OutreachReply[]> {
  if (!GMAIL_ID.test(threadId)) throw new GmailError(`Bad Gmail thread id: ${threadId}`);
  const us = ourAddress.trim().toLowerCase();
  const query = "format=metadata&metadataHeaders=From&metadataHeaders=Date";
  const thread = await gmail(`/threads/${encodeURIComponent(threadId)}?${query}`, { method: "GET" }, "Reading replies");
  const messages = Array.isArray(thread.messages) ? (thread.messages as GmailThreadMessage[]) : [];

  const replies: { at: number; reply: OutreachReply }[] = [];
  for (const message of messages) {
    const fromHeader = message.payload?.headers?.find(
      (h) => typeof h.name === "string" && h.name.toLowerCase() === "from",
    );
    const from = typeof fromHeader?.value === "string" ? fromHeader.value : "";
    if (!from || addressOf(from) === us) continue;
    const at = Number(message.internalDate);
    if (typeof message.id !== "string" || !Number.isFinite(at)) continue;
    replies.push({
      at,
      reply: {
        gmailMessageId: message.id,
        from,
        receivedAt: new Date(at).toISOString(),
        snippet: decodeEntities(typeof message.snippet === "string" ? message.snippet : ""),
      },
    });
  }
  return replies.sort((a, b) => a.at - b.at).map((r) => r.reply);
}
