import type { ReactNode } from "react";
import { cx } from "@/lib/cx";

/*
 * The reference page's own chrome: sections, specimen rows and grounds. Quiet on purpose, so the components are
 * the only thing with weight on the page.
 */

export function Section({ id, title, intro, children }: { id: string; title: string; intro?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-14 border-t border-line">
      <div className="flex flex-col gap-1 px-8 pt-10 pb-2">
        <h2 id={`${id}-title`} className="text-xl font-semibold tracking-tight">
          {title}
        </h2>
        {intro ? <p className="max-w-[72ch] text-sm text-muted">{intro}</p> : null}
      </div>
      <div className="flex flex-col">{children}</div>
    </section>
  );
}

/** One specimen: its name and props on the left, the live component on its ground on the right. */
export function Specimen({ name, code, note, children }: { name: string; code?: string; note?: ReactNode; children: ReactNode }) {
  return (
    <article className="grid grid-cols-[260px_minmax(0,1fr)] gap-8 px-8 py-6 max-[960px]:grid-cols-1">
      <div className="flex min-w-0 flex-col gap-2">
        <h3 className="app-h-section">{name}</h3>
        {code ? <code className="font-mono text-xs text-muted [overflow-wrap:anywhere]">{code}</code> : null}
        {note ? <div className="text-[13px] leading-[18px] text-muted">{note}</div> : null}
      </div>
      <div className="flex min-w-0 flex-col gap-4">{children}</div>
    </article>
  );
}

export type GroundName = "plaster" | "sheet" | "asphalt";

const GROUND: Record<GroundName, string> = {
  plaster: "",
  sheet: "app-panel p-5",
  asphalt: "tm-ground-asphalt p-5",
};

/** A labelled ground: Plaster (the page itself), a Sheet panel, or the Asphalt viewer. */
export function Ground({ on, label, className, children }: { on: GroundName; label?: string; className?: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      {label ? <p className="text-xs text-muted">{label}</p> : null}
      <div className={cx(GROUND[on], className)}>{children}</div>
    </div>
  );
}

/** A row of specimens that wraps. */
export function Row({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("flex flex-wrap items-center gap-3", className)}>{children}</div>;
}
