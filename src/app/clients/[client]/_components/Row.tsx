import Link from "next/link";
import type { ReactNode } from "react";
import { Eyebrow } from "@/components/Eyebrow";

/** One ruled row: a label in the first three columns, the content in the other nine, one rule through all of them. */
export function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="tm-wrap" aria-label={label}>
      <div className="tm-grid border-t border-rule">
        <div className="col-span-full py-5 tab:col-span-2 desk:col-span-3">
          <Eyebrow>{label}</Eyebrow>
        </div>
        <div className="col-span-full min-w-0 border-rule pt-5 pb-16 tab:col-span-6 tab:border-l tab:pl-(--tm-gutter) desk:col-span-9">
          {children}
        </div>
      </div>
    </section>
  );
}

/** A term and value list: mono label on the left, value beside it, stacked on a phone. */
export function SpecList({ items }: { items: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="flex flex-col gap-4">
      {items.map((item) => (
        <div key={item.label} className="flex flex-col gap-1 tab:flex-row tab:gap-(--tm-gutter)">
          <dt className="tm-label tm-muted shrink-0 tab:w-40 tab:pt-1">{item.label}</dt>
          <dd className="tm-text--m min-w-0 max-w-[66ch]">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** A plain text link back up the tree, with a 44 px tap area. */
export function BackLink({ href, children }: { href: string; children: string }) {
  return (
    <Link href={href} className="tm-text--s inline-flex min-h-11 items-center underline underline-offset-4">
      {children}
    </Link>
  );
}
