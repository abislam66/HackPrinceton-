import { Film, Images } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { Tag, type TagVariant } from "@/components/ui/Tag";
import { DELIVERABLES, MILESTONES, type MilestoneStatus } from "@/features/demo/progress";
import { cx } from "@/lib/cx";

const STATUS: Record<MilestoneStatus, { label: string; variant: TagVariant }> = {
  done: { label: "Done", variant: "go" },
  scheduled: { label: "Scheduled", variant: "ink" },
  planned: { label: "Planned", variant: "quiet" },
};

export default function ProgressPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <p className="tm-text--s tm-muted">After a stakeholder signs, shoots and deliverables are tracked here.</p>
        <Tag variant="quiet">Sample</Tag>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_320px] items-start gap-6">
        <Card>
          <div className="border-b border-rule/40 p-5">
            <Eyebrow>Timeline</Eyebrow>
          </div>
          <ol>
            {MILESTONES.map((m) => {
              const status = STATUS[m.status];
              return (
                <li key={m.title} className="flex items-center gap-4 border-b border-rule/40 p-5 last:border-b-0">
                  <span
                    aria-hidden
                    className={cx(
                      "size-3 shrink-0 border border-asphalt",
                      m.status === "done" ? "bg-asphalt" : "bg-transparent",
                    )}
                  />
                  <span className="tm-text--m min-w-0 flex-1 truncate">{m.title}</span>
                  <span className="tm-text--s tm-muted tm-num">{m.date}</span>
                  <span className="flex w-32 justify-end">
                    <Tag variant={status.variant}>{status.label}</Tag>
                  </span>
                </li>
              );
            })}
          </ol>
        </Card>

        <Card className="flex flex-col gap-6 p-5">
          <Eyebrow>Deliverables</Eyebrow>
          <ul className="flex flex-col gap-4">
            {DELIVERABLES.map((d) => {
              const Icon = d.kind === "film" ? Film : Images;
              return (
                <li key={d.title} className="flex items-center gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center bg-stucco">
                    <Icon size={16} strokeWidth={1.5} aria-hidden />
                  </span>
                  <div className="flex min-w-0 flex-col">
                    <span className="tm-text--m tm-num">
                      {d.title} · {d.detail}
                    </span>
                    <span className="tm-text--s tm-muted">{d.due}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      </div>
    </div>
  );
}
