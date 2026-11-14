import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { Button } from "@/components/Button";
import { Eyebrow } from "@/components/Eyebrow";
import { Heading } from "@/components/Heading";
import { SiteHeader } from "@/components/SiteHeader";
import { Tag } from "@/components/Tag";
import { loadModelInfo } from "@/features/model/load";
import { loadClient, loadProject } from "@/features/project/load";
import { loadProposal } from "@/lib/proposals";
import { markAsSent } from "../actions";
import { CopyButton } from "../_components/CopyButton";
import { BackLink, Row } from "../_components/Row";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Send" };

/** The origin the operator reached this app on, so the link works wherever the app is hosted. */
async function requestOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const local = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host);
  const proto = h.get("x-forwarded-proto")?.split(",")[0]?.trim() || (local ? "http" : "https");
  return `${proto}://${host}`;
}

export default async function SendPage({ params }: { params: Promise<{ client: string }> }) {
  const { client: id } = await params;
  const client = await loadClient(id);
  if (!client) notFound();

  const [model, project] = await Promise.all([loadModelInfo(), loadProject()]);
  const loaded = await loadProposal(client, model);
  const status = loaded?.proposal.status;
  if (status !== "approved" && status !== "sent") redirect(`/clients/${client.id}`);

  const link = `${await requestOrigin()}/proposals/${client.id}`;
  const message = `${client.contact.name},

We have a vision for ${project.name}, and we're uniquely suited to capture it. This page shows how we would film your part of the build.

${link}

Tradesmark`;

  return (
    <>
      <SiteHeader />
      <main className="flex-1 pb-32">
        <section className="tm-wrap pt-16 pb-16">
          <div className="tm-grid gap-y-8">
            <div className="col-span-full tab:col-span-2 desk:col-span-3">
              <BackLink href={`/clients/${client.id}`}>Back to review</BackLink>
            </div>
            <div className="col-span-full tab:col-span-6 tab:pl-(--tm-gutter) desk:col-span-9">
              <Eyebrow>{client.company}</Eyebrow>
              <Heading as="h1" size="l" className="mt-8">
                Send
              </Heading>
            </div>
          </div>
        </section>

        <Row label="Link">
          <p id="proposal-link" className="tm-text--m font-mono break-all">
            {link}
          </p>
          <div className="mt-6">
            <CopyButton text={link} label="Copy link" targetId="proposal-link" />
          </div>
        </Row>

        <Row label="Message">
          <div id="proposal-message" className="tm-body max-w-[66ch] border border-rule bg-sheet p-5 break-words whitespace-pre-wrap">
            {message}
          </div>
          <div className="mt-6">
            <CopyButton text={message} label="Copy message" targetId="proposal-message" />
          </div>
        </Row>

        <Row label="Decision">
          {status === "approved" ? (
            <form action={markAsSent}>
              <input type="hidden" name="client" value={client.id} />
              <Button type="submit" variant="black" arrow={false} compact>
                Mark as sent
              </Button>
            </form>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <Tag variant="go">Sent</Tag>
              <Button href="/activity" compact>
                Activity
              </Button>
            </div>
          )}
          <p className="tm-text--s tm-muted mt-4 max-w-[66ch]">Send it from your own mail. This screen sends no email.</p>
        </Row>
      </main>
    </>
  );
}
