import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { Tag } from "@/components/ui/Tag";
import { DOSSIER_SUMMARY } from "@/features/demo/building";
import { PROJECT_SLUG } from "@/features/project/schema";
import { loadStakeholders, type StakeholderStatus } from "@/features/workspace/status";
import { NEED_LABEL, ROLE_LABEL } from "@/lib/labels";

/** The stage → Tag mapping from docs/internal-app-ui.md. */
function StageTag({ status }: { status: StakeholderStatus }) {
  if (status.stage === "not-built") return <Tag variant="quiet">Not built</Tag>;
  if (status.stage === "ready") return <Tag variant="ink">Ready to send</Tag>;
  const { opens } = status.engagement;
  return opens > 0 ? (
    <Tag variant="go">
      <span className="tm-num">Opened · {opens}</span>
    </Tag>
  ) : (
    <Tag variant="quiet">Sent · not opened</Tag>
  );
}

export default async function ProjectStakeholdersPage() {
  const stakeholders = await loadStakeholders();
  const primaryId = stakeholders.find((s) => s.stage !== "sent")?.client.id;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_320px] items-start gap-6">
      <Card>
        <ul>
          {stakeholders.map((s) => (
            <li key={s.client.id} className="flex items-center gap-5 border-b border-rule/40 p-5 last:border-b-0">
              <Avatar name={s.client.company} />
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <p className="tm-text--m truncate font-semibold">{s.client.company}</p>
                <p className="tm-text--s tm-muted truncate">{ROLE_LABEL[s.client.role]}</p>
                <p className="tm-text--s">Needs: {NEED_LABEL[s.client.need]}</p>
              </div>
              <StageTag status={s} />
              <Button
                href={`/projects/${PROJECT_SLUG}/stakeholders/${s.client.id}`}
                variant={s.client.id === primaryId ? "primary" : "ghost"}
                compact
              >
                Open workspace
              </Button>
            </li>
          ))}
        </ul>
      </Card>

      <Card className="flex flex-col gap-6 p-5">
        <div className="flex flex-col gap-2">
          <Eyebrow>Dossier</Eyebrow>
          <p className="tm-text--s tm-muted">Research the agent gathered</p>
        </div>
        <dl className="flex flex-col gap-4">
          {DOSSIER_SUMMARY.map((fact) => (
            <div key={fact.label} className="flex flex-col gap-1">
              <dt className="tm-label tm-muted">{fact.label}</dt>
              <dd className="tm-text--m tm-num">{fact.value}</dd>
            </div>
          ))}
        </dl>
        <div>
          <Button href={`/projects/${PROJECT_SLUG}/dossier`} variant="ghost" compact>
            Open dossier
          </Button>
        </div>
      </Card>
    </div>
  );
}
