import { PageHeader } from "@/components/ui/PageHeader";
import { getProjectRecord, loadProjectFacts } from "@/features/project-agent/store";
import { PROJECT_SLUG, type Project } from "@/features/project/schema";
import { isProjectSlug, listProjectImages } from "@/lib/project-images";
import { ViewerForm, type ViewerPrefill } from "./_components/ViewerForm";

const DESCRIPTION =
  "Enter an address and, if you have one, a photo. The generator fetches the map context, drafts a 3D viewer in the house style, and returns one HTML file you can download.";

/** The form's limit for known facts. Longer lines are cut at a word. */
const MAX_FACTS = 500;

/** One line of facts for the model: what the building is, then the work. Cut to the form's limit at a word. */
function factsLine(project: Project): string {
  const line = [project.buildingType, project.scopeType]
    .map((part) => part.trim().replace(/\.$/, ""))
    .filter(Boolean)
    .join(". ");
  if (line.length <= MAX_FACTS) return line;
  return `${line.slice(0, MAX_FACTS - 1).replace(/\s+\S*$/, "")}…`;
}

/**
 * The address as a geocoder reads it: no parenthetical notes, and only street, city and state. The project file's
 * full address ("1601 N Broad St, Philadelphia, PA (Broad Street and …), Temple University Main Campus") sends
 * Google to the campus center, 340 m away; "1601 N Broad St, Philadelphia, PA" lands on the building.
 */
function geocodableAddress(address: string): string {
  return address
    .replace(/\([^)]*\)/g, "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 3)
    .join(", ");
}

/**
 * With `?project=<slug>`, the form starts filled from that project: address, name, a facts line, and its first
 * reference photo. A project opened from a draft shares its base project's photos. Without it, the form starts empty.
 */
async function loadPrefill(slug: string): Promise<{ name: string; prefill: ViewerPrefill } | null> {
  if (!isProjectSlug(slug)) return null;
  const project = await loadProjectFacts(slug);
  if (!project) return null;
  const imagesFrom = slug === PROJECT_SLUG ? slug : ((await getProjectRecord(slug))?.basedOn ?? slug);
  const [photo] = await listProjectImages(imagesFrom);
  return {
    name: project.name,
    prefill: {
      address: geocodableAddress(project.address),
      buildingName: project.name,
      knownFacts: factsLine(project),
      photo: photo ? { url: `/api/project-images/${imagesFrom}/${photo}`, name: photo } : undefined,
    },
  };
}

export default async function BuildingViewerPage({ searchParams }: PageProps<"/building-viewer">) {
  const { project } = await searchParams;
  const slug = typeof project === "string" ? project : null;
  const loaded = slug ? await loadPrefill(slug) : null;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-10 sm:px-8">
      <PageHeader
        breadcrumbs={
          loaded && slug
            ? [
                { label: "Projects", href: "/projects" },
                { label: loaded.name, href: `/projects/${slug}` },
                { label: "Building viewer" },
              ]
            : [{ label: "Tradesmark" }]
        }
        title="Building viewer"
        description={DESCRIPTION}
      />
      {/* Keyed by project, so switching projects starts a fresh form. */}
      <ViewerForm key={slug ?? "blank"} prefill={loaded?.prefill} />
    </div>
  );
}
