import { PageHeader } from "@/components/ui/PageHeader";
import { ViewerForm } from "./_components/ViewerForm";

export default function BuildingViewerPage() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-10 sm:px-8">
      <PageHeader
        breadcrumbs={[{ label: "Tradesmark" }]}
        title="Building viewer"
        description="Enter an address and, if you have one, a photo. The generator fetches the map context, drafts a 3D viewer in the house style, and returns one HTML file you can download."
      />
      <ViewerForm />
    </div>
  );
}
