import { MediaList, MediaRow } from "@/components/ui/MediaRow";
import { Panel } from "@/components/ui/Panel";
import { Tag, type TagTone } from "@/components/ui/Tag";
import { DELIVERABLES, MILESTONES, type Deliverable, type MilestoneStatus } from "@/features/demo/progress";

const STATUS: Record<MilestoneStatus, { label: string; tone: TagTone }> = {
  done: { label: "Done", tone: "pass" },
  scheduled: { label: "Scheduled", tone: "ready" },
  planned: { label: "Planned", tone: "neutral" },
};

const KIND: Record<Deliverable["kind"], string> = { film: "Film", photos: "Photos" };

export default function ProgressPage() {
  const done = MILESTONES.filter((m) => m.status === "done").length;

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-muted">After a stakeholder signs, shoots and deliverables are tracked here.</p>

      <div className="grid items-start gap-6 @4xl:grid-cols-[minmax(0,1fr)_320px]">
        <Panel title="Timeline" count={`${done} of ${MILESTONES.length} done`} flush>
          <ol className="app-rows">
            {MILESTONES.map((m) => {
              const status = STATUS[m.status];
              return (
                <li key={m.title} className="flex items-center gap-4 px-5 py-3 text-sm">
                  <span className="app-num w-28 shrink-0 text-muted">{m.date}</span>
                  <span className="min-w-0 flex-1 truncate" title={m.title}>
                    {m.title}
                  </span>
                  {/* One width for every status, so the tags line up down the list. */}
                  <span className="flex w-20 shrink-0">
                    <Tag tone={status.tone}>{status.label}</Tag>
                  </span>
                </li>
              );
            })}
          </ol>
        </Panel>

        {/* What each deliverable is. When it's due is the timeline's job, so the date shows once. */}
        <Panel title="Deliverables" count={DELIVERABLES.length} flush>
          <MediaList>
            {DELIVERABLES.map((d) => (
              <MediaRow key={d.title} title={d.title} meta={KIND[d.kind]}>
                <span className="app-num text-xs whitespace-nowrap">{d.detail}</span>
              </MediaRow>
            ))}
          </MediaList>
        </Panel>
      </div>
    </div>
  );
}
