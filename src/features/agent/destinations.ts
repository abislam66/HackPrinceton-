import { z } from "zod";

/*
 * Where a finished tool call's results live in the app. The Agent tab shows them as the run's Open link and as rows
 * under the reply. Built only from what the tool returned (its JSON, plus the input it was called with), never
 * guessed: a destination whose path is not a real page in src/app is dropped. Pure, so the browser can validate
 * the stream with the same schema and tests can cover every tool.
 */

export const destinationKinds = [
  "dossier",
  "model",
  "discover",
  "candidate",
  "project",
  "stakeholder",
  "outreach",
  "proposal",
] as const;
export type DestinationKind = (typeof destinationKinds)[number];

const dossierPreviewSchema = z.object({
  type: z.literal("dossier"),
  firmCount: z.number(),
  sourceCount: z.number(),
  keyFacts: z.array(z.object({ label: z.string(), value: z.string() })),
});
const modelPreviewSchema = z.object({
  type: z.literal("model"),
  /** "ready", "generating", "started" or "none", as get_project_model / generate_project_model said. */
  status: z.string(),
  generatedAt: z.string().optional(),
});
const scoutPreviewSchema = z.object({
  type: z.literal("scout"),
  candidates: z.array(z.object({ id: z.string(), name: z.string(), city: z.string(), score: z.number() })),
  total: z.number(),
});
const draftPreviewSchema = z.object({ type: z.literal("draft"), to: z.string(), subject: z.string() });

export const destinationPreviewSchema = z.discriminatedUnion("type", [
  dossierPreviewSchema,
  modelPreviewSchema,
  scoutPreviewSchema,
  draftPreviewSchema,
]);
export type DestinationPreview = z.infer<typeof destinationPreviewSchema>;

export const destinationSchema = z.object({
  kind: z.enum(destinationKinds),
  /** "Morgan Hall North dossier". */
  label: z.string(),
  /** An app path, e.g. /projects/demo-project/dossier. */
  href: z.string().startsWith("/"),
  /** The project or stakeholder it's about. */
  subject: z.string(),
  /** One line: "6 firms · 18 sources". */
  summary: z.string().optional(),
  preview: destinationPreviewSchema.optional(),
});
export type Destination = z.infer<typeof destinationSchema>;

export type DestinationContext = {
  /** Ids of projects added from scouting: their dossier lives under /projects/<id>, not /discover/<id>. */
  addedProjects?: ReadonlySet<string>;
};

const DEMO = "demo-project";
const DEMO_NAME = "Morgan Hall North";
/** A run that lists many things (every project, every stakeholder) links the first few; the reply names the rest. */
const MAX_DESTINATIONS = 8;

const SLUG = "[a-z0-9-]+";
/** Every page the agent can link to, as in src/app. Query strings are allowed on the pages that read one. */
const ROUTES: RegExp[] = [
  /^\/projects$/,
  new RegExp(`^/projects/${SLUG}$`),
  new RegExp(`^/projects/${SLUG}/dossier$`),
  new RegExp(`^/projects/${SLUG}/stakeholders/${SLUG}(\\?tab=[a-z]+)?$`),
  /^\/discover$/,
  new RegExp(`^/discover/${SLUG}$`),
  /^\/outreach(\?tab=(sent|replies|drafts))?$/,
  new RegExp(`^/proposals/${SLUG}(/shots)?(\\?preview=1)?$`),
];

/**
 * The page a tool's `page` path means, or null when there is no such page. A scouted project's model is its
 * project page's first tab (there is no /model route), so /projects/<id>/model lands there.
 */
export function appRoute(path: unknown): string | null {
  if (typeof path !== "string") return null;
  const href = path.trim().replace(new RegExp(`^(/projects/${SLUG})/model$`), "$1");
  return ROUTES.some((route) => route.test(href)) ? href : null;
}

type Json = Record<string, unknown>;
const isObject = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v.trim() : undefined);
const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** The project page for an id: the demo, a project added from scouting, or else the scout's candidate page. */
function dossierHref(projectId: string, ctx: DestinationContext): string {
  if (projectId === DEMO) return `/projects/${DEMO}/dossier`;
  if (ctx.addedProjects?.has(projectId)) return `/projects/${projectId}/dossier`;
  return `/discover/${projectId}`;
}

function scoutDestinations(result: Json): Destination[] {
  const candidates = (Array.isArray(result.candidates) ? result.candidates : []).filter(isObject).flatMap((c) => {
    const id = str(c.id);
    const name = str(c.name);
    return id && name ? [{ id, name, city: str(c.city) ?? "", score: num(c.score) ?? 0 }] : [];
  });
  const total = num(result.count) ?? candidates.length;
  const top = candidates.slice(0, 3);
  return [
    {
      kind: "discover",
      label: "Scout results in Discover",
      href: "/discover",
      subject: "Scouted projects",
      summary: plural(total, "project"),
      preview: { type: "scout", candidates: top, total },
    },
    ...top.map(
      (c): Destination => ({
        kind: "candidate",
        label: c.name,
        href: `/discover/${c.id}`,
        subject: c.name,
        summary: c.city ? `${c.city} · fit ${c.score}` : `fit ${c.score}`,
      }),
    ),
  ];
}

function dossierDestinations(result: Json, input: Json, ctx: DestinationContext): Destination[] {
  const projectId = str(result.projectId) ?? str(input.projectId);
  if (!projectId) return [];
  const name = str(result.project) ?? (projectId === DEMO ? DEMO_NAME : projectId);
  const firmCount = Array.isArray(result.firms) ? result.firms.length : 0;
  const sourceCount = num(result.sourceCount) ?? 0;
  // The tool sends key facts as "Label: value" lines.
  const keyFacts = (Array.isArray(result.keyFacts) ? result.keyFacts : []).flatMap((line) => {
    const m = typeof line === "string" ? /^([^:]+):\s*(.+)$/.exec(line) : null;
    return m ? [{ label: m[1].trim(), value: m[2].trim() }] : [];
  });
  return [
    {
      kind: "dossier",
      label: `${name} dossier`,
      href: dossierHref(projectId, ctx),
      subject: name,
      summary: `${plural(firmCount, "firm")} · ${plural(sourceCount, "source")}`,
      preview: { type: "dossier", firmCount, sourceCount, keyFacts: keyFacts.slice(0, 3) },
    },
  ];
}

function outreachDestinations(result: Json, input: Json): Destination[] {
  const clientId = str(result.clientId) ?? str(input.clientId);
  if (!clientId) return [];
  // draft_outreach says who it's for ("Name, Company"); edit_outreach_draft only has the id.
  const to = str(result.for) ?? clientId;
  const company = to.includes(", ") ? to.slice(to.lastIndexOf(", ") + 2) : to;
  const subject = str(result.subject);
  const status = str(result.status) ?? "draft";
  return [
    {
      kind: "outreach",
      label: `${company} email in Outreach`,
      href: status === "draft" ? "/outreach?tab=drafts" : "/outreach",
      subject: company,
      summary: status === "draft" ? "Draft · not sent" : status,
      preview: subject ? { type: "draft", to, subject } : undefined,
    },
    {
      kind: "stakeholder",
      label: company,
      href: `/projects/${DEMO}/stakeholders/${clientId}`,
      subject: company,
      summary: "Stakeholder page",
    },
  ];
}

function modelDestinations(tool: string, result: Json, input: Json): Destination[] {
  const projectId = str(result.projectId) ?? str(input.projectId);
  const href = appRoute(result.page);
  if (!projectId || !href) return [];
  const status = str(result.status) ?? (projectId === DEMO ? "ready" : "unknown");
  const generatedAt = str(result.generatedAt);
  return [
    {
      kind: "model",
      label: projectId === DEMO ? `${DEMO_NAME} model` : "3D model",
      href,
      subject: projectId === DEMO ? DEMO_NAME : projectId,
      summary: tool === "generate_project_model" && status === "started" ? "Generating, up to 5 minutes" : `Model ${status}`,
      preview: { type: "model", status, generatedAt },
    },
  ];
}

/** The kind a bare app path stands for. */
function kindOf(href: string): DestinationKind {
  if (href.startsWith("/proposals/")) return "proposal";
  if (href.includes("/stakeholders/")) return "stakeholder";
  if (href.endsWith("/dossier")) return "dossier";
  if (href.startsWith("/discover/")) return "candidate";
  if (href === "/discover") return "discover";
  if (href.startsWith("/outreach")) return "outreach";
  return "project";
}

/** Any `page` / `proposalPage` paths in an app tool's result: one object, or a list of them. */
function pageDestinations(result: unknown, input: Json): Destination[] {
  const items = Array.isArray(result) ? result.filter(isObject) : isObject(result) ? [result] : [];
  return items.flatMap((item) => {
    const named = str(item.name) ?? str(item.company) ?? str(item.clientId) ?? str(item.id);
    const subject = named ?? str(input.clientId) ?? str(input.projectId) ?? "";
    const out: Destination[] = [];
    const page = appRoute(item.page);
    if (page) {
      const kind = kindOf(page);
      out.push({
        kind,
        label: subject || "Open page",
        href: page,
        subject,
        summary: str(item.stage) ?? str(item.status) ?? str(item.city),
      });
    }
    const proposal = appRoute(item.proposalPage);
    if (proposal) {
      out.push({
        kind: "proposal",
        label: subject ? `${subject} proposal` : "Proposal page",
        href: proposal,
        subject,
        summary: str(item.headline),
      });
    }
    return out;
  });
}

/**
 * Where a tool call's results live, from the tool's name, the input it was called with and the text it returned.
 * Empty for an error ("Error: …"), a non-JSON answer ("No scout results yet") or a tool with nothing to open.
 */
export function destinationsFor(tool: string, input: unknown, resultText: string, ctx: DestinationContext = {}): Destination[] {
  if (resultText.trimStart().startsWith("Error:")) return [];
  let result: unknown;
  try {
    result = JSON.parse(resultText);
  } catch {
    return [];
  }
  const args = isObject(input) ? input : {};
  const obj = isObject(result) ? result : null;

  let found: Destination[];
  switch (tool) {
    case "scout_projects":
    case "get_scout_results":
      found = obj ? scoutDestinations(obj) : [];
      break;
    case "research_dossier":
    case "get_dossier":
      found = obj ? dossierDestinations(obj, args, ctx) : [];
      break;
    case "draft_outreach":
    case "edit_outreach_draft":
      found = obj ? outreachDestinations(obj, args) : [];
      break;
    case "get_project_model":
    case "generate_project_model":
      found = obj ? modelDestinations(tool, obj, args) : [];
      break;
    default:
      found = pageDestinations(result, args);
  }

  // Only real pages, each once.
  const seen = new Set<string>();
  return found
    .filter((d) => {
      const href = appRoute(d.href);
      if (!href || seen.has(href)) return false;
      seen.add(href);
      return true;
    })
    .slice(0, MAX_DESTINATIONS);
}
