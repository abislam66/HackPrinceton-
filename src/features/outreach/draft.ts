import "server-only";
import { AgentError } from "@/lib/agent/research";
import { structured } from "@/lib/agent/structured";
import { loadClient, loadProject } from "@/features/project/load";
import type { Client, Project } from "@/features/project/schema";
import type { Pitch } from "@/features/pitch/schema";
import { getProposal } from "@/features/proposal/store";
import { proposalUrlFor } from "./link";
import { emailDraftSchema, type EmailDraft } from "./schema";

/*
 * Writes the outreach email for one stakeholder: the Tradesmark team to the contact, about this
 * building and that stakeholder's need, linking their proposal page. Live through the model when
 * it answers; otherwise a deterministic template from the same data, so the demo never stalls.
 */

/** Leaves the draft and send routes (maxDuration 60) room to store and answer. */
const DRAFT_TIMEOUT_MS = 40_000;

export type DraftSource = "live" | "template";

export type DraftedEmail = {
  client: Client;
  project: Project;
  proposalUrl: string;
  draft: EmailDraft;
  source: DraftSource;
};

type DraftInput = { client: Client; project: Project; pitch: Pitch | null; proposalUrl: string };

export { proposalUrlFor } from "./link";

/** The body with the proposal link in it verbatim; appended on its own line when missing. */
export function ensureUrl(body: string, url: string): string {
  if (body.includes(url)) return body;
  return `${body.trimEnd()}\n\nThe proposal: ${url}`;
}

const BANNED: [RegExp, string][] = [
  [/\$/, "mentions money ($)"],
  [/\b(price|prices|pricing|cost|costs|quote|quotes|fee|fees|budget|rate|rates|discount)\b/i, "mentions pricing"],
  [/\b(scope of work|deliverables?|guarantee\w*)\b/i, "promises scope"],
  [/!/, "uses an exclamation mark"],
  [/[–—]/, "uses an em or en dash"],
];

/** Copy problems in a draft; empty means it may be stored. Pure. */
export function checkDraft(draft: EmailDraft, proposalUrl: string): string[] {
  const text = `${draft.subject}\n${draft.body.replace(proposalUrl, "")}`;
  const problems = BANNED.filter(([pattern]) => pattern.test(text)).map(([, reason]) => reason);
  const words = wordCount(draft.body.replace(proposalUrl, ""));
  if (words > 200) problems.push(`is ${words} words; keep it under 170`);
  return problems;
}

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

/** "a and b", "a, b, and c"; a serial comma too when an item has its own "and". */
function listOf(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  const comma = items.length > 2 || items.some((item) => / and /.test(item)) ? "," : "";
  return `${items.slice(0, -1).join(", ")}${comma} and ${items[items.length - 1]}`;
}

/** "1601 N Broad St, Philadelphia, PA (Broad Street and ...), Temple ..." -> "1601 N Broad St, Philadelphia, PA". */
function shortAddress(address: string): string {
  return address.split(" (")[0].trim();
}

const NEED_LINE: Record<Client["need"], string> = {
  documentation: "You need a clear record of the work, filmed and dated.",
  "self-promotion": "You want work like this in front of the people who hire you.",
  recruiting: "You want people to see what it is like to build with your team.",
  "sales-and-bids": "You are bidding on the next round of work and need proof of craft on a building reviewers recognize.",
  "investor-and-owner-updates": "Your investors and owners want to see the building, not read about it.",
  "community-and-pr": "You want people to see what this building opens up for the campus and the neighborhood.",
};

/** The deterministic email, from the same data the model gets. Pure. */
export function templateDraft({ client, project, proposalUrl }: DraftInput): EmailDraft {
  const focus = client.focusElements.length > 0 ? ` The plan centers on ${listOf(client.focusElements)}.` : "";
  const body = [
    `Hi ${client.contact.name},`,
    `Tradesmark films and documents construction projects. We have a plan for how to capture ${project.name}, at ${shortAddress(project.address)}, for ${client.company}, and we built a proposal page to show it.`,
    `${NEED_LINE[client.need]}${focus}`,
    `The page opens with a fly-up of the building and walks through the shots we would plan:\n${proposalUrl}`,
    "If it looks useful, reply to this email or send a time that suits you for a short call.",
    "Best,\nThe Tradesmark team",
  ].join("\n\n");
  const subject = `${project.name}: a film plan for ${client.company}`;
  return emailDraftSchema.parse({ subject: subject.length > 120 ? `${subject.slice(0, 119)}…` : subject, body });
}

const SYSTEM = `You write one short outreach email from the Tradesmark team. Tradesmark films and documents construction projects. Each stakeholder on a building gets a bespoke proposal page; this email introduces that page to one contact and links it. The message is "we have a plan for your specific building, and we are suited to capture it", never a generic "check out our website".

Write:
- subject: under 70 characters, names the building, plain. No clickbait.
- body: plain text, about 110 to 170 words, short paragraphs separated by blank lines.
  - Greet the contact by the name given.
  - Say who Tradesmark is in one line.
  - Name the building and where it is, and connect it to this stakeholder's need in their terms.
  - Name one or two of the stakeholder's focus elements as what the film holds on.
  - Put the proposal URL on its own line, exactly as given, character for character.
  - Invite a reply or a short call. One ask, no pressure.
  - Sign off as "The Tradesmark team".

Rules:
- Use only facts in the brief. Never invent features, numbers, dates, awards, past clients or results.
- A stakeholder's own capabilities in the notes are theirs, not claims about this building.
- No pricing, costs, fees, quotes, rates or budgets. No scope of work, deliverable counts, guarantees or timelines.
- Do not describe or mention the stakeholder's photos or images.
- Plain, specific words. No exclamation marks, no em or en dashes, no markdown, no marketing words (elevate, cutting-edge, seamless, world-class, unparalleled and the like).`;

async function liveDraft(input: DraftInput): Promise<EmailDraft> {
  const { client, project, pitch, proposalUrl } = input;
  const brief = {
    from: "The Tradesmark team",
    to: { name: client.contact.name, title: client.contact.title, company: client.company },
    stakeholder: {
      role: client.role,
      need: client.need,
      needsNotes: client.needsNotes,
      focusElements: client.focusElements,
    },
    building: {
      name: project.name,
      address: project.address,
      buildingType: project.buildingType,
      scopeType: project.scopeType,
      timeline: project.timeline,
      summary: project.summary,
    },
    proposalPage: pitch
      ? { headline: pitch.headline, problem: pitch.problem, solution: pitch.solution }
      : "not generated yet; describe it only as a proposal page for this building",
    proposalUrl,
  };
  const user = `Write the email for this brief:\n${JSON.stringify(brief, null, 2)}`;
  const options = { job: "draft" as const, effort: "low" as const, maxTokens: 4000, signal: AbortSignal.timeout(DRAFT_TIMEOUT_MS) };

  let draft = await structured(emailDraftSchema, SYSTEM, user, options);
  let problems = checkDraft(draft, proposalUrl);
  if (problems.length > 0) {
    const retry = `${user}\n\nYour previous email broke these rules:\n- ${problems.join("\n- ")}\nRewrite it so none apply.`;
    draft = await structured(emailDraftSchema, SYSTEM, retry, options);
    problems = checkDraft(draft, proposalUrl);
  }
  if (problems.length > 0) throw new AgentError(`Email failed the copy rules: ${problems.join("; ")}`);
  return draft;
}

/**
 * Drafts the email for one stakeholder. Null when the client is unknown. Falls back to the
 * template when the model is unavailable or its copy breaks the rules.
 */
export async function draftEmail(clientId: string): Promise<DraftedEmail | null> {
  const client = await loadClient(clientId);
  if (!client) return null;
  const [project, proposal] = await Promise.all([
    loadProject(),
    getProposal(clientId).catch((error: unknown) => {
      console.error(`draftEmail(${clientId}): could not load the proposal, drafting without the pitch.`, error);
      return null;
    }),
  ]);
  const proposalUrl = proposalUrlFor(clientId);
  const input: DraftInput = { client, project, pitch: proposal?.pitch ?? null, proposalUrl };

  let draft: EmailDraft;
  let source: DraftSource = "live";
  try {
    draft = await liveDraft(input);
  } catch (error) {
    console.warn(`draftEmail(${clientId}): using the template (${(error as Error).message})`);
    draft = templateDraft(input);
    source = "template";
  }
  const body = ensureUrl(draft.body, proposalUrl);
  return { client, project, proposalUrl, draft: { subject: draft.subject.trim(), body }, source };
}
