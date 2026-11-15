import { cx } from "@/lib/cx";
import { initials } from "@/lib/labels";

export type AvatarProps = {
  name: string;
  className?: string;
};

/** A square 40 px Stucco tile with mono initials. Never round. */
export function Avatar({ name, className }: AvatarProps) {
  return (
    <span
      aria-hidden="true"
      className={cx("tm-label grid size-10 shrink-0 place-items-center bg-stucco text-ink", className)}
    >
      {initials(name)}
    </span>
  );
}
