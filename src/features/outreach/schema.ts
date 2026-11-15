import { z } from "zod";

/*
 * Outreach: an email per stakeholder that links to their proposal page, sent through Gmail.
 * During the hackathon every email is delivered to an allowlisted team inbox, never to the
 * stakeholder: `intendedFor` records who it is for, `deliveredTo` where it actually went.
 */

/** What the model writes. Plain text; the proposal link is part of the body. */
export const emailDraftSchema = z.object({
  subject: z.string().min(5).max(120),
  body: z.string().min(40).max(3000),
});
export type EmailDraft = z.infer<typeof emailDraftSchema>;

export const outreachReplySchema = z.object({
  gmailMessageId: z.string(),
  /** The From header, e.g. "Sam Lee <sam@example.com>". */
  from: z.string(),
  receivedAt: z.iso.datetime(),
  /** Gmail's snippet of the reply (first ~200 characters, plain text). */
  snippet: z.string(),
});
export type OutreachReply = z.infer<typeof outreachReplySchema>;

export const outreachStatuses = ["draft", "sent", "failed"] as const;
export type OutreachStatus = (typeof outreachStatuses)[number];

export const outreachMessageSchema = z.object({
  /** One message per stakeholder per project: `<projectSlug>--<clientId>`. Re-drafting replaces it. */
  id: z.string().regex(/^[a-z0-9-]+$/),
  projectSlug: z.string(),
  clientId: z.string().regex(/^[a-z0-9-]+$/),
  intendedFor: z.object({
    name: z.string(),
    title: z.string().nullable(),
    company: z.string(),
    /** Null when we hold no address for them, which is the normal case in the demo. */
    email: z.email().nullable(),
  }),
  /** The allowlisted inbox it was delivered to. Null until sent. */
  deliveredTo: z.email().nullable(),
  subject: z.string(),
  body: z.string(),
  /** The proposal page link in the body, tagged so opens tie back to this email. */
  proposalUrl: z.url(),
  status: z.enum(outreachStatuses),
  gmailMessageId: z.string().nullable(),
  gmailThreadId: z.string().nullable(),
  createdAt: z.iso.datetime(),
  sentAt: z.iso.datetime().nullable(),
  error: z.string().nullable(),
  /** Newest last. Filled by the reply sync. */
  replies: z.array(outreachReplySchema),
});
export type OutreachMessage = z.infer<typeof outreachMessageSchema>;

/** GET /api/outreach. */
export const outreachOverviewSchema = z.object({
  gmail: z.object({
    /** True when the Gmail credentials are set. */
    configured: z.boolean(),
    /** The sending account, once Gmail has answered. */
    account: z.email().nullable(),
    /** Where sends go during the hackathon. */
    deliverTo: z.email().nullable(),
  }),
  messages: z.array(outreachMessageSchema),
  /** When replies were last pulled from Gmail. */
  syncedAt: z.iso.datetime().nullable(),
});
export type OutreachOverview = z.infer<typeof outreachOverviewSchema>;
