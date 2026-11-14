"use client";

import { useLayoutEffect, useRef } from "react";
import { Tag } from "@/components/Tag";
import { reveal } from "./reveal";
import type { ScoutRow } from "./schema";

export type NamedScoutRow = ScoutRow & { name: string };

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 0 });

/** Delay before each step: rows stream in, then the list sorts, then the top pick is marked. */
export const scoutDelays = (rows: number) => [400, ...Array<number>(rows - 1).fill(220), 900, 1000];

export function scoutProgress(rows: NamedScoutRow[], step: number) {
  return {
    shown: Math.min(step, rows.length),
    ranked: step > rows.length,
    picked: step > rows.length + 1,
  };
}

/**
 * The scouting list. Every row is laid out from the start and fades up on its step, so the table never
 * changes height. When the list sorts, each row slides from its old place to its new one.
 */
export function ScoutStage({ rows, step }: { rows: NamedScoutRow[]; step: number }) {
  const { shown, ranked, picked } = scoutProgress(rows, step);
  const order = ranked ? [...rows].sort((a, b) => b.score - a.score) : rows;
  const shownIds = new Set(rows.slice(0, shown).map((r) => r.id));

  const rowEls = useRef(new Map<string, HTMLTableRowElement>());
  const lastTops = useRef(new Map<string, number>());

  // Slide each row from where it was to where it is now. Positions are read relative to the table, so scrolling never counts as a move.
  useLayoutEffect(() => {
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    rowEls.current.forEach((el, id) => {
      const top = el.offsetTop;
      const last = lastTops.current.get(id);
      if (!still && last !== undefined && last !== top) {
        el.animate([{ transform: `translateY(${last - top}px)` }, { transform: "translateY(0)" }], {
          duration: 700,
          easing: "cubic-bezier(0.53, 0, 0, 1)",
        });
      }
      lastTops.current.set(id, top);
    });
  });

  return (
    // Fixed columns cut from the page grid, so every column starts on a grid line and a rank or tag arriving never moves its neighbors.
    // --c is one grid column. The table spans 4 columns on a phone, and 6 (tablet) or 9 (desktop) less the gutter it keeps from the rule.
    // It is measured in container units of the wrapper (100cqw is the table's width), because browsers ignore a column width that mixes % and px.
    <table className="w-full table-fixed border-collapse text-left [--c:calc((100cqw-3*var(--tm-gutter))/4)] tab:[--c:calc((100cqw-4*var(--tm-gutter))/6)] desk:[--c:calc((100cqw-7*var(--tm-gutter))/9)]">
      <colgroup>
        <col className="w-[calc(var(--c)+var(--tm-gutter))] tab:w-(--c)" />
        <col className="w-[calc(2*(var(--c)+var(--tm-gutter)))] desk:w-[calc(3*(var(--c)+var(--tm-gutter)))]" />
        <col className="tab:w-[calc(var(--c)+var(--tm-gutter))]" />
        <col className="max-tab:hidden desk:w-[calc(2*(var(--c)+var(--tm-gutter)))]" />
        <col className="max-desk:hidden" />
      </colgroup>
      <thead>
        <tr>
          <th scope="col" className="tm-label tm-muted w-16 pr-(--tm-gutter) pt-5 pb-5 font-medium">
            Rank
          </th>
          <th scope="col" className="tm-label tm-muted pr-(--tm-gutter) pt-5 pb-5 font-medium">
            Project
          </th>
          <th scope="col" className="tm-label tm-muted pr-(--tm-gutter) pt-5 pb-5 font-medium">
            Value
          </th>
          <th scope="col" className="tm-label tm-muted pr-(--tm-gutter) pt-5 pb-5 font-medium max-tab:hidden">
            Stage
          </th>
          <th scope="col" className="tm-label tm-muted pt-5 pb-5 font-medium max-desk:hidden">
            Found in
          </th>
        </tr>
      </thead>
      <tbody>
        {order.map((row) => {
          const rank = ranked ? order.indexOf(row) + 1 : null;
          const isPick = picked && rank === 1;
          return (
            <tr
              key={row.id}
              ref={(el) => {
                if (el) rowEls.current.set(row.id, el);
                else rowEls.current.delete(row.id);
              }}
              className={`border-t border-rule align-top ${reveal(shownIds.has(row.id))}`}
            >
              <td className="tm-text--m tm-num py-5 pr-(--tm-gutter)">{rank === null ? "" : String(rank).padStart(2, "0")}</td>
              <td className="py-5 pr-(--tm-gutter)">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <span className="tm-text--m">{row.name}</span>
                  {isPick ? <Tag variant="cone">Top pick</Tag> : null}
                </div>
                <p className="tm-text--s tm-muted mt-1">{row.city}</p>
              </td>
              <td className="tm-text--m tm-num py-5 pr-(--tm-gutter)">{money.format(row.value)}</td>
              <td className="tm-text--m py-5 pr-(--tm-gutter) max-tab:hidden">{row.stage}</td>
              <td className="tm-text--m py-5 max-desk:hidden">{row.kind}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
